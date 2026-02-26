# Mobile: Screenshare, Whiteboard & Meeting Features

Screenshare, whiteboard, host mute/unmute, and related meeting features work on web by default. On mobile they require app configuration and (for iOS screenshare) optional native setup. This doc covers what is implemented and how to enable them.

## Host: Mute & Unmute participants (fixed via Dashboard)

**Problem:** Host can mute participants but cannot unmute them (or unmute option is missing).

**Cause:** In 100ms, the host’s ability to mute and to **request unmute** is controlled by **role permissions** in the [100ms Dashboard](https://dashboard.100ms.live/), not by app code. The meeting UI (including HMSPrebuilt on mobile) only shows options that the current role is allowed to use.

**Fix:** In the 100ms Dashboard, edit the **role** used for the host (e.g. “host” or “moderator” in the template used for your meetings):

1. Open **Dashboard → Your app → Room templates** and select the template used for GrabDocs meetings (and the one used for mobile if different).
2. Open the **host** (or moderator) role.
3. Under **Permissions**, ensure **both** are enabled:
   - **Mute** – allows the host to mute a participant’s audio/video (applied immediately).
   - **Unmute** – allows the host to **request** that a participant unmute (the participant sees a prompt and can accept or decline).

If **Unmute** is off, the host will only see mute, not unmute. Enable it and save; no app rebuild needed. Same template/role is used for web and mobile, so fixing it once fixes both.

---

## Why mobile can differ from web

- **Web** uses the 100ms Web SDK and your room template; the browser handles screen capture and the prebuilt UI exposes all features the template allows.
- **Android** needs the screenshare activity and media projection permission in the manifest (done in this repo). The **100ms dashboard** must enable screenshare (and whiteboard if used) for the **role** used by mobile (e.g. the template used for mobile meetings).
- **iOS screenshare** is added automatically by an Expo config plugin (no Xcode needed); you must configure the App Group in the Apple Developer portal (see below).
- **Whiteboard** on mobile requires the room template to have whiteboard enabled in the dashboard; the prebuilt may show start/stop, but displaying the whiteboard uses a WebView with the URL from the SDK (see 100ms React Native whiteboard docs).

---

## Android: Screenshare

### Implemented in this repo

- **AndroidManifest.xml**
  - `HmsScreenshareActivity` from `com.reactnativehmssdk` is declared so the 100ms SDK can launch the screenshare flow.
  - `FOREGROUND_SERVICE_MEDIA_PROJECTION` is added for Android 14+.
- **app.config.js** (Expo config)
  - `android.permission.FOREGROUND_SERVICE_MEDIA_PROJECTION` is in the Android permissions list.

No extra code is required for Android screenshare beyond ensuring the **mobile meeting role** has **screenshare permission** in the [100ms Dashboard](https://dashboard.100ms.live/) (template used for mobile rooms).

---

## iOS: Screenshare (Expo config plugin – no Xcode needed)

**If you don’t have Xcode:** You can skip iOS screenshare. All other meeting features (host mute/unmute, whiteboard, chat, recording, Android screenshare, etc.) work on iOS without it. Only **“Share my screen” from an iPhone/iPad** needs the steps below. The app is built and submitted via EAS Build; only adding the Broadcast Extension requires opening the iOS project in Xcode (or having someone with Xcode add it once).

iOS screen share uses ReplayKit and a **Broadcast Upload Extension**. The app must:

1. Create the extension and App Group in Xcode.
2. Pass `appGroup` and `preferredExtension` into HMSPrebuilt so the SDK can start screenshare.

### 1. Native setup (Xcode)

- Open the iOS project (e.g. `npx expo prebuild` then open `ios/*.xcworkspace` in Xcode).
- Add a **Broadcast Upload Extension** target (no UI extension). Note the **target name** (e.g. `GrabDocsBroadcastUpload`).
- Add **App Groups** to both the main app target and the extension target, with the **same** App Group ID (e.g. `group.com.grabdocs.mobile`).
- In the extension target, replace `SampleHandler.swift` with the 100ms sample that uses `HMSBroadcastExtensionSDK` and `HMSScreenRenderer(appGroup: "group.com.grabdocs.mobile")` (use your App Group ID).
- In the **Podfile**, add a target for the extension and depend on `HMSBroadcastExtensionSDK`:

```ruby
target 'GrabDocsBroadcastUpload' do
  use_modular_headers!
  pod 'HMSBroadcastExtensionSDK'
end
```

- Run `pod install` in `ios/`.
- Build and run; ensure the extension and main app both have the same App Group and that the extension target name matches what you will pass as `preferredExtension`.

Full steps and SampleHandler code: [100ms React Native – Screen Share (iOS)](https://www.100ms.live/docs/react-native/v2/how-to-guides/set-up-video-conferencing/screenshare#ios-setup).

### 2. App config (this repo)

The app reads two env vars and passes them to HMSPrebuilt on iOS only:

- **EXPO_PUBLIC_HMS_IOS_APP_GROUP** – App Group ID (e.g. `group.com.grabdocs.mobile`).
- **EXPO_PUBLIC_HMS_IOS_PREFERRED_EXTENSION** – Extension **target name** in Xcode (e.g. `GrabDocsBroadcastUpload`).

Set them in EAS/Env (or `.env`) and rebuild the app. They are used in `constants/Config.ts` as `HMS_IOS_SCREENSHARE` and in `app/quick-reach/hms-meeting-interface.tsx` under `options.ios` for HMSPrebuilt.

If these are not set, iOS screenshare will not be available; Android and web are unaffected.

### 3. Verification (local, macOS only)

Before pushing an iOS build, you can confirm the Podfile and extension pod resolve correctly:

1. **Main app target name**  
   The plugin nests `GrabDocsBroadcastUpload` inside the main app target. It looks for a line like `target 'GrabDocs' do` or `target "GrabDocs" do`. If your app target name in Xcode is different (e.g. `GrabDocsApp`), set `MAIN_APP_TARGET_NAME` in `plugins/ios-hms-screenshare.js` to match, or rename the target to `GrabDocs`.

2. **Extension pod**  
   `HMSBroadcastExtensionSDK` is provided by the 100ms ecosystem (used with `@100mslive/react-native-hms`). The app uses `expo-build-properties` with `ios.deploymentTarget: "16.0"`; the extension pod is compatible with that. If you upgrade the 100ms SDK, ensure the extension pod version is still compatible.

3. **Run pod install locally (on macOS)**  
   After prebuild (e.g. `npx expo prebuild --platform ios --clean`), run:

   ```bash
   cd ios
   pod install --repo-update
   ```

   You should see **Pod installation complete!** with no errors. If you see "Unable to find host target(s) for GrabDocsBroadcastUpload", the extension target is not nested inside the main app target in the Podfile; the plugin’s line-based insertion and extension is nested in the main app target and does **not** declare `use_frameworks!` (the plugin does this so CocoaPods host detection works with RN 0.81 + Expo + static frameworks). On Windows, `ios/` is not generated by prebuild; use EAS Build (or a Mac) to verify.

---

## Whiteboard

- **Dashboard:** In the [100ms Dashboard](https://dashboard.100ms.live/), enable **whiteboard** for the **room template** used for mobile meetings, and give the appropriate **role(s)** whiteboard permissions (e.g. start/stop, write, read).
- **Prebuilt:** The React Native prebuilt (HMSPrebuilt) may show whiteboard start/stop if the role has permission. Displaying the whiteboard itself is done by loading the whiteboard URL in a **WebView** (see [100ms React Native – Whiteboard](https://www.100ms.live/docs/react-native/v2/how-to-guides/extend-capabilities/whiteboard)). The prebuilt kit may not include that WebView; if whiteboard appears to “not work” on mobile, check that (1) the template has whiteboard enabled and (2) the prebuilt or your code shows the whiteboard URL in a WebView when it’s started.

---

## Other meeting features (chat, recording, etc.)

- Ensure the **mobile room template** in the 100ms dashboard has the same capabilities you use on web (e.g. chat, recording, etc.) and that the **role** used for mobile join has the right permissions.
- Token generation is already done via your backend; the same template/role used for mobile should align with what you use for web so behavior is consistent.

---

## All available options – make sure they work

Meeting controls (mute, unmute, screenshare, whiteboard, chat, recording, etc.) are driven by the **100ms template and roles**. The app (and HMSPrebuilt) only shows and executes what the backend token’s role allows. Use this checklist so all options work the same on web and mobile:

| What to check | Where | Notes |
|---------------|--------|--------|
| **Host can mute participants** | Dashboard → Template → Host role → Permissions | Enable **Mute**. |
| **Host can unmute participants** | Dashboard → Template → Host role → Permissions | Enable **Unmute** (request unmute). |
| **Screenshare** | Dashboard → Template → Roles | Enable **screenshare** for the role(s) that may share; Android also needs the app manifest (already done in this repo). |
| **Whiteboard** | Dashboard → Template → Room & roles | Enable whiteboard for the room/template and give roles whiteboard permissions. |
| **Chat** | Dashboard → Template → Roles | Enable **chat** for the roles that should see/send chat. |
| **Recording** | Dashboard → Template → Roles | Enable **recording** (start/stop) for host/moderator if used. |
| **Change role / Remove peer** | Dashboard → Template → Roles | Enable **change role** and **remove peer** for host if you want those controls. |

After changing any permission, save the template. No app rebuild is required for permission changes; they take effect on the next join. If an option still doesn’t appear on mobile, confirm the **mobile join** uses the same template (and thus the same role) as web.

---

## Quick checklist

| Feature           | Web        | Android (app) | Android (dashboard) | iOS (app) | iOS (dashboard) |
|------------------|------------|----------------|----------------------|-----------|-----------------|
| Host mute/unmute | ✅         | N/A            | Host role: **Mute** + **Unmute** on | N/A      | Same (template/role) |
| Screenshare      | ✅         | ✅ Activity + permission added | Role: screenshare on  | ✅ Expo plugin adds extension (no Xcode) | Role: screenshare on |
| Whiteboard       | ✅         | N/A            | Template + role: whiteboard on | N/A       | Template + role: whiteboard on |
| Chat / Recording | ✅         | N/A            | Template + role      | N/A       | Template + role |

After changing dashboard template/roles or adding the iOS extension and env vars, rebuild the app only when you change native code or env vars; permission changes apply on next join. iOS screenshare does not work in Simulator.

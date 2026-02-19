# Picture-in-Picture (PiP) — Mobile Setup and Verification

This doc summarizes what is implemented for meeting PiP and how to verify/fix PiP on Android and iOS.

## Showing camera/video in PiP (avoiding black screen)

If the PiP window shows a black screen with only the participant name (no video):

- **iOS**
  1. **Multitasking Camera Access** must be approved and in your provisioning profile: [Request Multitasking Camera Access](https://developer.apple.com/contact/request/multitasking-camera-access/). Without it, the system blocks camera in PiP and you get a placeholder or black screen.
  2. Build with a profile that includes this capability.
  3. The 100ms Room Kit uses `useActiveSpeaker: true` by default; video in PiP is controlled by the SDK and the above entitlement.
- **Android**
  1. Activity must have `android:configChanges` including `screenSize|smallestScreenSize|screenLayout` (see [plugins/android-pip.js](../plugins/android-pip.js) and [AndroidManifest](../android/app/src/main/AndroidManifest.xml)).
  2. Test on a **physical** device (API 26+); many emulators show black or placeholder in PiP.
  3. PiP content is drawn by the 100ms SDK; if you still see black after the above, check [100ms React Native PiP docs](https://www.100ms.live/docs/react-native/v2/how-to-guides/set-up-video-conferencing/render-video/pip-mode) and your SDK version—there is no app-level override to force video in PiP.

## Android

### Implemented

- **Manifest:** `android:supportsPictureInPicture="true"` and `android:resizeableActivity="true"` on the main activity (via [plugins/android-pip.js](../plugins/android-pip.js) and [AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml)).
- **100ms:** `HMSPrebuilt` with `autoEnterPipMode={true}`; MainActivity forwards `onUserLeaveHint()` and `onPictureInPictureModeChanged()` to `HMSManager`.
- **Phase 2 Option B:** When the app goes to background during a meeting, we call the native module `GrabDocsPipModule.enterPipForMeeting()` to explicitly enter PiP (in case 100ms auto PiP has not armed in time).
- **Option C fallback:** If PiP did not activate after ~450 ms, we show “In GrabDocs meeting – Tap to return” notification (no in-app bubble).
- **Logging:** `GrabDocsPiP` logs in MainActivity (`onUserLeaveHint`, `onPictureInPictureModeChanged`) for debugging.

### Verification

1. Confirm [android/app/src/main/AndroidManifest.xml](../android/app/src/main/AndroidManifest.xml) has on the main activity:
   - `android:supportsPictureInPicture="true"`
   - `android:resizeableActivity="true"`
2. Test on a **physical** Android 10+ device (many emulators do not handle PiP correctly).
3. Join a meeting, then press **Home** or switch app (do not use in-app Back; that minimizes to the bubble only).
4. Check logcat for `GrabDocsPiP` to confirm `onUserLeaveHint` and (if applicable) PiP mode changes.

---

## iOS

### Implemented

- **app.json:** `UIBackgroundModes: ["voip"]`; plugin [plugins/ios-pip.js](../plugins/ios-pip.js) adds the **Multitasking Camera Access** entitlement (`com.apple.developer.avfoundation.multitasking-camera-access`).
- **100ms:** `autoEnterPipMode={true}` on HMSPrebuilt (Room Kit); iOS PiP relies on 100ms’s native PiP controller and the above config.

### Verification (production iOS PiP)

iOS PiP for camera/meetings is more restricted than Android. Confirm:

1. **Entitlement**
   - Request **Multitasking Camera Access** from Apple if not already granted:  
     [Request Multitasking Camera Access](https://developer.apple.com/contact/request/multitasking-camera-access/).
   - In Apple Developer: ensure the App ID has this capability and that the **provisioning profile** used for the build includes it. Without approval, PiP can silently fail.

2. **AVAudioSession**
   - 100ms should set the audio session to `AVAudioSessionCategoryPlayAndRecord` with options such as `.allowBluetooth`, `.defaultToSpeaker`, `.mixWithOthers`. If 100ms does not configure this correctly, iOS may not allow PiP. Check 100ms React Native / iOS docs or their SDK for the required audio session setup.

3. **Behavior**
   - iOS does not use `onUserLeaveHint`; it uses `AVPictureInPictureController` / `AVPlayerLayer` (or equivalent). Production iOS PiP depends on:
     - Entitlement approval and inclusion in the provisioning profile,
     - Correct AVAudioSession configuration from 100ms,
     - 100ms using the native PiP controller when the app goes to background.

---

## Back vs background

- **Back button (or in-app “minimize”)** → Navigate back to the meeting list; the call stays connected. User can return to the meeting by tapping the **active meeting card** on the Meeting Call screen. No in-app bubble.
- **Home / app switch (app backgrounded)** → **System PiP** should show the meeting in a small window; we also trigger native `enterPipForMeeting` (Android) and, if PiP does not activate, show a "Tap to return" notification only.

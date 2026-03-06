# EAS iOS single-profile signing (app + Broadcast Extension)

Both **com.grabdocs.mobile** and **com.grabdocs.mobile.GrabDocsBroadcastUpload** build correctly with screen sharing by using **Xcode Automatic Signing** for both targets. No manual provisioning profile mapping — which is what kept breaking CI.

## Overview

- **App** → Automatic signing  
- **Extension** → Automatic signing  

Same distribution certificate; Apple (and EAS) pick the correct provisioning profiles. No `EXT_PROVISIONING_PROFILE_BASE64` or profile UUID patching.

---

## Step 1 — Clean out old credentials

Remove all cached signing credentials from Expo so the next build starts fresh.

1. Run:
   ```bash
   eas credentials -p ios
   ```
2. Select **iOS** → **production** (or the profile you use for App Store).
3. **Delete** for both **com.grabdocs.mobile** and **com.grabdocs.mobile.GrabDocsBroadcastUpload**:
   - Distribution certificate
   - Provisioning profile  
4. Leave nothing in Expo credentials for that profile.

---

## Step 2 — Verify Apple Developer configuration

1. Open [Identifiers](https://developer.apple.com/account/resources/identifiers/list).

2. **Main app**  
   - Identifier: `com.grabdocs.mobile`  
   - Capabilities: **App Groups** → `group.com.grabdocs.mobile`

3. **Broadcast extension**  
   - Identifier: `com.grabdocs.mobile.GrabDocsBroadcastUpload`  
   - Capabilities: **App Groups** → `group.com.grabdocs.mobile`, **Broadcast Upload Extension**  
   - If **Broadcast Upload Extension** is missing, add it.

4. **App Groups**  
   - In **Identifiers → App Groups**, ensure `group.com.grabdocs.mobile` exists and is attached to both identifiers above.

---

## Step 3 — Entitlements (handled by project)

- **Extension**: `ios/GrabDocsBroadcastUpload/GrabDocsBroadcastUpload.entitlements`  
  - Contains `com.apple.security.application-groups` → `group.com.grabdocs.mobile`  
  - Created by the `ios-hms-screenshare` config plugin; `scripts/ensure-extension-entitlements.js` can fix/verify after prebuild.

- **Main app**: `ios/GrabDocs/GrabDocs.entitlements`  
  - Also includes `com.apple.security.application-groups` → `group.com.grabdocs.mobile`  
  - Set via `withAppGroupEntitlements` in the plugin.

---

## Step 4 — No manual signing in the project

The config plugin and EAS build **do not** set:

- `PROVISIONING_PROFILE`
- `PROVISIONING_PROFILE_SPECIFIER`
- `CODE_SIGN_IDENTITY`

**CODE_SIGN_STYLE = Automatic** is enforced in `plugins/ios-hms-screenshare.js` in two ways:

1. **All native targets**  
   A `withXcodeProject` mod iterates every target from `pbxNativeTargetSection()`, and for each target’s build configuration list sets `CODE_SIGN_STYLE = Automatic` and strips manual signing keys. That covers **GrabDocs**, **GrabDocsBroadcastUpload**, and any other native targets regardless of name or bundle ID, and avoids Expo regeneration reintroducing manual signing.

2. **Bundle-ID safety net**  
   The `withPbxprojExtensionTargetDependency` (dangerous mod) also forces automatic signing for the main app and extension bundle IDs when it writes `project.pbxproj`, so both targets stay correct even if the project structure changes.

---

## Step 5 — Gymfile (no profile mapping)

The EAS build workflow (`.eas/build/ios-production.yml`) writes a minimal Gymfile:

- `workspace`, `scheme`, `configuration`, `clean false`
- `export_method "app-store"`
- `export_team_id "Q33K3Q7Q53"`
- `output_directory`, `output_name`

**No** `skip_profile_detection`, **no** `export_options(provisioningProfiles: ...)`.

---

## Step 6 — Clear EAS cache and build

1. Clear cache and build:
   ```bash
   eas build --platform ios --profile production --clear-cache
   ```
2. Or from CI (e.g. GitHub Actions): no `EXT_PROVISIONING_PROFILE_BASE64` secret; workflow runs prebuild and EAS handles credentials.

Expo/EAS will:

- Create or use the distribution certificate
- Create provisioning profiles for app and extension
- Use automatic signing for both targets

---

## Step 7 — Verify in logs

After the build starts you should see logs like:

- `Using Automatic signing for target GrabDocs`
- `Using Automatic signing for target GrabDocsBroadcastUpload`

You should **not** see “Detected provisioning profile mapping” or manual profile UUID assignment for the extension.

---

## Expected result

- Build succeeds without “profile doesn’t include certificate”, “profile doesn’t support app group”, or “profile mismatch”.
- Screen share keeps working: entitlements, app group, and Broadcast Upload Extension capability are correct. Signing method does not change runtime behaviour.

---

## Common mistakes

1. **App group missing from extension identifier**  
   Most common cause of failure. Ensure `com.grabdocs.mobile.GrabDocsBroadcastUpload` has **App Groups** and **Broadcast Upload Extension**, and that `group.com.grabdocs.mobile` is attached.

2. **Old profiles cached by Expo**  
   Run `eas credentials -p ios`, delete credentials for the build profile, then build with `--clear-cache`.

3. **Manual profile specifiers left in project**  
   Any `PROVISIONING_PROFILE` or `PROVISIONING_PROFILE_SPECIFIER` in `project.pbxproj` can break automatic signing. The plugin strips these for both targets at prebuild.

---

## Architecture summary

**Apple Developer**

- Distribution certificate  
- App ID: `com.grabdocs.mobile`  
- App ID: `com.grabdocs.mobile.GrabDocsBroadcastUpload`  
- App Group: `group.com.grabdocs.mobile`  

**Xcode / EAS**

- Both targets: **CODE_SIGN_STYLE = Automatic**
- EAS generates distribution certificate and provisioning profiles; Xcode uses them automatically.

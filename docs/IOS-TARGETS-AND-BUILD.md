# iOS targets and build – quick reference

## What are “targets”?

In iOS/Xcode and CocoaPods, a **target** is one build product (one binary).

| Target name               | What it is        | Output        | Where it’s defined |
|---------------------------|-------------------|---------------|--------------------|
| **GrabDocs**              | Main app          | The .ipa app  | Xcode: `ios/GrabDocs.xcodeproj/project.pbxproj`<br>CocoaPods: `ios/Podfile` |
| **GrabDocsBroadcastUpload** | Broadcast Upload Extension (100ms screen share) | .appex inside the app | Same: `project.pbxproj` + `Podfile` |

- **Xcode project** (`project.pbxproj`): lists targets, build phases (e.g. “Embed App Extensions”), and build settings. The Expo config plugin **plugins/ios-hms-screenshare.js** creates the extension target and the “Embed App Extensions” phase here.
- **Podfile**: tells CocoaPods which targets get which pods. The extension **must** be nested inside the main app target so CocoaPods knows the “host” (GrabDocs) of the extension (GrabDocsBroadcastUpload). The plugin and **scripts/ensure-podfile-extension.js** add that nesting.

Names are **case-sensitive** and must match exactly: `GrabDocs` and `GrabDocsBroadcastUpload`.

## Do I need to deploy the backend for the iOS build?

**No.** The iOS build only compiles the app and extension; it does not call your API. Deploy the backend when you want the **running app** (after install) to talk to that environment.

## If EAS assigns the same provisioning profile to both targets

If build logs show the **same** provisioning profile being assigned to both `GrabDocs` and `GrabDocsBroadcastUpload`, EAS has only one profile stored. See **[EAS-IOS-EXTENSION-CREDENTIALS-FIX.md](./EAS-IOS-EXTENSION-CREDENTIALS-FIX.md)** for how to delete iOS credentials and force EAS to create a separate profile for the extension.

## If “Unable to find host target(s) for GrabDocsBroadcastUpload” still appears

1. In the GitHub Actions run, open the **“Verify Podfile and install Pods”** step and check:
   - Did **“Ensure Podfile extension block (safety net)”** log `✅ Extension block inserted`?
   - In **“FULL PODFILE”**, is there a block like:
     ```ruby
     target 'GrabDocsBroadcastUpload' do
       platform :ios, '16.0'
       inherit! :search_paths
       pod 'HMSBroadcastExtensionSDK'
     end
     ```
     and is it **inside** `target 'GrabDocs' do ... end`?
2. If the ensure script failed, it will print the first 50 lines of the Podfile so we can see the exact format (e.g. `target "GrabDocs"` vs `target 'GrabDocs'`).
3. Download the **ios-podfile-debug** artifact from the failed run and share the `Podfile` (and, if needed, the relevant log snippet) so we can match the exact format.

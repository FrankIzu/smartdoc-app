# Android App Links Setup Guide

## Current Status

You're in **closed testing**, which means Android App Links need to be configured with the correct SHA-256 fingerprint from Google Play App Signing.

## How to Get Your SHA-256 Fingerprint

### Option 1: Google Play Console (Recommended for Closed Testing)

1. Go to [Google Play Console](https://play.google.com/console)
2. Select your app: **GrabDocs**
3. Navigate to: **Release** → **Setup** → **App signing**
4. Look for **"App signing key certificate"** section
5. Copy the **SHA-256 certificate fingerprint**

**Important:** Use the **App signing key certificate** fingerprint, NOT the upload key certificate fingerprint.

### Option 2: From Your Upload Certificate (If Not Using Play App Signing)

If you're not using Google Play App Signing, get the fingerprint from your upload keystore:

```bash
# Replace 'your-keystore.jks' with your actual keystore file
keytool -list -v -keystore your-keystore.jks -alias your-key-alias

# Look for "SHA256:" in the output
```

### Option 3: From an Installed APK/AAB

```bash
# For APK
keytool -printcert -jarfile your-app.apk | grep SHA256

# For AAB (extract first, then check)
# Or use Google Play Console method above
```

## Update assetlinks.json

Once you have your SHA-256 fingerprint, update the file:

**File:** `frontend/public/.well-known/assetlinks.json`

**Current value:**
```json
{
  "sha256_cert_fingerprints": [
    "SHA256 Fingerprint: 58:E1:31:36:B1:86:A9:D0:AF:06:FD:65:1A:9D:1E:45:B2:C7:A8:DE:01:15:F9:49:"
  ]
}
```

**Format:** The fingerprint should be in format: `XX:XX:XX:XX:...` (colon-separated, uppercase)

**Example:**
```json
{
  "sha256_cert_fingerprints": [
    "3D:FB:8A:E6:39:F8:50:A9:21:F1:77:3F:DE:08:F1:58:29:82:42:85:78:28:8E:73:A6:08:28:58:28:AC:16:14"
  ]
}
```

## Multiple Fingerprints (Optional)

If you want to support both debug and release builds, you can include multiple fingerprints:

```json
{
  "sha256_cert_fingerprints": [
    "RELEASE_FINGERPRINT_HERE",
    "DEBUG_FINGERPRINT_HERE"
  ]
}
```

**Note:** For production, you typically only need the release/production fingerprint.

## Verify Configuration

After updating `assetlinks.json` and deploying:

1. **Test file accessibility:**
   ```
   https://api.grabdocs.com/.well-known/assetlinks.json
   ```
   Should return JSON with `Content-Type: application/json`

2. **Use Google's validator:**
   ```
   https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://api.grabdocs.com&relation=delegate_permission/common.handle_all_urls
   ```
   Should return your app's statement

3. **Test on device:**
   - Install app from closed testing track
   - Open Chrome browser
   - Navigate to: `https://api.grabdocs.com/join-meeting?meeting_id=12345678`
   - Should automatically open the app

## Common Issues

### App Links Not Working

1. **Wrong fingerprint:** Most common issue - verify fingerprint matches exactly
2. **File not accessible:** Ensure `assetlinks.json` is served over HTTPS
3. **Wrong Content-Type:** Must be `application/json`, not `text/plain`
4. **App not installed:** App Links only work if app is installed
5. **Verification failed:** Android verifies on install - reinstall app after updating `assetlinks.json`

### Debugging

1. Check Android logs:
   ```bash
   adb logcat | grep -i "intentfilter"
   ```

2. Test verification:
   ```bash
   adb shell pm get-app-links com.grabdocs.mobile
   ```

3. Force verification:
   ```bash
   adb shell pm verify-app-links --re-verify com.grabdocs.mobile
   ```

## Next Steps

1. ✅ Get SHA-256 fingerprint from Google Play Console
2. ✅ Update `frontend/public/.well-known/assetlinks.json`
3. ✅ Deploy frontend
4. ✅ Verify file is accessible
5. ✅ Test on Android device with app installed
6. ✅ Test notification appears when app not installed

## Important Notes

- **Google Play App Signing:** If using Play App Signing (recommended), use the **App signing key certificate** fingerprint, not the upload key
- **Closed Testing:** App Links work the same in closed testing as production
- **Verification:** Android verifies App Links when the app is installed - if you update `assetlinks.json`, users may need to reinstall the app
- **Multiple Builds:** You can include multiple fingerprints for different build types (debug, release, etc.)

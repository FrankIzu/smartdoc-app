# Mobile Deep Linking Implementation - Complete

## ✅ Implementation Status

All frontend code has been implemented. The mobile deep linking infrastructure is ready, but requires a few configuration values from you.

## 📋 What Was Implemented

### 1. Mobile Detection Utilities (`frontend/src/utils/mobileDeepLink.ts`)
- ✅ Mobile device detection (iOS/Android)
- ✅ Universal Link generation (HTTPS URLs)
- ✅ Custom scheme link generation (`grabdocs://`)
- ✅ App open detection using Page Visibility API
- ✅ Timeout handling (2.5 seconds)
- ✅ Notification dismissal tracking

### 2. Mobile App Notification Component (`frontend/src/components/MobileAppNotification.tsx`)
- ✅ "Opening app..." state
- ✅ "Install app" state with store links
- ✅ "Continue in browser" option
- ✅ Dismissible with localStorage persistence
- ✅ Platform-specific store links (iOS/Android)

### 3. Next.js Configuration (`frontend/next.config.js`)
- ✅ Headers configured for `.well-known` files
- ✅ Content-Type: application/json for both files

### 4. Universal Links Configuration Files
- ✅ `frontend/public/.well-known/apple-app-site-association` (iOS)
- ✅ `frontend/public/.well-known/assetlinks.json` (Android - already existed)

### 5. Mobile App Configuration (`app.json`)
- ✅ iOS: Added `associatedDomains` for Universal Links
- ✅ Android: Added intent filters for `/join-meeting` and `/meeting` paths

### 6. Page Integrations
- ✅ `frontend/src/pages/join-meeting.tsx` - Auto-attempts app open on mobile
- ✅ `frontend/src/pages/meeting/[id].tsx` - Shows notification if app doesn't open

## 🔧 What You Need to Provide

### 1. Apple Team ID (REQUIRED for iOS Universal Links)

**File:** `frontend/public/.well-known/apple-app-site-association`

**Current value:**
```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appID": "TEAM_ID.com.grabdocs.mobile",
        ...
      }
    ]
  }
}
```

**Action Required:**
1. Get your Apple Developer Team ID:
   - Go to [Apple Developer Account](https://developer.apple.com/account)
   - Navigate to Membership → Team ID
   - Copy the 10-character Team ID (e.g., `ABC123XYZ0`)
2. Replace `TEAM_ID` in the file with your actual Team ID
3. The file should look like: `"appID": "ABC123XYZ0.com.grabdocs.mobile"`

**Where to find it:**
- Apple Developer Portal: https://developer.apple.com/account → Membership
- Xcode: Project Settings → Signing & Capabilities → Team → Team ID

### 2. iOS App Store URL (REQUIRED for App Store button)

**File:** `frontend/src/components/MobileAppNotification.tsx`

**Current value:**
```typescript
const APP_STORE_URL = 'https://apps.apple.com/app/grabdocs/id[APP_ID]';
```

**Action Required:**
1. Get your iOS App Store ID:
   - Go to [App Store Connect](https://appstoreconnect.apple.com)
   - Find your app → App Information → Apple ID
   - Or use the App Store URL format: `https://apps.apple.com/app/grabdocs/id[APP_ID]`
2. Replace `[APP_ID]` with your actual App Store ID number
3. Example: `https://apps.apple.com/app/grabdocs/id1234567890`

**Note:** If your app isn't in the App Store yet, you can leave this placeholder for now, but users won't be able to install from the notification until it's updated.

### 3. Google Play Store URL (OPTIONAL - Already configured)

**File:** `frontend/src/components/MobileAppNotification.tsx`

**Current value:**
```typescript
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.grabdocs.mobile';
```

**Status:** ✅ Already configured correctly

### 4. Domain Verification (REQUIRED for Universal Links to work)

**iOS Universal Links:**
- Apple automatically verifies `apple-app-site-association` when the app is installed
- File must be accessible at: `https://api.grabdocs.com/.well-known/apple-app-site-association`
- Must return `Content-Type: application/json`
- Must be served over HTTPS
- No redirects allowed

**Android App Links:**
- Android automatically verifies `assetlinks.json` when the app is installed
- File must be accessible at: `https://api.grabdocs.com/.well-known/assetlinks.json`
- Must return `Content-Type: application/json`
- Must be served over HTTPS
- SHA-256 fingerprint in file must match your app's signing certificate

**Action Required:**
1. Deploy the frontend with the `.well-known` files
2. Verify files are accessible:
   - `https://api.grabdocs.com/.well-known/apple-app-site-association`
   - `https://api.grabdocs.com/.well-known/assetlinks.json`
3. Test that both return JSON with correct Content-Type headers

## 🚀 Deployment Checklist

### Before Deploying:
- [ ] Replace `TEAM_ID` in `apple-app-site-association` with your Apple Team ID
- [ ] Replace `[APP_ID]` in `MobileAppNotification.tsx` with your iOS App Store ID (if app is published)
- [ ] Verify `assetlinks.json` SHA-256 fingerprint matches your production signing certificate

### After Deploying:
- [ ] Test `https://api.grabdocs.com/.well-known/apple-app-site-association` returns JSON
- [ ] Test `https://api.grabdocs.com/.well-known/assetlinks.json` returns JSON
- [ ] Verify Content-Type headers are `application/json` (not `text/plain`)
- [ ] Test on iOS device: Click a join-meeting link → Should open app if installed
- [ ] Test on Android device: Click a join-meeting link → Should open app if installed
- [ ] Test notification appears when app is not installed
- [ ] Test "Continue in browser" works correctly

## 📱 Mobile App Team Requirements

The mobile app team needs to implement deep link handlers:

### iOS (Swift/React Native):
1. Handle Universal Link: `https://api.grabdocs.com/join-meeting?meeting_id=XXX&passcode=YYY`
2. Handle custom scheme: `grabdocs://join-meeting?meeting_id=XXX&passcode=YYY`
3. Extract `meeting_id` and `passcode` from URL
4. Navigate to meeting screen
5. Auto-join meeting (generate token, connect to HMS)

### Android (Kotlin/React Native):
1. Handle App Link: `https://api.grabdocs.com/join-meeting?meeting_id=XXX&passcode=YYY`
2. Handle custom scheme: `grabdocs://join-meeting?meeting_id=XXX&passcode=YYY`
3. Extract `meeting_id` and `passcode` from intent
4. Navigate to meeting screen
5. Auto-join meeting (generate token, connect to HMS)

**Note:** The app already handles `grabdocs://login-success` for OAuth, so the infrastructure exists. They just need to add handlers for `join-meeting` paths.

## 🔍 Testing Guide

### Test Universal Links (iOS):
1. Install app on iOS device
2. Open Safari
3. Navigate to: `https://api.grabdocs.com/join-meeting?meeting_id=12345678`
4. Should automatically open the app

### Test App Links (Android):
1. Install app on Android device
2. Open Chrome
3. Navigate to: `https://api.grabdocs.com/join-meeting?meeting_id=12345678`
4. Should automatically open the app

### Test Fallback (App Not Installed):
1. Uninstall app from device
2. Open browser
3. Navigate to: `https://api.grabdocs.com/join-meeting?meeting_id=12345678`
4. Should show notification banner with "Install app" and "Continue in browser" options

### Test Custom Scheme Fallback:
1. Install app
2. Open browser
3. Navigate to: `https://api.grabdocs.com/join-meeting?meeting_id=12345678`
4. If Universal Link doesn't work, should fallback to `grabdocs://` scheme

## 📝 Files Created/Modified

### New Files:
- `frontend/src/utils/mobileDeepLink.ts`
- `frontend/src/components/MobileAppNotification.tsx`
- `frontend/public/.well-known/apple-app-site-association`

### Modified Files:
- `frontend/next.config.js` - Added headers for `.well-known` files
- `frontend/src/pages/join-meeting.tsx` - Added mobile deep linking logic
- `frontend/src/pages/meeting/[id].tsx` - Added mobile deep linking logic
- `app.json` - Added iOS `associatedDomains` and Android intent filters

### Unchanged Files:
- `frontend/public/.well-known/assetlinks.json` - Already correct (no changes needed)

## ⚠️ Important Notes

1. **Domain:** Using `api.grabdocs.com` for Universal Links (as per your selection)
2. **Custom Scheme:** Falls back to `grabdocs://` if Universal Links fail
3. **Timeout:** 2.5 seconds wait for app to open before showing notification
4. **Notification:** Only shows on mobile devices, only on `/join-meeting` and `/meeting/*` pages
5. **Dismissal:** User can dismiss notification, preference saved in localStorage

## 🎯 Next Steps

1. **Get Apple Team ID** and update `apple-app-site-association` file
2. **Get iOS App Store ID** and update `MobileAppNotification.tsx` (if app is published)
3. **Deploy frontend** and verify `.well-known` files are accessible
4. **Coordinate with mobile app team** to implement app-side deep link handlers
5. **Test on real devices** (iOS and Android)
6. **Monitor** deep link success/failure rates

## 📞 Support

If you encounter issues:
1. Check browser console for deep link logs (prefixed with `📱 [DEEP-LINK]`)
2. Verify `.well-known` files are accessible and return correct Content-Type
3. Test Universal Links using Apple's validator: https://search.developer.apple.com/appsearch-validation-tool/
4. Test App Links using Google's validator: https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://api.grabdocs.com&relation=delegate_permission/common.handle_all_urls

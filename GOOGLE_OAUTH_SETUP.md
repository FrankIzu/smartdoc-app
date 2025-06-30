# Google OAuth Setup for GrabDocs Mobile

## Issue: Missing Google Client ID

The error "missing required parameter: client_id" occurs because Google OAuth is not properly configured for the mobile app.

## Quick Fix for Development

### Option 1: Use Expo's Development Client ID (Temporary)
For testing purposes, you can use Expo's development client ID:

1. **Update constants/Config.ts**:
```typescript
// OAuth Configuration
export const GOOGLE_CLIENT_ID = '603386649315-vp4revvrcgrcjme51ebuhbkbspl048l9.apps.googleusercontent.com'; // Expo development client ID
```

### Option 2: Create Your Own Google OAuth Client ID (Recommended)

#### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com
2. Create a new project or select existing project
3. Enable Google+ API and People API

#### Step 2: Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Application type: **"Android"** for Android app
4. Application type: **"iOS"** for iOS app

#### Step 3: Configure for Mobile App
For **Android**:
- Package name: `com.grabdocs.mobile`
- SHA-1 certificate fingerprint: Get from `expo credentials:manager`

For **iOS**:
- Bundle ID: `com.grabdocs.mobile`

#### Step 4: Update App Configuration
1. **Add to constants/Config.ts**:
```typescript
export const GOOGLE_CLIENT_ID = 'your-client-id.googleusercontent.com';
```

2. **Or set environment variable**:
```bash
export EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-client-id.googleusercontent.com
```

## Current Status
- ❌ Google client ID not configured
- ❌ OAuth authentication failing
- ✅ App structure ready for OAuth

## Testing the Fix

After adding the client ID:

1. **Restart Expo**:
```bash
npx expo start --clear
```

2. **Test Google Sign-In**:
- Try signing in with Google
- Should now work without "client_id" error

## Alternative: Disable Google Auth (Temporary)

If you want to skip Google OAuth for now:

1. **Comment out Google sign-in button** in auth screens
2. **Focus on email/password authentication**
3. **Add Google OAuth later**

## Production Setup

For production builds:
1. Create production OAuth credentials
2. Add to EAS environment variables
3. Update redirect URIs for production domains

## Files Modified
- `constants/Config.ts` - Added Google client ID configuration
- `services/googleAuth.ts` - Updated to use configured client ID
- App now properly initializes Google OAuth

## Next Steps
1. Choose Option 1 (temporary) or Option 2 (permanent)
2. Update the client ID in Config.ts
3. Restart the app
4. Test Google sign-in functionality 
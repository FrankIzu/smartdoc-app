# Google OAuth Fix for GrabDocs Mobile

## Current Issue
Google Sign-In is failing with "Error 400: invalid_request" because the redirect URI is not properly configured.

**Error Details:**
- `redirect_uri=exp://192.168.1.3:8081/--/auth`
- This redirect URI is not registered with the Google OAuth client

## Root Cause
The app is trying to use Expo's development client ID (`603386649315-vp4revvrcgrcjme51ebuhbkbspl048l9.apps.googleusercontent.com`) but this client has specific redirect URI requirements that don't match our current setup.

## Solution Options

### Option 1: Create Your Own Google OAuth Client (Recommended)

#### Step 1: Create Google Cloud Project
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project: "GrabDocs Mobile"
3. Enable the Google+ API and People API

#### Step 2: Create OAuth 2.0 Credentials
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Application type: **"Web application"** (for Expo development)
4. Name: "GrabDocs Mobile Development"

#### Step 3: Configure Authorized Redirect URIs
Add these redirect URIs to your OAuth client:
```
https://auth.expo.io/@your-expo-username/grabdocs
exp://192.168.1.3:8081/--/auth
exp://localhost:8081/--/auth
```

#### Step 4: Update App Configuration
1. Copy your new Client ID
2. Set environment variable:
```bash
export EXPO_PUBLIC_GOOGLE_CLIENT_ID=your-new-client-id.googleusercontent.com
```

### Option 2: Use Expo AuthSession with Proxy (Alternative)

Update the Google Auth service to use Expo's auth proxy:

```typescript
// In services/googleAuth.ts
const redirectUri = AuthSession.makeRedirectUri({
  useProxy: __DEV__, // Use proxy in development
  scheme: 'grabdocs',
});
```

### Option 3: Temporarily Disable Google OAuth

For immediate testing, disable Google OAuth:
1. Google OAuth is currently disabled in `constants/Config.ts`
2. Users will see a message: "Google OAuth is not configured"
3. Focus on email/password authentication for now

## Current Status
- ✅ Google OAuth temporarily disabled to prevent errors
- ✅ Clear error messages for users
- ❌ Google OAuth not functional
- ✅ Email/password authentication still works

## Testing Steps

After implementing Option 1:
1. Set your new `EXPO_PUBLIC_GOOGLE_CLIENT_ID`
2. Restart Expo: `npx expo start --clear`
3. Test Google Sign-In
4. Should work without redirect URI errors

## Files Modified
- `constants/Config.ts` - Disabled Google OAuth temporarily
- `services/googleAuth.ts` - Added better error handling
- `GOOGLE_OAUTH_FIX.md` - This documentation

## Next Steps
1. Choose Option 1 (create your own OAuth client) - **RECOMMENDED**
2. Or implement Option 2 (use Expo proxy)
3. Test the implementation
4. Re-enable Google OAuth once working

## Production Considerations
- Create separate OAuth clients for development and production
- Use EAS environment variables for production
- Ensure redirect URIs match your production domains 
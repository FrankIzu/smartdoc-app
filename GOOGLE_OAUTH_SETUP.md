# Google OAuth Setup for GrabDocs

This guide will help you set up Google OAuth that works regardless of network changes.

## Current Issue
- Google OAuth is failing with "Error 404, invalid_request"
- Redirect URI uses dynamic IP addresses that change with network
- Missing Google OAuth client configuration

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one:
   - **Project Name**: "GrabDocs Mobile"
   - **Project ID**: `grabdocs-mobile-[random]`

3. Enable required APIs:
   - Go to "APIs & Services" → "Library"
   - Search and enable: **"Google+ API"** or **"People API"**

## Step 2: Create OAuth 2.0 Credentials

1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client IDs"
3. Configure the OAuth consent screen first if prompted:
   - **User Type**: External (for testing) or Internal (for organization)
   - **App Name**: GrabDocs
   - **User support email**: Your email
   - **Developer contact**: Your email

4. Create OAuth 2.0 Client ID:
   - **Application type**: "Web application"
   - **Name**: "GrabDocs Development"

## Step 3: Configure Authorized Redirect URIs

Add this redirect URI to your Google OAuth client:

```
https://auth.expo.io/@anonymous/grabdocs
```

This is Expo's auth proxy service that provides a stable HTTPS URL that:
- ✅ Google accepts (proper HTTPS protocol)
- ✅ Works on any network (no IP address dependencies)  
- ✅ Handles the OAuth flow seamlessly
- ✅ Redirects back to your app automatically

## Step 4: Get Your Credentials

After creating the OAuth client, you'll get:
- **Client ID**: `xxxxxxxxx.apps.googleusercontent.com`
- **Client Secret**: `xxxxxxxxxxxxxxx` (not needed for mobile)

## Step 5: Configure Environment Variables

1. Create or update your `.env` file in the project root:

```bash
# Google OAuth Configuration
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=your-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=your-client-id.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=your-client-id.apps.googleusercontent.com

# App Configuration
EXPO_PUBLIC_APP_NAME=GrabDocs
EXPO_PUBLIC_ENVIRONMENT=development
```

2. Restart your Expo development server:
```bash
npx expo start --clear
```

## Step 6: Test the Configuration

1. Open your app
2. Try Google sign-in
3. You should now be redirected to `exp://localhost:8082` instead of the IP address
4. The OAuth flow should work regardless of network changes

## How It Works

The app now uses Expo's auth proxy service which:

1. **Provides stable HTTPS URL**: `https://auth.expo.io/@anonymous/grabdocs`
2. **Handles OAuth flow**: Google redirects to this URL after authentication
3. **Returns to your app**: Expo proxy automatically redirects back to your app
4. **Works everywhere**: No network or IP address dependencies

## Troubleshooting

### Error: "invalid_request"
- Check that your redirect URI exactly matches what's in Google Console
- Ensure your Google Client ID is correct in the `.env` file

### Error: "access_denied"
- Make sure your OAuth consent screen is configured
- Check that you've enabled the required APIs

### Still getting IP-based redirects?
- Clear Expo cache: `npx expo start --clear`
- Restart your development server completely

## Production Setup

For production builds:
1. Create separate OAuth clients for Android/iOS in Google Console
2. Use platform-specific client IDs
3. Configure proper App Links/Universal Links for redirect URIs

## Security Notes

- Never commit your `.env` file to version control
- Use different OAuth clients for development/production
- Regularly rotate client secrets in production 
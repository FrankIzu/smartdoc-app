# API URL Configuration Guide

## Overview

The mobile app uses different API endpoints based on how it's running:

- **Expo Go** (local testing): `http://192.168.1.5:5000` (localhost)
- **Development Builds** (iPhone): `https://api.grabdocs.com` (production)
- **Production Builds**: `https://api.grabdocs.com` (production)

## How It Works

### Detection Logic

The app uses `Constants.appOwnership` to distinguish between Expo Go and standalone apps:

```typescript
const isExpoGo = Constants.appOwnership === 'expo';

if (isExpoGo) {
  // Use localhost for local testing in Expo Go
  return 'http://192.168.1.5:5000';
}

// Use production for all standalone apps (dev or prod builds)
return 'https://api.grabdocs.com';
```

### Priority Order

1. **Environment Variable Override** (highest priority): `EXPO_PUBLIC_API_URL`
2. **Expo Go Detection**: If running in Expo Go → localhost
3. **Standalone App** (default): Production URL

## Build Profiles

### Development Build (`eas.json`)

```json
{
  "development": {
    "env": {
      "EXPO_PUBLIC_API_URL": "https://api.grabdocs.com"
    }
  }
}
```

- Runs on physical iPhone
- Uses production backend
- Has development features enabled (debugging, hot reload, etc.)

### Preview Build

```json
{
  "preview": {
    "env": {
      "EXPO_PUBLIC_API_URL": "https://api.grabdocs.com"
    }
  }
}
```

- Staging/testing build
- Uses production backend

### Production Build

```json
{
  "production": {
    "env": {
      "EXPO_PUBLIC_API_URL": "https://api.grabdocs.com"
    }
  }
}
```

- Final release build
- Uses production backend

## Files Modified

1. **`constants/Config.ts`**: Main API URL configuration
2. **`constants/Environment.ts`**: Environment detection and network config
3. **`utils/networkUtils.ts`**: Network utilities and fallback URLs
4. **`services/api.ts`**: API service with platform header detection
5. **`eas.json`**: Build profiles with explicit API URL environment variables

## Local Testing

### Using Expo Go (Localhost)

```bash
npm start
# or
expo start
```

- Runs in Expo Go
- Connects to `http://192.168.1.5:5000`
- Good for rapid development and testing

### Using Dev Build (Production)

```bash
# Build the dev client
npx eas-cli build -p ios --profile development

# Then run
npm start
```

- Runs on physical iPhone
- Connects to `https://api.grabdocs.com`
- Tests production API integration

## Override for Local Testing

If you need to test localhost with a dev build, set the environment variable:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.5:5000 npm start
```

Or create a `.env` file:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.5:5000
```

## Important Notes

1. **Dev builds are NOT the same as development mode**: Dev builds run on physical devices and use production credentials.

2. **Rebuild required**: Changes to `eas.json` or API URL configuration require rebuilding the dev client.

3. **`__DEV__` flag**: This is `true` in both Expo Go and dev builds. We use `Constants.appOwnership` instead to distinguish them.

4. **Platform headers**: 
   - Expo Go sends `X-Platform: android` to avoid iOS HTTPS requirements
   - Standalone apps send the actual platform (`ios` or `android`)

## Troubleshooting

### "No development server found" error

This means the app is trying to connect to localhost but can't find it. Solutions:

1. **Use production** (recommended for dev builds): Rebuild with current `eas.json` configuration
2. **Test in Expo Go**: Use `expo start` and scan QR code
3. **Override URL**: Set `EXPO_PUBLIC_API_URL` environment variable

### Checking Current Configuration

Add this to any component to verify:

```typescript
import { API_BASE_URL } from '@/constants/Config';
import Constants from 'expo-constants';

console.log('App Ownership:', Constants.appOwnership);
console.log('API Base URL:', API_BASE_URL);
console.log('Is DEV:', __DEV__);
```

Expected output:
- **Expo Go**: `appOwnership: "expo"`, `API_BASE_URL: "http://192.168.1.5:5000"`
- **Dev Build**: `appOwnership: "standalone"`, `API_BASE_URL: "https://api.grabdocs.com"`
- **Production**: `appOwnership: "standalone"`, `API_BASE_URL: "https://api.grabdocs.com"`







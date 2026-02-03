# PDF Viewer Verification Guide

## Overview

The native PDF viewer (`react-native-pdf`) requires native modules that are **not available in Expo Go**. It will work automatically in **development builds** and **production builds**.

## How It Works

### Detection Logic

The app automatically detects the environment:

- **Expo Go**: `Constants.appOwnership === 'expo'` → Shows fallback UI
- **Dev/Prod Builds**: `Constants.appOwnership !== 'expo'` → Native PDF viewer loads

### Verification Logs

When the app starts, check the console logs for:

```
📱 PDF Viewer Environment: {
  platform: 'android' | 'ios',
  appOwnership: 'expo' | 'standalone' | null,
  isExpoGo: true | false,
  executionEnvironment: 'storeClient' | 'standalone' | ...
}
```

**Expected logs:**

✅ **In Dev/Prod Builds:**
```
✅ Native PDF viewer (react-native-pdf) loaded successfully
```

⚠️ **In Expo Go:**
```
ℹ️ Running in Expo Go - native PDF viewer not available (requires dev/prod build)
```

When viewing a PDF in dev/prod builds:
```
📄 Using native PDF viewer (react-native-pdf)
✅ PDF loaded successfully: X pages
```

## What You Need to Do

### ❌ You Do NOT Need:
- **Docker rebuild** - Docker is for backend only, not mobile app
- **Backend changes** - No backend modifications needed

### ✅ You DO Need:
- **Rebuild the mobile app** using EAS Build or local build

## Building the App

### Option 1: EAS Build (Recommended)

**Development Build:**
```bash
eas build --profile development --platform android
# or
eas build --profile development --platform ios
```

**Production Build:**
```bash
eas build --profile production --platform android
# or
eas build --profile production --platform ios
```

### Option 2: Local Build

**Android:**
```bash
npx expo prebuild
npx expo run:android
```

**iOS:**
```bash
npx expo prebuild
npx expo run:ios
```

## Verifying It Works

1. **Build the app** using one of the methods above
2. **Install on device** (or emulator)
3. **Open the app** and check console logs for:
   - `✅ Native PDF viewer (react-native-pdf) loaded successfully`
4. **Open a PDF file** and verify:
   - Native PDF viewer appears (not the Expo Go fallback message)
   - Console shows: `📄 Using native PDF viewer (react-native-pdf)`
   - PDF renders with native UI (zoom, scroll, page navigation)

## Troubleshooting

### Still seeing "PDF Viewer requires a development build" message?

1. **Check console logs** - Look for the environment detection logs
2. **Verify build type** - Make sure you're not running in Expo Go
3. **Check appOwnership** - Should be `'standalone'` or `null`, NOT `'expo'`

### Native module not loading?

1. **Clear Metro cache:**
   ```bash
   npx expo start -c
   ```

2. **Reinstall dependencies:**
   ```bash
   rm -rf node_modules
   npm install
   ```

3. **Rebuild native code:**
   ```bash
   npx expo prebuild --clean
   ```

## Current Status

- ✅ Code detects Expo Go vs dev/prod builds
- ✅ Conditional import prevents crashes in Expo Go
- ✅ Fallback UI for Expo Go users
- ✅ Native PDF viewer for dev/prod builds
- ✅ Logging added for verification

## Next Steps

1. Build a development build: `eas build --profile development --platform android`
2. Install on device
3. Check console logs to verify native module loaded
4. Test PDF viewing - should see native viewer, not fallback message

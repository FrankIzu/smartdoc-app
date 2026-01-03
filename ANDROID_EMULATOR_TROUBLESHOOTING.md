# Android Emulator Troubleshooting Guide

## Issue: App Not Showing on Emulator

If the app doesn't appear on your Android emulator, follow these steps:

## Prerequisites Check

### 1. Verify Emulator is Running
- Open Android Studio
- Go to **Tools > Device Manager**
- Ensure your emulator (Pixel_Tablet) is running
- If not, start it from Device Manager

### 2. Verify Emulator Connection
The emulator should appear in Expo's device list when you run `npx expo start`

## Solution Options

### Option 1: Build and Install Development Client (Recommended)

Since you're using `expo-dev-client`, you need to build and install the development client on the emulator.

#### Step 1: Set Up Java/JDK
1. Install JDK 17 or later (required for Android builds)
   - Download from: https://adoptium.net/ or https://www.oracle.com/java/technologies/downloads/
2. Set JAVA_HOME environment variable:
   ```powershell
   # Find your Java installation path (usually in Program Files)
   # Then set it:
   [System.Environment]::SetEnvironmentVariable('JAVA_HOME', 'C:\Program Files\Java\jdk-17', 'User')
   ```
3. Add Java to PATH:
   ```powershell
   [System.Environment]::SetEnvironmentVariable('Path', $env:Path + ';C:\Program Files\Java\jdk-17\bin', 'User')
   ```
4. Restart your terminal/PowerShell after setting environment variables

#### Step 2: Build and Install
```bash
# Stop the current Expo server (Ctrl+C)
# Then build and install:
npx expo run:android
```

This will:
- Build the development client
- Install it on the emulator
- Start Metro bundler
- Launch the app

### Option 2: Use Pre-built APK (If Available)

If you have a pre-built development APK:

1. Drag and drop the APK onto the emulator window, OR
2. Use ADB (if available):
   ```bash
   # Find ADB in Android Studio SDK: %LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe
   adb install path\to\your\app-debug.apk
   ```

### Option 3: Use Expo Go (Limited - Won't Work with Custom Native Modules)

⚠️ **Note**: Expo Go won't work with your app because it uses custom native modules (`@100mslive/react-native-hms`).

If you want to test without native modules temporarily:
1. Remove or comment out HMS-related code
2. Run: `npx expo start`
3. Press `a` to open in Android emulator with Expo Go

## Troubleshooting Steps

### Check if App is Already Installed
1. On the emulator, check the app drawer for "GrabDocs" or "Expo Dev Client"
2. If it's installed but not launching, try:
   - Uninstall and reinstall
   - Clear app data: Settings > Apps > GrabDocs > Storage > Clear Data

### Verify Metro Bundler is Running
- The Metro bundler should be running on port 8081
- Check terminal output for: "Metro waiting on exp://192.168.1.5:8081"

### Check Network Connectivity
- Ensure emulator can reach your development machine
- The URL `http://192.168.1.5:8081` should be accessible from the emulator
- Try `http://10.0.2.2:8081` (Android emulator's localhost alias) if network issues occur

### Clear Cache and Restart
```bash
# Stop Expo server
# Clear cache
npx expo start --clear

# Or use the reset script
npm run reset-cache
```

### Check Android Studio Logs
1. Open Android Studio
2. Go to **View > Tool Windows > Logcat**
3. Filter for "Expo" or "GrabDocs"
4. Look for error messages

## Quick Fix: Manual Launch

If the app is installed but Expo isn't launching it automatically:

1. On the emulator, open the app manually from the app drawer
2. The app should connect to Metro bundler automatically
3. If it shows "No development server found":
   - Check that Metro is running
   - Verify the URL in the app matches your machine's IP

## Environment Variables

If you need to override the development server URL:

```bash
# Set environment variable before starting
$env:EXPO_PUBLIC_DEV_URL="http://10.0.2.2:8081"
npx expo start
```

## Still Not Working?

1. **Check Android Studio SDK**: Ensure Android SDK is properly installed
2. **Check Gradle**: Ensure Gradle can build the project
3. **Check Emulator**: Try a different emulator or create a new one
4. **Check Logs**: Review both Expo terminal output and Android Studio Logcat

## Alternative: Use Physical Device

If emulator continues to have issues:
1. Enable USB debugging on your Android device
2. Connect via USB
3. Run `npx expo run:android` - it will detect and install on the physical device


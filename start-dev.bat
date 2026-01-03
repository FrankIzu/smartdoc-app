@echo off
REM Quick start script for GrabDocs development (Windows Batch)
REM This script starts Metro bundler and launches the app on the emulator

echo 🚀 Starting GrabDocs Development Environment...
echo.

REM Set environment variables
set ANDROID_HOME=C:\Users\frank\AppData\Local\Android\Sdk
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set PATH=%JAVA_HOME%\bin;%PATH%

REM Check if Metro is running
netstat -ano | findstr ":8081" >nul
if %errorlevel% == 0 (
    echo ✅ Metro bundler is already running on port 8081
) else (
    echo 📦 Starting Metro bundler in new window...
    start "Metro Bundler" cmd /k "cd /d %~dp0 && npx expo start --android"
    echo ⏳ Waiting for Metro to start (30 seconds)...
    timeout /t 30 /nobreak >nul
)

REM Launch the app
echo.
echo 📲 Launching GrabDocs app on emulator...
"%ANDROID_HOME%\platform-tools\adb.exe" -s emulator-5554 shell am start -n com.grabdocs.mobile/.MainActivity

if %errorlevel% == 0 (
    echo ✅ App launched successfully!
    echo.
    echo 💡 Tips:
    echo    - Metro bundler should be running in another window
    echo    - The app will connect automatically
    echo    - Press 'R' in Metro terminal to reload
) else (
    echo ❌ Failed to launch app. Make sure the emulator is running.
)

pause


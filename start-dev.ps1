# Quick start script for GrabDocs development
# This script starts Metro bundler and launches the app on the emulator

Write-Host "🚀 Starting GrabDocs Development Environment..." -ForegroundColor Green
Write-Host ""

# Set environment variables
$env:ANDROID_HOME = "C:\Users\frank\AppData\Local\Android\Sdk"
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# Check if emulator is running
Write-Host "📱 Checking for Android emulator..." -ForegroundColor Cyan
$emulatorCheck = & "$env:ANDROID_HOME\platform-tools\adb.exe" devices 2>&1
if ($emulatorCheck -match "emulator") {
    Write-Host "✅ Emulator detected" -ForegroundColor Green
} else {
    Write-Host "⚠️  No emulator detected. Please start your emulator first!" -ForegroundColor Yellow
    Write-Host "   You can start it from Android Studio > Device Manager" -ForegroundColor Yellow
    exit 1
}

# Check if Metro is already running
Write-Host ""
Write-Host "🔍 Checking Metro bundler..." -ForegroundColor Cyan
$metroRunning = Get-NetTCPConnection -LocalPort 8081 -ErrorAction SilentlyContinue
if ($metroRunning) {
    Write-Host "✅ Metro bundler is already running on port 8081" -ForegroundColor Green
    Write-Host "   You can access it at: http://localhost:8081" -ForegroundColor Gray
} else {
    Write-Host "📦 Starting Metro bundler..." -ForegroundColor Cyan
    Write-Host "   (This will open in a new window)" -ForegroundColor Gray
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd '$PWD'; `$env:ANDROID_HOME='$env:ANDROID_HOME'; `$env:JAVA_HOME='$env:JAVA_HOME'; `$env:PATH=`"`$env:JAVA_HOME\bin;`$env:PATH`"; npx expo start --android"
    Write-Host "   ⏳ Waiting for Metro to start (30 seconds)..." -ForegroundColor Yellow
    Start-Sleep -Seconds 30
}

# Launch the app
Write-Host ""
Write-Host "📲 Launching GrabDocs app on emulator..." -ForegroundColor Cyan
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am start -n com.grabdocs.mobile/.MainActivity

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ App launched successfully!" -ForegroundColor Green
    Write-Host ""
    Write-Host "💡 Tips:" -ForegroundColor Cyan
    Write-Host "   - Metro bundler should be running in another window" -ForegroundColor Gray
    Write-Host "   - The app will connect automatically" -ForegroundColor Gray
    Write-Host "   - Press 'R' in Metro terminal to reload" -ForegroundColor Gray
    Write-Host "   - Press 'M' in Metro terminal to open dev menu" -ForegroundColor Gray
} else {
    Write-Host "❌ Failed to launch app. Make sure the emulator is running." -ForegroundColor Red
}


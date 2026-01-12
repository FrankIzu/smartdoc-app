# Quick script to reload the GrabDocs app
# Usage: .\reload-app.ps1

$env:ANDROID_HOME = "C:\Users\frank\AppData\Local\Android\Sdk"

Write-Host "🔄 Reloading GrabDocs app..." -ForegroundColor Cyan

# Method 1: Send reload command (if dev menu is open)
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell input text "RR" 2>&1 | Out-Null

# Method 2: Restart the app (more reliable)
Start-Sleep -Milliseconds 500
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am force-stop com.grabdocs.mobile
Start-Sleep -Milliseconds 500
& "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell am start -n com.grabdocs.mobile/.MainActivity

Write-Host "✅ App reloaded!" -ForegroundColor Green
Write-Host ""
Write-Host "💡 Tip: In Metro terminal, just press 'r' for faster reload" -ForegroundColor Yellow







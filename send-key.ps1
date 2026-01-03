# Script to send keyboard input to emulator via ADB
# Usage: .\send-key.ps1 "text" or .\send-key.ps1 -key KEYCODE_R

param(
    [string]$Text,
    [string]$Key
)

$env:ANDROID_HOME = "C:\Users\frank\AppData\Local\Android\Sdk"

if ($Text) {
    Write-Host "⌨️  Sending text: $Text" -ForegroundColor Cyan
    & "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell input text $Text
} elseif ($Key) {
    Write-Host "⌨️  Sending key: $Key" -ForegroundColor Cyan
    & "$env:ANDROID_HOME\platform-tools\adb.exe" -s emulator-5554 shell input keyevent $Key
} else {
    Write-Host "Usage:" -ForegroundColor Yellow
    Write-Host "  .\send-key.ps1 -Text 'hello'" -ForegroundColor Gray
    Write-Host "  .\send-key.ps1 -Key KEYCODE_R" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Common keys:" -ForegroundColor Cyan
    Write-Host "  KEYCODE_R - Reload app" -ForegroundColor Gray
    Write-Host "  KEYCODE_M - Dev menu" -ForegroundColor Gray
    Write-Host "  KEYCODE_ENTER - Enter" -ForegroundColor Gray
    Write-Host "  KEYCODE_BACK - Back button" -ForegroundColor Gray
}



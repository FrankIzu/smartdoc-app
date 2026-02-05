# Set EAS environment variables for local submission
# Usage: .\scripts\set-eas-env.ps1
# Then run: eas submit --platform ios --profile production

Write-Host "🔐 Setting EAS environment variables for local submission..." -ForegroundColor Cyan

# Check if values are already set
if ($env:EXPO_TOKEN -and $env:EXPO_APPLE_APP_SPECIFIC_PASSWORD) {
    Write-Host "✅ Environment variables are already set:" -ForegroundColor Green
    Write-Host "   EXPO_TOKEN: $($env:EXPO_TOKEN.Substring(0, [Math]::Min(20, $env:EXPO_TOKEN.Length)))..." -ForegroundColor Gray
    Write-Host "   EXPO_APPLE_APP_SPECIFIC_PASSWORD: [hidden]" -ForegroundColor Gray
    $useExisting = Read-Host "Use existing values? (y/n)"
    if ($useExisting -eq "y") {
        Write-Host "✅ Using existing environment variables" -ForegroundColor Green
        return
    }
}

# Prompt for EXPO_TOKEN if not set
if (-not $env:EXPO_TOKEN) {
    Write-Host "`n📝 Enter your Expo access token:" -ForegroundColor Yellow
    Write-Host "   Get it from: https://expo.dev/accounts/[your-account]/settings/access-tokens" -ForegroundColor Gray
    $expoToken = Read-Host "EXPO_TOKEN" -AsSecureString
    $env:EXPO_TOKEN = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($expoToken))
    Write-Host "✅ EXPO_TOKEN set" -ForegroundColor Green
} else {
    Write-Host "✅ EXPO_TOKEN already set" -ForegroundColor Green
}

# Prompt for Apple App-Specific Password if not set
if (-not $env:EXPO_APPLE_APP_SPECIFIC_PASSWORD) {
    Write-Host "`n📝 Enter your Apple App-Specific Password:" -ForegroundColor Yellow
    Write-Host "   Generate at: https://appleid.apple.com/account/manage → App-Specific Passwords" -ForegroundColor Gray
    $applePassword = Read-Host "EXPO_APPLE_APP_SPECIFIC_PASSWORD" -AsSecureString
    $env:EXPO_APPLE_APP_SPECIFIC_PASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($applePassword))
    Write-Host "✅ EXPO_APPLE_APP_SPECIFIC_PASSWORD set" -ForegroundColor Green
} else {
    Write-Host "✅ EXPO_APPLE_APP_SPECIFIC_PASSWORD already set" -ForegroundColor Green
}

Write-Host "`n✅ Environment variables are set for this PowerShell session" -ForegroundColor Green
Write-Host "`n💡 Now you can run:" -ForegroundColor Cyan
Write-Host "   eas submit --platform ios --profile production" -ForegroundColor White
Write-Host "   or" -ForegroundColor Gray
Write-Host "   eas submit --platform ios --path ./path/to/your-app.ipa --profile production" -ForegroundColor White
Write-Host "`n⚠️  Note: These variables are only set for this PowerShell session." -ForegroundColor Yellow
Write-Host "   To persist them, add to your PowerShell profile or use a .env file." -ForegroundColor Yellow

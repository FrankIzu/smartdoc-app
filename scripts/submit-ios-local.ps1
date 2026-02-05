# Submit iOS build to App Store locally
# Usage: .\scripts\submit-ios-local.ps1 [path-to-ipa]

param(
    [string]$IpaPath = ""
)

Write-Host "🍎 iOS App Store Submission (Local)" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Change to project root
Set-Location "$PSScriptRoot\.."

# Try to load from .env.local if it exists
$envLocalPath = "$PSScriptRoot\..\.env.local"
if (Test-Path $envLocalPath) {
    Write-Host "📝 Loading environment variables from .env.local..." -ForegroundColor Yellow
    Get-Content $envLocalPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($key -eq "EXPO_TOKEN" -or $key -eq "EXPO_APPLE_APP_SPECIFIC_PASSWORD") {
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
                Write-Host "   ✅ Loaded $key" -ForegroundColor Gray
            }
        }
    }
}

# Check if EXPO_TOKEN is set
if (-not $env:EXPO_TOKEN) {
    Write-Host "`n❌ EXPO_TOKEN is not set" -ForegroundColor Red
    Write-Host "   Set it with: `$env:EXPO_TOKEN = 'your-token'" -ForegroundColor Yellow
    Write-Host "   Or add it to .env.local file" -ForegroundColor Yellow
    Write-Host "   Get token from: https://expo.dev/accounts/[your-account]/settings/access-tokens" -ForegroundColor Gray
    exit 1
}

# Check if EXPO_APPLE_APP_SPECIFIC_PASSWORD is set
if (-not $env:EXPO_APPLE_APP_SPECIFIC_PASSWORD) {
    Write-Host "`n❌ EXPO_APPLE_APP_SPECIFIC_PASSWORD is not set" -ForegroundColor Red
    Write-Host "   Set it with: `$env:EXPO_APPLE_APP_SPECIFIC_PASSWORD = 'your-password'" -ForegroundColor Yellow
    Write-Host "   Or add it to .env.local file" -ForegroundColor Yellow
    Write-Host "   Generate at: https://appleid.apple.com/account/manage → App-Specific Passwords" -ForegroundColor Gray
    exit 1
}

Write-Host "✅ Environment variables are set" -ForegroundColor Green

# Find IPA file if path not provided
if ([string]::IsNullOrWhiteSpace($IpaPath)) {
    Write-Host "`n🔍 Looking for .ipa files..." -ForegroundColor Yellow
    $ipaFiles = Get-ChildItem -Path . -Filter "*.ipa" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($ipaFiles) {
        $IpaPath = $ipaFiles.FullName
        Write-Host "   Found: $IpaPath" -ForegroundColor Green
    } else {
        Write-Host "❌ No .ipa file found. Please specify the path:" -ForegroundColor Red
        Write-Host "   .\scripts\submit-ios-local.ps1 -IpaPath ./path/to/app.ipa" -ForegroundColor Yellow
        exit 1
    }
} else {
    if (-not (Test-Path $IpaPath)) {
        Write-Host "❌ IPA file not found: $IpaPath" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n🚀 Submitting to App Store..." -ForegroundColor Cyan
Write-Host "   IPA: $IpaPath" -ForegroundColor Gray
Write-Host "   Profile: production" -ForegroundColor Gray

try {
    eas submit --platform ios --path $IpaPath --profile production --non-interactive
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Submission completed successfully!" -ForegroundColor Green
        Write-Host "   Check App Store Connect: https://appstoreconnect.apple.com" -ForegroundColor Cyan
        Write-Host "   Build may take 15 minutes to several hours to appear in TestFlight" -ForegroundColor Yellow
    } else {
        Write-Host "`n❌ Submission failed with exit code $LASTEXITCODE" -ForegroundColor Red
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "`n❌ Error during submission: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

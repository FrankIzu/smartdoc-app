# Test EAS submit configuration
# Usage: .\scripts\test-eas-submit.ps1

Write-Host "🔍 Testing EAS Submit Configuration" -ForegroundColor Cyan
Write-Host "====================================" -ForegroundColor Cyan

# Change to project root
Set-Location "$PSScriptRoot\.."

# Load .env.local
$envLocalPath = ".\.env.local"
if (Test-Path $envLocalPath) {
    Write-Host "`n📝 Loading .env.local..." -ForegroundColor Yellow
    Get-Content $envLocalPath | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $key = $matches[1].Trim()
            $value = $matches[2].Trim()
            if ($key -eq "EXPO_TOKEN" -or $key -eq "EXPO_APPLE_APP_SPECIFIC_PASSWORD") {
                # Set both PowerShell $env: and Process-level environment variables
                Set-Item -Path "env:$key" -Value $value
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
                Write-Host "   ✅ Loaded $key" -ForegroundColor Green
            }
        }
    }
} else {
    Write-Host "❌ .env.local not found at $envLocalPath" -ForegroundColor Red
    Write-Host "   Current directory: $(Get-Location)" -ForegroundColor Gray
}

# Check EXPO_TOKEN
Write-Host "`n🔑 Checking EXPO_TOKEN..." -ForegroundColor Yellow
if ($env:EXPO_TOKEN) {
    $tokenPreview = if ($env:EXPO_TOKEN.Length -gt 20) { $env:EXPO_TOKEN.Substring(0, 20) + "..." } else { $env:EXPO_TOKEN }
    Write-Host "   ✅ EXPO_TOKEN is set: $tokenPreview" -ForegroundColor Green
} else {
    Write-Host "   ❌ EXPO_TOKEN is not set" -ForegroundColor Red
}

# Check EXPO_APPLE_APP_SPECIFIC_PASSWORD
Write-Host "`n🍎 Checking EXPO_APPLE_APP_SPECIFIC_PASSWORD..." -ForegroundColor Yellow
if ($env:EXPO_APPLE_APP_SPECIFIC_PASSWORD) {
    Write-Host "   ✅ EXPO_APPLE_APP_SPECIFIC_PASSWORD is set (hidden)" -ForegroundColor Green
} else {
    Write-Host "   ❌ EXPO_APPLE_APP_SPECIFIC_PASSWORD is not set" -ForegroundColor Red
}

# Check EAS CLI
Write-Host "`n🛠️  Checking EAS CLI..." -ForegroundColor Yellow
try {
    $easVersion = npx eas-cli --version 2>&1
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ EAS CLI is available: $easVersion" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  EAS CLI check returned exit code $LASTEXITCODE" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   ❌ EAS CLI not found: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "   💡 Install with: npm install -g eas-cli" -ForegroundColor Yellow
}

# Check for IPA files
Write-Host "`n📦 Looking for .ipa files..." -ForegroundColor Yellow
$ipaFiles = Get-ChildItem -Path . -Filter "*.ipa" -Recurse -ErrorAction SilentlyContinue
if ($ipaFiles) {
    Write-Host "   ✅ Found $($ipaFiles.Count) .ipa file(s):" -ForegroundColor Green
    $ipaFiles | ForEach-Object {
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Host "      - $($_.FullName) ($sizeMB MB)" -ForegroundColor Gray
    }
} else {
    Write-Host "   ⚠️  No .ipa files found in current directory" -ForegroundColor Yellow
    Write-Host "   💡 Download from GitHub Actions artifacts or build locally first" -ForegroundColor Yellow
}

# Check eas.json
Write-Host "`n📄 Checking eas.json..." -ForegroundColor Yellow
$easJsonPath = ".\.eas.json"
if (-not (Test-Path $easJsonPath)) {
    $easJsonPath = ".\eas.json"
}
if (Test-Path $easJsonPath) {
    $easJson = Get-Content $easJsonPath -Raw | ConvertFrom-Json
    if ($easJson.submit.production.ios) {
        Write-Host "   ✅ iOS submit config found:" -ForegroundColor Green
        Write-Host "      Apple ID: $($easJson.submit.production.ios.appleId)" -ForegroundColor Gray
        Write-Host "      App ID: $($easJson.submit.production.ios.ascAppId)" -ForegroundColor Gray
        Write-Host "      Team ID: $($easJson.submit.production.ios.appleTeamId)" -ForegroundColor Gray
    } else {
        Write-Host "   ⚠️  iOS submit config not found in eas.json" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ eas.json not found" -ForegroundColor Red
}

# Test Expo authentication
Write-Host "`n🔐 Testing Expo authentication..." -ForegroundColor Yellow
if ($env:EXPO_TOKEN) {
    try {
        $whoami = npx eas-cli whoami --non-interactive 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Authenticated: $whoami" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Authentication failed (exit code $LASTEXITCODE)" -ForegroundColor Red
            Write-Host "   Output: $whoami" -ForegroundColor Gray
        }
    } catch {
        Write-Host "   ❌ Error checking authentication: $($_.Exception.Message)" -ForegroundColor Red
    }
} else {
    Write-Host "   ⚠️  Skipping (EXPO_TOKEN not set)" -ForegroundColor Yellow
}

Write-Host "`n✅ Diagnostic complete!" -ForegroundColor Green
Write-Host "`n💡 To submit, run:" -ForegroundColor Cyan
Write-Host "   .\scripts\submit-ios-local.ps1" -ForegroundColor White
Write-Host "   or" -ForegroundColor Gray
Write-Host "   .\scripts\submit-ios-local.ps1 -IpaPath ./path/to/your-app.ipa" -ForegroundColor White

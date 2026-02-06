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
            if ($key -eq "EXPO_TOKEN" -or $key -eq "EXPO_APPLE_APP_SPECIFIC_PASSWORD" -or 
                $key -eq "ASC_KEY_ID" -or $key -eq "ASC_ISSUER_ID" -or $key -eq "ASC_KEY_P8_BASE64") {
                # Set both PowerShell env drive and Process-level environment variables
                Set-Item -Path (Join-Path 'env:' $key) -Value $value
                [Environment]::SetEnvironmentVariable($key, $value, "Process")
                Write-Host "   ✅ Loaded $key" -ForegroundColor Gray
            }
        }
    }
} else {
    Write-Host "⚠️  .env.local not found at $envLocalPath" -ForegroundColor Yellow
    Write-Host "   Using environment variables already set in PowerShell session" -ForegroundColor Gray
}

# Check if EXPO_TOKEN is set
if (-not $env:EXPO_TOKEN) {
    Write-Host "`n❌ EXPO_TOKEN is not set" -ForegroundColor Red
    Write-Host "   Set it with: `$env:EXPO_TOKEN = 'your-token'" -ForegroundColor Yellow
    Write-Host "   Or add it to .env.local file" -ForegroundColor Yellow
    Write-Host "   Get token from: https://expo.dev/accounts/[your-account]/settings/access-tokens" -ForegroundColor Gray
    exit 1
}

# Check for authentication method (prefer API keys, fall back to app-specific password)
$hasApiKeys = $env:ASC_KEY_ID -and $env:ASC_ISSUER_ID -and $env:ASC_KEY_P8_BASE64
$hasAppPassword = $env:EXPO_APPLE_APP_SPECIFIC_PASSWORD

if (-not $hasApiKeys -and -not $hasAppPassword) {
    Write-Host "`n❌ No Apple authentication method found" -ForegroundColor Red
    Write-Host "   Option 1 - Set ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_P8_BASE64" -ForegroundColor Yellow
    Write-Host "   Option 2 - Set EXPO_APPLE_APP_SPECIFIC_PASSWORD" -ForegroundColor Yellow
    Write-Host "      EXPO_APPLE_APP_SPECIFIC_PASSWORD" -ForegroundColor Gray
    Write-Host "   Add them to .env.local or set as environment variables" -ForegroundColor Yellow
    exit 1
}

if ($hasApiKeys) {
    Write-Host "✅ Using App Store Connect API keys for authentication" -ForegroundColor Green
} else {
    Write-Host "✅ Using app-specific password for authentication" -ForegroundColor Green
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
        Write-Host "❌ Path not found: $IpaPath" -ForegroundColor Red
        exit 1
    }
    
    # Check if path is a directory or zip file
    $item = Get-Item $IpaPath -ErrorAction SilentlyContinue
    if ($item.PSIsContainer) {
        # It's a directory, look for .ipa files inside
        Write-Host "`n🔍 Path is a directory, looking for .ipa files inside..." -ForegroundColor Yellow
        $ipaFiles = Get-ChildItem -Path $IpaPath -Filter "*.ipa" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($ipaFiles) {
            $IpaPath = $ipaFiles.FullName
            Write-Host "   Found: $IpaPath" -ForegroundColor Green
        } else {
            Write-Host "❌ No .ipa file found in directory: $IpaPath" -ForegroundColor Red
            exit 1
        }
    } elseif ($item.Extension -eq ".zip") {
        # It's a zip file, extract and find .ipa
        Write-Host "`n📦 Extracting zip file..." -ForegroundColor Yellow
        $extractPath = Join-Path $env:TEMP "ios-build-extract-$(Get-Random)"
        Expand-Archive -Path $IpaPath -DestinationPath $extractPath -Force
        $ipaFiles = Get-ChildItem -Path $extractPath -Filter "*.ipa" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($ipaFiles) {
            $IpaPath = $ipaFiles.FullName
            Write-Host "   Found: $IpaPath" -ForegroundColor Green
        } else {
            Write-Host "❌ No .ipa file found in zip: $IpaPath" -ForegroundColor Red
            exit 1
        }
    } elseif ($item.Extension -ne ".ipa") {
        Write-Host "❌ Path is not a .ipa file: $IpaPath" -ForegroundColor Red
        exit 1
    }
}

Write-Host "`n🚀 Submitting to App Store..." -ForegroundColor Cyan
Write-Host "   IPA: $IpaPath" -ForegroundColor Gray
Write-Host "   Profile: production" -ForegroundColor Gray
Write-Host "   Apple ID: francis.onodueze@gmail.com" -ForegroundColor Gray

# When using app-specific password, verify it is set
if (-not $hasApiKeys -and -not $env:EXPO_APPLE_APP_SPECIFIC_PASSWORD) {
    Write-Host "`n❌ EXPO_APPLE_APP_SPECIFIC_PASSWORD is not set" -ForegroundColor Red
    Write-Host "   Add it to .env.local or set the environment variable" -ForegroundColor Yellow
    exit 1
}

if (-not $hasApiKeys -and $env:EXPO_APPLE_APP_SPECIFIC_PASSWORD) {
    $passwordPattern = '^[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}$'
    if ($env:EXPO_APPLE_APP_SPECIFIC_PASSWORD -notmatch $passwordPattern) {
        Write-Host "`n⚠️  Warning: App-specific password format looks incorrect (expected xxxx-xxxx-xxxx-xxxx)" -ForegroundColor Yellow
    }
}

# When using API keys from .env.local: write .p8 and inject into eas.json so EAS uses them
# (EAS otherwise uses a stored key on their servers which may be invalid.)
$easJsonBackup = $null
$tempP8Path = $null
if ($hasApiKeys) {
    try {
        $tempP8Path = Join-Path $env:TEMP "asc-key-$([Guid]::NewGuid().ToString('n')).p8"
        [System.Convert]::FromBase64String($env:ASC_KEY_P8_BASE64) | Set-Content -Path $tempP8Path -Encoding Byte
        if (-not (Test-Path $tempP8Path)) { throw "Failed to write .p8 file" }
        $tempP8Path = (Resolve-Path $tempP8Path).Path

        $easPath = Join-Path $PWD "eas.json"
        $eas = Get-Content $easPath -Raw | ConvertFrom-Json
        $easJsonBackup = Get-Content $easPath -Raw

        if (-not $eas.submit.production.ios) { $eas.submit.production | Add-Member -MemberType NoteProperty -Name ios -Value @{} -Force }
        $eas.submit.production.ios | Add-Member -MemberType NoteProperty -Name ascApiKeyPath -Value $tempP8Path -Force
        $eas.submit.production.ios | Add-Member -MemberType NoteProperty -Name ascApiKeyId -Value $env:ASC_KEY_ID -Force
        $eas.submit.production.ios | Add-Member -MemberType NoteProperty -Name ascApiKeyIssuerId -Value $env:ASC_ISSUER_ID -Force

        $eas | ConvertTo-Json -Depth 10 | Set-Content $easPath -Encoding UTF8
        Write-Host "   Using local ASC API key from .env.local (Key ID: $env:ASC_KEY_ID)" -ForegroundColor Green
    } catch {
        Write-Host "`n⚠️  Could not inject ASC key into eas.json: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "   EAS may use stored key; if submit fails with 'Invalid ASC API key', update credentials at expo.dev" -ForegroundColor Gray
    }
}

try {
    Write-Host "`nExecuting submission..." -ForegroundColor Gray
    if ($hasApiKeys) {
        Write-Host "   Auth: App Store Connect API key (from .env.local)" -ForegroundColor Gray
    } else {
        Write-Host "   Auth: App-specific password" -ForegroundColor Gray
    }

    npx eas-cli submit --platform ios --path $IpaPath --profile production --non-interactive

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✅ Submission completed successfully!" -ForegroundColor Green
        Write-Host "   Check App Store Connect: https://appstoreconnect.apple.com" -ForegroundColor Cyan
        Write-Host "   Build may take 15 minutes to several hours to appear in TestFlight" -ForegroundColor Yellow
    } else {
        Write-Host "`n❌ Submission failed with exit code $LASTEXITCODE" -ForegroundColor Red
        if ($easJsonBackup) { Set-Content -Path (Join-Path $PWD "eas.json") -Value $easJsonBackup -Encoding UTF8 }
        if ($tempP8Path -and (Test-Path $tempP8Path)) { Remove-Item $tempP8Path -Force -ErrorAction SilentlyContinue }
        exit $LASTEXITCODE
    }
} catch {
    Write-Host "`n❌ Error during submission: $($_.Exception.Message)" -ForegroundColor Red
    if ($easJsonBackup) { Set-Content -Path (Join-Path $PWD "eas.json") -Value $easJsonBackup -Encoding UTF8 }
    if ($tempP8Path -and (Test-Path $tempP8Path)) { Remove-Item $tempP8Path -Force -ErrorAction SilentlyContinue }
    exit 1
} finally {
    # Restore eas.json and remove temp .p8
    if ($easJsonBackup) {
        Set-Content -Path (Join-Path $PWD "eas.json") -Value $easJsonBackup -Encoding UTF8
        Write-Host "   Restored eas.json" -ForegroundColor Gray
    }
    if ($tempP8Path -and (Test-Path $tempP8Path)) {
        Remove-Item $tempP8Path -Force -ErrorAction SilentlyContinue
    }
}

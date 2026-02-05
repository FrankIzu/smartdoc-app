# Deploy script for GrabDocs mobile app
# This script handles platform selection, environment selection, version updates, build number updates, and EAS build execution
#
# Usage:
#   Interactive mode: .\scripts\deploy.ps1
#   Direct parameters (Android): .\scripts\deploy.ps1 -Platform android -Environment prod -BuildNumber 11 -Version 1.0.3
#   Direct parameters (iOS):    .\scripts\deploy.ps1 -Platform ios -Environment prod -BuildNumber 2 -Version 1.0.3
#   Local build (no EAS cloud): .\scripts\deploy.ps1 -Platform android -Environment prod -Local
#   Local build (iOS, requires macOS): .\scripts\deploy.ps1 -Platform ios -Environment prod -Local
#
#   In interactive mode you can choose: (1) This machine [EAS local], (2) EAS cloud, (3) GitHub Actions.
#   Option 3 commits version/build and pushes; iOS runs on push to main, Android runs on push to main or tag.

param(
    [string]$Platform,
    [string]$Environment,
    [string]$BuildNumber,
    [string]$Version,
    [switch]$Local
)

Write-Host "🚀 GrabDocs Deployment Script" -ForegroundColor Cyan
Write-Host "============================" -ForegroundColor Cyan

# Function to prompt for input with validation
function Prompt-WithValidation {
    param(
        [string]$Prompt,
        [array]$ValidOptions = @(),
        [string]$DefaultValue = ""
    )

    do {
        $response = Read-Host "$Prompt"
        if ($response -eq "" -and $DefaultValue -ne "") {
            $response = $DefaultValue
        }

        if ($ValidOptions.Count -gt 0) {
            $isValid = $ValidOptions -contains $response.ToLower()
            if (-not $isValid) {
                Write-Host "Invalid option. Please choose from: $($ValidOptions -join ', ')" -ForegroundColor Yellow
                continue
            }
        }
        break
    } while ($true)

    return $response.ToLower()
}

# Function to get current version from app.json
function Get-CurrentVersion {
    try {
        $appJsonPath = "$PSScriptRoot\..\app.json"
        if (Test-Path $appJsonPath) {
            $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
            return $appJson.expo.version
        }
    }
    catch {
        Write-Host "⚠️  Could not read current version: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    return $null
}

# Function to get current build number
function Get-CurrentBuildNumber {
    param(
        [string]$Platform
    )

    try {
        if ($Platform -eq "ios") {
            # Get iOS buildNumber from app.json
            $appJsonPath = "$PSScriptRoot\..\app.json"
            if (Test-Path $appJsonPath) {
                $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
                return $appJson.expo.ios.buildNumber
            }
        }
        elseif ($Platform -eq "android") {
            # Get Android versionCode from build.gradle
            $buildGradlePath = "$PSScriptRoot\..\android\app\build.gradle"
            if (Test-Path $buildGradlePath) {
                $content = Get-Content $buildGradlePath -Raw
                if ($content -match 'versionCode\s+(\d+)') {
                    return $matches[1]
                }
            }
        }
    }
    catch {
        Write-Host "⚠️  Could not read current build number: $($_.Exception.Message)" -ForegroundColor Yellow
    }

    return $null
}

# Function to update version in app.json
function Update-Version {
    param(
        [string]$Version
    )

    Write-Host "📝 Updating version to $Version..." -ForegroundColor Yellow

    try {
        $appJsonPath = "$PSScriptRoot\..\app.json"
        $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
        $appJson.expo.version = $Version
        $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonPath -Encoding UTF8
        Write-Host "✅ Updated version in app.json" -ForegroundColor Green
    }
    catch {
        Write-Host "❌ Error updating version: $($_.Exception.Message)" -ForegroundColor Red
        exit 1
    }
}

# Function to update build numbers
function Update-BuildNumber {
    param(
        [string]$Platform,
        [string]$BuildNumber
    )

    Write-Host "📝 Updating build number to $BuildNumber for $Platform..." -ForegroundColor Yellow

    try {
        if ($Platform -eq "ios") {
            # Update iOS buildNumber in app.json
            $appJsonPath = "$PSScriptRoot\..\app.json"
            if (-not (Test-Path $appJsonPath)) {
                throw "app.json not found at $appJsonPath"
            }
            $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
            if (-not $appJson.expo.ios) {
                throw "expo.ios section not found in app.json"
            }
            $appJson.expo.ios.buildNumber = $BuildNumber
            $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonPath -Encoding UTF8
            Write-Host "✅ Updated iOS buildNumber in app.json" -ForegroundColor Green
        }
        elseif ($Platform -eq "android") {
            # Update Android versionCode in build.gradle
            $buildGradlePath = "$PSScriptRoot\..\android\app\build.gradle"
            if (-not (Test-Path $buildGradlePath)) {
                throw "build.gradle not found at $buildGradlePath"
            }
            $content = Get-Content $buildGradlePath -Raw
            if ($content -notmatch 'versionCode') {
                throw "versionCode not found in build.gradle"
            }
            $content = $content -replace '(?<=versionCode\s+)\d+', $BuildNumber
            Set-Content $buildGradlePath $content -Encoding UTF8
            Write-Host "✅ Updated Android versionCode in build.gradle" -ForegroundColor Green
        } else {
            throw "Invalid platform: $Platform"
        }
    } catch {
        Write-Host "❌ Error updating build number: $($_.Exception.Message)" -ForegroundColor Red
        throw
    }
}

# Function to run EAS build
function Run-EasBuild {
    param(
        [string]$Platform,
        [string]$Profile,
        [switch]$Local
    )

    $buildType = if ($Local) { "EAS local" } else { "EAS cloud" }
    Write-Host "🏗️  Running $buildType build for $Platform ($Profile)..." -ForegroundColor Yellow

    # Use npx to run eas command (works even if eas is not globally installed)
    $command = "npx eas-cli build --platform $Platform --profile $Profile --non-interactive"
    if ($Local) {
        $command += " --local"
        Write-Host "ℹ️  Local build: runs on this machine (no EAS cloud charge). EAS local requires macOS or Linux (Windows not supported)." -ForegroundColor Cyan
    }

    Write-Host "Executing: $command" -ForegroundColor Gray

    try {
        # Change to project root directory
        Set-Location "$PSScriptRoot\.."

        # Run the build command
        Invoke-Expression $command

        if ($LASTEXITCODE -eq 0) {
            Write-Host "✅ Build completed successfully!" -ForegroundColor Green
        } else {
            Write-Host "❌ Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
            exit $LASTEXITCODE
        }
    }
    catch {
        Write-Host "❌ Error running build: $($_.Exception.Message)" -ForegroundColor Red
        Write-Host "💡 Tip: Make sure you have Node.js installed and run 'npm install' in the project directory." -ForegroundColor Yellow
        exit 1
    }
}

# Main script logic
try {
    # Prompt for platform if not provided
    if (-not $Platform) {
        $Platform = Prompt-WithValidation "Select platform (ios/android)" @("ios", "android")
    }

    # Validate platform
    if ($Platform -notin @("ios", "android")) {
        Write-Host "❌ Invalid platform. Must be 'ios' or 'android'." -ForegroundColor Red
        exit 1
    }

    # Prompt for environment if not provided
    if (-not $Environment) {
        $Environment = Prompt-WithValidation "Select environment (development/dev/production/prod)" @("development", "dev", "production", "prod")
    }

    # Validate and normalize environment
    $validEnvironments = @("development", "dev", "production", "prod")
    if ($Environment -notin $validEnvironments) {
        Write-Host "❌ Invalid environment. Must be 'development', 'dev', 'production', or 'prod'." -ForegroundColor Red
        exit 1
    }

    # Normalize environment names
    $normalizedEnv = switch ($Environment) {
        "dev" { "development" }
        "prod" { "production" }
        default { $Environment }
    }

    # Map environment to EAS profile
    $profile = switch ($normalizedEnv) {
        "development" { "development" }
        "production" { "production" }
    }

    # Handle version name and build number for production builds
    if ($normalizedEnv -eq "production") {
        $currentVersion = Get-CurrentVersion
        $currentBuildNumber = Get-CurrentBuildNumber -Platform $Platform

        # Prompt for version name
        if (-not $Version) {
            if ($currentVersion) {
                Write-Host "📦 Current version name: $currentVersion" -ForegroundColor Cyan
                $useCurrentVersion = Prompt-WithValidation "Do you want to continue with existing version name ($currentVersion)? (y/n)" @("y", "n")
                if ($useCurrentVersion -eq "y") {
                    $Version = $currentVersion
                    Write-Host "ℹ️  Using current version name: $Version" -ForegroundColor Yellow
                } else {
                    $Version = Read-Host "Enter new version name for production (e.g., 1.0.1)"
                    if ([string]::IsNullOrWhiteSpace($Version)) {
                        Write-Host "❌ Version name cannot be empty." -ForegroundColor Red
                        exit 1
                    }
                }
            } else {
                $Version = Read-Host "Enter version name for production (e.g., 1.0.1)"
            }
        }

        # Validate version format (semantic versioning: x.y.z)
        if ($Version -match '^\d+\.\d+\.\d+$') {
            if ($Version -ne $currentVersion) {
                Update-Version -Version $Version
            } else {
                Write-Host "ℹ️  Version name unchanged: $Version" -ForegroundColor Yellow
            }
        } else {
            Write-Host "❌ Invalid version format. Must be in format x.y.z (e.g., 1.0.1)" -ForegroundColor Red
            exit 1
        }

        # Prompt for build number
        if (-not $BuildNumber) {
            if ($currentBuildNumber) {
                $buildLabel = if ($Platform -eq "ios") { "iOS build number" } else { "Android version code" }
                Write-Host "📦 Current ${buildLabel}: $currentBuildNumber" -ForegroundColor Cyan
                
                if ($Platform -eq "android") {
                    Write-Host "⚠️  Android requires increasing version code for new builds" -ForegroundColor Yellow
                    $useCurrentBuildNumber = Prompt-WithValidation "Do you want to continue with existing version code ($currentBuildNumber)? Note: Android requires incrementing for new builds. (y/n)" @("y", "n")
                    if ($useCurrentBuildNumber -eq "y") {
                        $BuildNumber = $currentBuildNumber
                        Write-Host "ℹ️  Using current ${buildLabel}: $BuildNumber" -ForegroundColor Yellow
                        Write-Host "⚠️  Warning: Android builds typically require incrementing version code. This may cause build issues." -ForegroundColor Yellow
                    } else {
                        $BuildNumber = Read-Host "Enter new ${buildLabel} for production (must be greater than $currentBuildNumber)"
                        if ([string]::IsNullOrWhiteSpace($BuildNumber)) {
                            Write-Host "❌ Build number cannot be empty." -ForegroundColor Red
                            exit 1
                        }
                    }
                } else {
                    # iOS
                    $useCurrentBuildNumber = Prompt-WithValidation "Do you want to continue with existing build number ($currentBuildNumber)? (y/n)" @("y", "n")
                    if ($useCurrentBuildNumber -eq "y") {
                        $BuildNumber = $currentBuildNumber
                        Write-Host "ℹ️  Using current ${buildLabel}: $BuildNumber" -ForegroundColor Yellow
                    } else {
                        $BuildNumber = Read-Host "Enter new ${buildLabel} for production"
                        if ([string]::IsNullOrWhiteSpace($BuildNumber)) {
                            Write-Host "❌ Build number cannot be empty." -ForegroundColor Red
                            exit 1
                        }
                    }
                }
            } else {
                $buildLabel = if ($Platform -eq "ios") { "iOS build number" } else { "Android version code" }
                $BuildNumber = Read-Host "Enter ${buildLabel} for production"
            }
        }

        if ($BuildNumber -match '^\d+$') {
            # For Android, validate that the build number is greater than current (unless user explicitly chose to keep existing)
            if ($Platform -eq "android" -and $currentBuildNumber) {
                $buildNumberInt = [int]$BuildNumber
                $currentBuildNumberInt = [int]$currentBuildNumber
                # Only validate if user entered a new value (not if they chose to keep existing)
                # If they're equal, it means user chose to keep existing, which is allowed with warning
                if ($buildNumberInt -lt $currentBuildNumberInt) {
                    Write-Host "❌ Invalid version code. Must be greater than or equal to current version code ($currentBuildNumber)." -ForegroundColor Red
                    exit 1
                } elseif ($buildNumberInt -eq $currentBuildNumberInt) {
                    Write-Host "⚠️  Warning: Using same version code as current. Android builds typically require incrementing." -ForegroundColor Yellow
                }
            }
            
            try {
                Update-BuildNumber -Platform $Platform -BuildNumber $BuildNumber
            } catch {
                Write-Host "❌ Error updating build number: $($_.Exception.Message)" -ForegroundColor Red
                exit 1
            }
        } else {
            Write-Host "❌ Invalid build number. Must be a number." -ForegroundColor Red
            exit 1
        }
    }

    # Confirm before proceeding
    Write-Host "`n📋 Deployment Summary:" -ForegroundColor Cyan
    Write-Host "   Platform: $Platform" -ForegroundColor White
    Write-Host "   Environment: $normalizedEnv" -ForegroundColor White
    Write-Host "   Profile: $profile" -ForegroundColor White
    if ($Local) {
        Write-Host "   Build: Local (--local)" -ForegroundColor White
    }
    if ($normalizedEnv -eq "production") {
        Write-Host "   Version name: $Version" -ForegroundColor White
        $buildLabel = if ($Platform -eq "ios") { "Build number" } else { "Version code" }
        Write-Host "   ${buildLabel}: $BuildNumber" -ForegroundColor White
    }

    # If -Local was not passed, prompt: local / cloud / GitHub Actions
    $useGitHubActions = $false
    if (-not $PSBoundParameters.ContainsKey('Local')) {
        $where = Prompt-WithValidation "Where to build? (1) This machine [EAS local], (2) EAS cloud, (3) GitHub Actions" @("1", "2", "3") "2"
        if ($where -eq "1") { $Local = $true }
        elseif ($where -eq "3") { $useGitHubActions = $true }
        else { $Local = $false }
    }

    # GitHub Actions: trigger workflow only (commit/push done manually)
    if ($useGitHubActions) {
        $confirm = Prompt-WithValidation "`nTrigger $Platform build (version $Version, build $BuildNumber)? Push your branch first if needed. (y/n)" @("y", "n")
        if ($confirm -ne "y") { Write-Host "Cancelled." -ForegroundColor Yellow; exit 0 }
        Set-Location "$PSScriptRoot\.."
        $branch = (git rev-parse --abbrev-ref HEAD 2>$null)
        if (-not $branch) {
            Write-Host "❌ Not a git repository or could not get current branch." -ForegroundColor Red
            exit 1
        }
        $workflowFile = if ($Platform -eq "android") { "build-android.yml" } else { "build-ios.yml" }
        Write-Host "Triggering $workflowFile for ref $branch (profile $profile)..." -ForegroundColor Cyan
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            $ghPaths = @("$env:ProgramFiles\GitHub CLI\gh.exe", "${env:ProgramFiles(x86)}\GitHub CLI\gh.exe", "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe")
            foreach ($p in $ghPaths) {
                if (Test-Path $p) { $env:PATH = "$(Split-Path $p);$env:PATH"; break }
            }
        }
        gh workflow run $workflowFile -f profile=$profile --ref $branch
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  Could not trigger workflow (workflow must exist on default branch). Run manually: gh workflow run $workflowFile -f profile=$profile --ref $branch" -ForegroundColor Yellow
        } else {
            Write-Host "✅ Triggered $Platform build on $branch. See Actions tab for run." -ForegroundColor Green
        }
        exit 0
    }

    # EAS local does not support Windows (macOS or Linux only). Warn and exit for local + Windows.
    if ($Local -and $Platform -eq "android" -and $env:OS -eq "Windows_NT") {
        Write-Host "❌ EAS local build for Android is not supported on Windows (Expo requires macOS or Linux)." -ForegroundColor Red
        Write-Host "   Options:" -ForegroundColor Yellow
        Write-Host "   1. Use GitHub Actions: push to main or run 'gh workflow run build-android.yml' (builds on Linux)." -ForegroundColor White
        Write-Host "   2. Use EAS cloud (this script without -Local): run again and choose 'n' for build locally." -ForegroundColor White
        Write-Host "   3. Use WSL: run this script from inside WSL (Linux) on your PC." -ForegroundColor White
        exit 1
    }
    if ($Local -and $Platform -eq "ios" -and $env:OS -eq "Windows_NT") {
        Write-Host "❌ EAS local build for iOS requires macOS (Xcode). Windows cannot build iOS." -ForegroundColor Red
        Write-Host "   Use GitHub Actions: 'gh workflow run build-ios.yml' or push to main." -ForegroundColor Yellow
        exit 1
    }

    $confirm = Prompt-WithValidation "`nProceed with deployment? (y/n)" @("y", "n")
    if ($confirm -ne "y") {
        Write-Host "Deployment cancelled." -ForegroundColor Yellow
        exit 0
    }

    # Run the build
    Run-EasBuild -Platform $Platform -Profile $profile -Local:$Local

} catch {
    Write-Host "❌ Script error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

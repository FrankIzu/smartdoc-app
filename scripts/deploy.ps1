# Deploy script for GrabDocs mobile app
# This script handles platform selection, environment selection, build number updates, and EAS build execution
#
# Usage:
#   Interactive mode: .\scripts\deploy.ps1
#   Direct parameters: .\scripts\deploy.ps1 -Platform android -Environment development -BuildNumber 6
#                      .\scripts\deploy.ps1 -Platform ios -Environment prod -BuildNumber 6

param(
    [string]$Platform,
    [string]$Environment,
    [string]$BuildNumber
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

# Function to update build numbers
function Update-BuildNumber {
    param(
        [string]$Platform,
        [string]$BuildNumber
    )

    Write-Host "📝 Updating build number to $BuildNumber for $Platform..." -ForegroundColor Yellow

    if ($Platform -eq "ios") {
        # Update iOS buildNumber in app.json
        $appJsonPath = "$PSScriptRoot\..\app.json"
        $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
        $appJson.expo.ios.buildNumber = $BuildNumber
        $appJson | ConvertTo-Json -Depth 10 | Set-Content $appJsonPath -Encoding UTF8
        Write-Host "✅ Updated iOS buildNumber in app.json" -ForegroundColor Green
    }
    elseif ($Platform -eq "android") {
        # Update Android versionCode in build.gradle
        $buildGradlePath = "$PSScriptRoot\..\android\app\build.gradle"
        $content = Get-Content $buildGradlePath -Raw
        $content = $content -replace '(?<=versionCode\s+)\d+', $BuildNumber
        Set-Content $buildGradlePath $content -Encoding UTF8
        Write-Host "✅ Updated Android versionCode in build.gradle" -ForegroundColor Green
    }
}

# Function to run EAS build
function Run-EasBuild {
    param(
        [string]$Platform,
        [string]$Profile
    )

    Write-Host "🏗️  Running EAS build for $Platform ($Profile)..." -ForegroundColor Yellow

    # Use npx to run eas command (works even if eas is not globally installed)
    $command = "npx eas-cli build --platform $Platform --profile $Profile --non-interactive"

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

    # Handle build number for production
    if ($normalizedEnv -eq "production") {
        if (-not $BuildNumber) {
            # Get current build number to display
            $currentBuildNumber = Get-CurrentBuildNumber -Platform $Platform
            if ($currentBuildNumber) {
                Write-Host "📦 Current build number: $currentBuildNumber" -ForegroundColor Cyan
                $BuildNumber = Read-Host "Enter new build number for production (current: $currentBuildNumber)"
            } else {
                $BuildNumber = Read-Host "Enter build number for production"
            }
        }

        if ($BuildNumber -match '^\d+$') {
            Update-BuildNumber -Platform $Platform -BuildNumber $BuildNumber
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
    if ($Environment -eq "prod") {
        Write-Host "   Build Number: $BuildNumber" -ForegroundColor White
    }

    $confirm = Prompt-WithValidation "`nProceed with deployment? (y/n)" @("y", "n")
    if ($confirm -ne "y") {
        Write-Host "Deployment cancelled." -ForegroundColor Yellow
        exit 0
    }

    # Run the build
    Run-EasBuild -Platform $Platform -Profile $profile

} catch {
    Write-Host "❌ Script error: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

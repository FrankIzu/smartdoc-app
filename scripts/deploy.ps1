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

    # Normalize platform to lowercase to avoid case-sensitivity issues
    $Platform = $Platform.ToLower()

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
            # Get Android versionCode from app.json (EAS reads from here)
            $appJsonPath = "$PSScriptRoot\..\app.json"
            if (Test-Path $appJsonPath) {
                $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
                if ($appJson.expo.android -and $appJson.expo.android.versionCode) {
                    return $appJson.expo.android.versionCode.ToString()
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

    # Normalize platform to lowercase to avoid case-sensitivity issues
    $Platform = $Platform.ToLower()

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
            # Update Android versionCode in app.json (EAS reads from here)
            $appJsonPath = "$PSScriptRoot\..\app.json"
            if (-not (Test-Path $appJsonPath)) {
                throw "app.json not found at $appJsonPath"
            }
            $appJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
            if (-not $appJson.expo.android) {
                throw "expo.android section not found in app.json"
            }
            # Ensure android section exists
            if (-not $appJson.expo.android) {
                $appJson.expo | Add-Member -MemberType NoteProperty -Name "android" -Value @{} -Force
            }
            
            # Convert BuildNumber to int for app.json (it should be a number, not string)
            $appJson.expo.android.versionCode = [int]$BuildNumber
            
            # Write to temp file first, then move to ensure atomic write
            $tempPath = "$appJsonPath.tmp"
            $appJson | ConvertTo-Json -Depth 10 | Set-Content $tempPath -Encoding UTF8
            Move-Item -Path $tempPath -Destination $appJsonPath -Force
            
            # Verify the update was successful
            Start-Sleep -Milliseconds 100  # Brief pause to ensure file is written
            $verifyJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
            if (-not $verifyJson.expo.android -or -not $verifyJson.expo.android.versionCode) {
                throw "Failed to verify versionCode was written to app.json"
            }
            $actualVersionCode = $verifyJson.expo.android.versionCode
            if ([int]$actualVersionCode -eq [int]$BuildNumber) {
                Write-Host "✅ Updated Android versionCode in app.json to $actualVersionCode" -ForegroundColor Green
            } else {
                throw "Expected versionCode $BuildNumber but found $actualVersionCode in app.json"
            }
            
            # Also update Android versionCode in build.gradle (for local builds)
            # Note: For EAS Build, Expo prebuild will sync from app.json, so this is mainly for local builds
            $buildGradlePath = "$PSScriptRoot\..\android\app\build.gradle"
            if (-not (Test-Path $buildGradlePath)) {
                throw "build.gradle not found at $buildGradlePath"
            }
            $content = Get-Content $buildGradlePath -Raw
            if ($content -notmatch 'versionCode') {
                throw "versionCode not found in build.gradle"
            }
            # More robust regex: match versionCode followed by whitespace and digits, replace the digits
            # This handles: versionCode 25, versionCode=25, versionCode  25, etc.
            if ($content -match '(?m)(^\s*versionCode\s+)(\d+)') {
                $oldValue = $matches[2]
                $content = $content -replace '(?m)(^\s*versionCode\s+)(\d+)', "`${1}$BuildNumber"
                Set-Content $buildGradlePath $content -Encoding UTF8
                
                # Verify the update was successful
                $verifyContent = Get-Content $buildGradlePath -Raw
                if ($verifyContent -match '(?m)^\s*versionCode\s+(\d+)') {
                    $actualValue = $matches[1]
                    if ([int]$actualValue -eq [int]$BuildNumber) {
                        Write-Host "✅ Updated Android versionCode in build.gradle from $oldValue to $actualValue" -ForegroundColor Green
                    } else {
                        Write-Host "⚠️  Warning: Expected versionCode $BuildNumber but found $actualValue in build.gradle" -ForegroundColor Yellow
                    }
                }
            } else {
                Write-Host "⚠️  Could not find versionCode pattern in build.gradle to update" -ForegroundColor Yellow
                Write-Host "   EAS Build will use versionCode from app.json during prebuild" -ForegroundColor Gray
            }
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

    # Normalize platform to lowercase to avoid case-sensitivity issues
    $Platform = $Platform.ToLower()

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

    # Auto commit, push to francis, merge to main, and push main
    Write-Host "`n📦 Git Operations:" -ForegroundColor Cyan
    Set-Location "$PSScriptRoot\.."
    
    # Check if we're in a git repository
    $gitRoot = git rev-parse --show-toplevel 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Host "⚠️  Not a git repository. Skipping git operations." -ForegroundColor Yellow
    } else {
        $currentBranch = git rev-parse --abbrev-ref HEAD 2>&1
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
            Write-Host "⚠️  Could not determine current branch. Skipping git operations." -ForegroundColor Yellow
        } else {
            $currentBranch = $currentBranch.Trim()
            Write-Host "   Current branch: $currentBranch" -ForegroundColor Gray
            
            # Ensure we're on francis branch first
            if ($currentBranch -ne "francis") {
                Write-Host "`n🔄 Switching to francis branch..." -ForegroundColor Yellow
                git checkout francis 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "❌ Failed to switch to francis branch" -ForegroundColor Red
                    Write-Host "   Please ensure the francis branch exists: git checkout -b francis" -ForegroundColor Yellow
                    exit 1
                }
                Write-Host "✅ Switched to francis branch" -ForegroundColor Green
                $currentBranch = "francis"
            }
            
            # Check if there are changes to commit
            git diff --quiet --exit-code 2>&1 | Out-Null
            $hasUncommittedChanges = $LASTEXITCODE -ne 0
            
            git diff --cached --quiet --exit-code 2>&1 | Out-Null
            $hasStagedChanges = $LASTEXITCODE -ne 0
            
            $untrackedFiles = git ls-files --others --exclude-standard 2>&1
            $hasUntrackedFiles = $untrackedFiles.Count -gt 0
            
            if ($hasUncommittedChanges -or $hasStagedChanges -or $hasUntrackedFiles) {
                Write-Host "`n📝 Staging changes..." -ForegroundColor Yellow
                
                # Stage all changes including untracked files
                git add -A 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "⚠️  Warning: git add failed. Continuing anyway..." -ForegroundColor Yellow
                }
                
                # Create commit message
                $commitMessage = if ($normalizedEnv -eq "production") {
                    if ($Platform -eq "android") {
                        "Deploy Android v$Version (versionCode $BuildNumber) to production"
                    } else {
                        "Deploy iOS v$Version (buildNumber $BuildNumber) to production"
                    }
                } else {
                    "Deploy $Platform to $normalizedEnv"
                }
                
                Write-Host "   Committing changes..." -ForegroundColor Yellow
                git commit -m $commitMessage 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "⚠️  Warning: git commit failed (maybe no changes to commit). Continuing..." -ForegroundColor Yellow
                } else {
                    Write-Host "✅ Committed changes: $commitMessage" -ForegroundColor Green
                }
            } else {
                Write-Host "   No changes to commit" -ForegroundColor Gray
            }
            
            # Push to francis branch
            Write-Host "`n⬆️  Pushing to francis branch..." -ForegroundColor Yellow
            git push origin francis 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to push to francis branch" -ForegroundColor Red
                Write-Host "   Error: git push origin francis failed" -ForegroundColor Red
                Write-Host "   Please check your git credentials and remote configuration" -ForegroundColor Yellow
                exit 1
            }
            Write-Host "✅ Pushed to francis branch" -ForegroundColor Green
            
            # Merge francis into main
            Write-Host "`n🔀 Merging francis into main..." -ForegroundColor Yellow
            
            # Check if main branch exists locally
            $mainExists = git show-ref --verify --quiet refs/heads/main 2>&1
            if ($LASTEXITCODE -ne 0) {
                # Try to checkout main from remote
                Write-Host "   Main branch doesn't exist locally. Checking out from remote..." -ForegroundColor Gray
                git checkout -b main origin/main 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "⚠️  Warning: Could not checkout main branch from remote." -ForegroundColor Yellow
                    Write-Host "   Creating main branch..." -ForegroundColor Gray
                    git checkout -b main 2>&1 | Out-Null
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "❌ Failed to create main branch" -ForegroundColor Red
                        exit 1
                    }
                }
            } else {
                git checkout main 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "❌ Failed to switch to main branch" -ForegroundColor Red
                    exit 1
                }
            }
            
            # Simplest approach: Reset main to match francis exactly, then force push
            # This avoids merge conflicts and ensures main always matches francis
            Write-Host "   Resetting main to match francis exactly..." -ForegroundColor Gray
            git reset --hard francis 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "❌ Failed to reset main to francis" -ForegroundColor Red
                Write-Host "   Switching back to francis branch..." -ForegroundColor Yellow
                git checkout francis 2>&1 | Out-Null
                Write-Host "✅ Switched back to francis branch" -ForegroundColor Green
                exit 1
            }
            Write-Host "✅ Reset main to match francis exactly" -ForegroundColor Green
            
            # Force push main (required since we reset main's history)
            Write-Host "`n⬆️  Pushing main branch (force-with-lease)..." -ForegroundColor Yellow
            git push origin main --force-with-lease 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "   Force-with-lease failed, trying regular force push..." -ForegroundColor Yellow
                git push origin main --force 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "❌ Failed to push main branch" -ForegroundColor Red
                    Write-Host "   Switching back to francis branch..." -ForegroundColor Yellow
                    git checkout francis 2>&1 | Out-Null
                    Write-Host "✅ Switched back to francis branch" -ForegroundColor Green
                    Write-Host "   Push manually: git checkout main && git push origin main --force" -ForegroundColor Gray
                    exit 1
                }
            }
            Write-Host "✅ Pushed main branch" -ForegroundColor Green
            
            # Switch back to francis branch for continued work
            Write-Host "`n🔄 Switching back to francis branch..." -ForegroundColor Yellow
            git checkout francis 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "⚠️  Warning: Could not switch back to francis branch" -ForegroundColor Yellow
            } else {
                Write-Host "✅ Switched back to francis branch" -ForegroundColor Green
            }
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
        
        # Verify values in app.json match what we expect
        Write-Host "`n🔍 Verifying app.json values:" -ForegroundColor Cyan
        $appJsonPath = "$PSScriptRoot\..\app.json"
        $verifyJson = Get-Content $appJsonPath -Raw | ConvertFrom-Json
        if ($Platform -eq "android") {
            $actualVersionCode = $verifyJson.expo.android.versionCode
            Write-Host "   Android versionCode in app.json: $actualVersionCode" -ForegroundColor $(if ([int]$actualVersionCode -eq [int]$BuildNumber) { "Green" } else { "Red" })
            if ([int]$actualVersionCode -ne [int]$BuildNumber) {
                Write-Host "   ⚠️  WARNING: Mismatch! Expected $BuildNumber but found $actualVersionCode" -ForegroundColor Red
            }
        } else {
            $actualBuildNumber = $verifyJson.expo.ios.buildNumber
            Write-Host "   iOS buildNumber in app.json: $actualBuildNumber" -ForegroundColor $(if ($actualBuildNumber -eq $BuildNumber) { "Green" } else { "Red" })
            if ($actualBuildNumber -ne $BuildNumber) {
                Write-Host "   ⚠️  WARNING: Mismatch! Expected $BuildNumber but found $actualBuildNumber" -ForegroundColor Red
            }
        }
    }

    # If -Local was not passed, prompt: local / cloud / GitHub Actions
    $useGitHubActions = $false
    if (-not $PSBoundParameters.ContainsKey('Local')) {
        $where = Prompt-WithValidation "Where to build? (1) This machine [EAS local], (2) EAS cloud, (3) GitHub Actions" @("1", "2", "3") "2"
        if ($where -eq "1") { $Local = $true }
        elseif ($where -eq "3") { $useGitHubActions = $true }
        else { $Local = $false }
    }

    # GitHub Actions: trigger workflow (branch already pushed earlier)
    if ($useGitHubActions) {
        Write-Host "`n🚀 Triggering GitHub Actions workflow..." -ForegroundColor Cyan
        Set-Location "$PSScriptRoot\.."
        # Use 'main' branch for workflow_dispatch (GitHub requires workflows on default branch)
        # The script already merged francis into main and pushed main earlier
        $workflowFile = if ($Platform -eq "android") { "build-android.yml" } else { "build-ios.yml" }
        Write-Host "Triggering $workflowFile for ref main (profile $profile)..." -ForegroundColor Cyan
        if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
            $ghPaths = @("$env:ProgramFiles\GitHub CLI\gh.exe", "${env:ProgramFiles(x86)}\GitHub CLI\gh.exe", "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe")
            foreach ($p in $ghPaths) {
                if (Test-Path $p) { $env:PATH = "$(Split-Path $p);$env:PATH"; break }
            }
        }
        gh workflow run $workflowFile -f profile=$profile --ref main
        if ($LASTEXITCODE -ne 0) {
            Write-Host "⚠️  Could not trigger workflow." -ForegroundColor Yellow
            Write-Host "   GitHub only allows workflow_dispatch for workflows on the default branch (main)." -ForegroundColor Gray
            Write-Host "   The script already merged francis into main and pushed main." -ForegroundColor Gray
            Write-Host "   Options:" -ForegroundColor Gray
            Write-Host "   1. Verify main branch has the workflow file: gh workflow view $workflowFile --ref main" -ForegroundColor Gray
            Write-Host "   2. Run manually: gh workflow run $workflowFile -f profile=$profile --ref main" -ForegroundColor Gray
            Write-Host "   3. In GitHub: Actions → $workflowFile → Run workflow (select main branch)." -ForegroundColor Gray
        } else {
            Write-Host "✅ Triggered $Platform build on main. See Actions tab for run." -ForegroundColor Green
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

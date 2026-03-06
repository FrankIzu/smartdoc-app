# Encode the extension .mobileprovision as base64 and set GitHub secret from file
# (avoids UI truncation). Run from repo root.
# Usage:
#   .\scripts\set-extension-profile-secret.ps1 -ProfilePath "C:\Users\...\Downloads\*.mobileprovision"
#   .\scripts\set-extension-profile-secret.ps1  # uses default path if only one match

param(
    [string]$ProfilePath = "",
    [string]$Repo = ""  # e.g. "owner/repo"; if empty, gh uses current repo
)

$ErrorActionPreference = "Stop"

if (-not $ProfilePath) {
    $default = Join-Path $env:USERPROFILE "Downloads\*GrabDocsBroadcastUpload*.mobileprovision"
    $found = Get-Item $default -ErrorAction SilentlyContinue
    if (-not $found) {
        Write-Error "No profile path given and none found at $default. Use -ProfilePath 'C:\path\to\file.mobileprovision'"
    }
    if ($found.Count -gt 1) { $found = $found[0] }
    $ProfilePath = $found.FullName
}

if (-not (Test-Path $ProfilePath)) {
    Write-Error "File not found: $ProfilePath"
}

$bytes = [IO.File]::ReadAllBytes($ProfilePath)
$b64 = [Convert]::ToBase64String($bytes)
$len = $b64.Length
Write-Host "Profile: $ProfilePath"
Write-Host "Base64 length: $len chars (decoded size: $($bytes.Length) bytes)"
if ($bytes.Length -lt 10000) {
    Write-Warning "Decoded size is under 10KB; this may not be a full App Store profile."
}

$outFile = Join-Path $env:TEMP "grabdocs-ext-profile-base64.txt"
$b64 | Set-Content -Path $outFile -NoNewline -Encoding ASCII
Write-Host "Written to $outFile"

$repoArgs = @()
if ($Repo) { $repoArgs += "--repo"; $repoArgs += $Repo }

Write-Host ""
Write-Host "Setting EXT_PROVISIONING_PROFILE_BASE64 via pipe (avoids truncation)..."
Get-Content -Path $outFile -Raw | gh secret set EXT_PROVISIONING_PROFILE_BASE64 @repoArgs
if ($LASTEXITCODE -ne 0) {
    Write-Error "gh secret set failed. Ensure 'gh' is installed and you're logged in (gh auth login)."
}

Write-Host "Setting EXT_PROVISIONING_PROFILE_UUID..."
gh secret set EXT_PROVISIONING_PROFILE_UUID @repoArgs --body "ea2dc96a-0b9c-44da-a079-dbf6b3ee8121"
if ($LASTEXITCODE -ne 0) { Write-Warning "EXT_PROVISIONING_PROFILE_UUID set failed (optional)." }

Remove-Item $outFile -Force -ErrorAction SilentlyContinue
Write-Host "Done. Re-run your iOS build."

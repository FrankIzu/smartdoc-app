# Encode GrabDocsBroadcastUpload .mobileprovision to base64 (one line) for GitHub secret EXT_PROVISIONING_PROFILE_BASE64.
# The profile MUST have App Groups capability and include group.com.grabdocs.mobile (or your app group).
# In Apple Developer: App ID (com.grabdocs.mobile.GrabDocsBroadcastUpload) -> Capabilities -> App Groups -> enable and add the group.
param([string]$InputPath = "C:\Users\frank\Downloads\GrabDocsBroadcastUpload_AppStore (1).mobileprovision")
$bytes = [IO.File]::ReadAllBytes($InputPath)
$base64 = [Convert]::ToBase64String($bytes)
$outPath = Join-Path (Join-Path $PSScriptRoot "..") "ext-profile-base64.txt"
[IO.File]::WriteAllText($outPath, $base64)
Write-Host "Wrote base64 ($($base64.Length) chars) to $outPath"
Write-Host "Copy the entire file contents into GitHub Secret EXT_PROVISIONING_PROFILE_BASE64"

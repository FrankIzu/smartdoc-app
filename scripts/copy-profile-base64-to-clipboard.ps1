# Put extension profile base64 in clipboard. Usage: .\copy-profile-base64-to-clipboard.ps1 -ProfilePath "path"
param([string]$ProfilePath = "C:\Users\frank\Downloads\[expo]_comgrabdocsmobileGrabDocsBroadcastUpload_AppStore_20260306T024927048Z.mobileprovision")
$p = (Get-Item -LiteralPath $ProfilePath).FullName
$bytes = [IO.File]::ReadAllBytes($p)
$b64 = [Convert]::ToBase64String($bytes)
Set-Clipboard -Value $b64
Write-Host "Base64 in clipboard: $($b64.Length) chars"

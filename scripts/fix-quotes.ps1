$path = Join-Path $PSScriptRoot "submit-ios-local.ps1"
$content = [System.IO.File]::ReadAllText($path)
$asciiQuote = [char]34
foreach ($code in @(0x201C, 0x201D, 0x201E, 0x201F, 0xFF02)) {
    $content = $content.Replace([char]$code, $asciiQuote)
}
[System.IO.File]::WriteAllText($path, $content)
Write-Host "Done."

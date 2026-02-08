# Convert App Store Connect API key (.p8) to base64
# Usage: .\scripts\convert-p8-to-base64.ps1 [path-to-p8-file]

param(
    [string]$P8Path = ""
)

Write-Host "🔐 App Store Connect API Key Converter" -ForegroundColor Cyan
Write-Host "=====================================" -ForegroundColor Cyan

# If no path provided, look for common locations
if ([string]::IsNullOrWhiteSpace($P8Path)) {
    Write-Host "`n🔍 Looking for .p8 files..." -ForegroundColor Yellow
    
    # Check Downloads folder
    $downloadsPath = "$env:USERPROFILE\Downloads\AuthKey_94J2FT265G.p8"
    if (Test-Path $downloadsPath) {
        $P8Path = $downloadsPath
        Write-Host "   Found in Downloads: $P8Path" -ForegroundColor Green
    } else {
        # Check current directory
        $currentDirP8 = Get-ChildItem -Path . -Filter "*.p8" -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($currentDirP8) {
            $P8Path = $currentDirP8.FullName
            Write-Host "   Found in current directory: $P8Path" -ForegroundColor Green
        } else {
            Write-Host "   No .p8 file found. Please provide the path:" -ForegroundColor Yellow
            Write-Host "   .\scripts\convert-p8-to-base64.ps1 -P8Path C:\path\to\AuthKey_94J2FT265G.p8" -ForegroundColor White
            exit 1
        }
    }
}

# Verify file exists
if (-not (Test-Path $P8Path)) {
    Write-Host "`n❌ File not found: $P8Path" -ForegroundColor Red
    exit 1
}

Write-Host "`n📄 Reading .p8 file..." -ForegroundColor Yellow
Write-Host "   Path: $P8Path" -ForegroundColor Gray

try {
    # Read the .p8 file content
    $p8Content = Get-Content $P8Path -Raw -Encoding UTF8
    
    # Convert to base64
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($p8Content)
    $base64 = [Convert]::ToBase64String($bytes)
    
    Write-Host "`n✅ Conversion successful!" -ForegroundColor Green
    Write-Host "`n📋 Your App Store Connect API Key Information:" -ForegroundColor Cyan
    Write-Host "   Key ID: 94J2FT265G" -ForegroundColor White
    Write-Host "   Issuer ID: [Get this from App Store Connect]" -ForegroundColor Yellow
    Write-Host "   Base64 Key:" -ForegroundColor White
    Write-Host $base64 -ForegroundColor Gray
    
    Write-Host "`n💡 Next steps:" -ForegroundColor Cyan
    Write-Host "   1. Copy the Base64 Key above" -ForegroundColor White
    Write-Host "   2. Get your Issuer ID from:" -ForegroundColor White
    Write-Host "      https://appstoreconnect.apple.com → Users and Access → Integrations → App Store Connect API" -ForegroundColor Gray
    Write-Host "   3. Add these to .env.local:" -ForegroundColor White
    Write-Host "      ASC_KEY_ID=94J2FT265G" -ForegroundColor Gray
    Write-Host "      ASC_ISSUER_ID=your-issuer-id-here" -ForegroundColor Gray
    Write-Host "      ASC_KEY_P8_BASE64=your-base64-key-here" -ForegroundColor Gray
    
    # Optionally save to clipboard
    try {
        Set-Clipboard $base64
        Write-Host "`n✅ Base64 key copied to clipboard!" -ForegroundColor Green
    } catch {
        Write-Host "`n⚠️  Could not copy to clipboard automatically" -ForegroundColor Yellow
    }
    
} catch {
    Write-Host "`n❌ Error converting file: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# GrabDocs Brand Assets

Complete brand asset library for GrabDocs, organized by use case and format.

## Folder Structure

```
grabdocs-brand/
├── svg/              # Vector graphics (SVG format)
├── png/              # Raster graphics (PNG format)
├── social/           # Social media assets
└── favicon/          # Favicon files
```

## Asset Inventory

### PNG Assets (`/png`)

| File | Size | Use Case |
|------|------|----------|
| `icon-1024-light.png` | 1024×1024 | Master icon (light background) |
| `icon-1024-dark.png` | 1024×1024 | Master icon (dark background) |
| `icon-512.png` | 512×512 | PWA icon (large) |
| `icon-192.png` | 192×192 | PWA icon (small) |
| `logo-3000x1000-light.png` | 3000×1000 | Master wordmark (light background) |
| `logo-3000x1000-dark.png` | 3000×1000 | Master wordmark (dark background) |
| `logo-1200x400.png` | 1200×400 | Website header, presentations |
| `logo-600x200.png` | 600×200 | Email signatures, smaller displays |
| `linkedin-400.png` | 400×400 | LinkedIn company page logo |
| `linkedin-banner.png` | 1584×396 | LinkedIn company/personal banner |
| `apple-touch-icon.png` | 180×180 | iOS home screen icon |

### Favicon Assets (`/favicon`)

| File | Size | Use Case |
|------|------|----------|
| `favicon.ico` | 48×48 | Browser tab icon (multi-size ICO) |
| `favicon-16x16.png` | 16×16 | Small favicon reference |
| `favicon-32x32.png` | 32×32 | Standard favicon reference |
| `favicon-48x48.png` | 48×48 | Large favicon reference |

### SVG Assets (`/svg`)

**⚠️ IMPORTANT:** SVG files are placeholders and need to be created from **true vector source files** (Illustrator, Figma, etc.)

**Do NOT export SVG from raster images.** Must be vector paths, not embedded images.

| File | Description |
|------|-------------|
| `icon-dark.svg` | Icon only - dark version (for light backgrounds) |
| `icon-light.svg` | Icon only - light version (for dark backgrounds) |
| `logo-dark.svg` | Wordmark logo - dark version (for light backgrounds) |
| `logo-light.svg` | Wordmark logo - light version (for dark backgrounds) |
| `icon-mono.svg` | Monochrome icon (optional - for diagrams, watermarks) |

## Usage Guidelines

### Website/App Integration

1. **Header/Navbar**: Use `logo-1200x400.png` or SVG version
2. **Favicon**: Use `favicon/favicon.ico`
3. **PWA Icons**: Use `icon-512.png` and `icon-192.png`
4. **Apple Touch Icon**: Use `apple-touch-icon.png`

### Email

- **Email Signatures**: Use `logo-600x200.png` (same file used for email)
- **Email Headers**: Use `logo-600x200.png` or `logo-1200x400.png`

### Social Media

- **LinkedIn Company Logo**: Use `linkedin-400.png`
- **LinkedIn Banner**: Use `linkedin-banner.png` (in `/png` folder)

### Presentations & Marketing

- **Pitch Decks**: Use `logo-3000x1000.png` or SVG version
- **Marketing Materials**: Use appropriate size from `/png` folder

## Color Specifications

- **Light Background**: Use `-light.png` versions or `-dark.svg` (dark logo on light bg)
- **Dark Background**: Use `-dark.png` versions or `-light.svg` (light/inverted logo on dark bg)
- **Transparent Background**: All logos support transparency (PNG with alpha channel)

### Light/Dark Variants

**PNG Files:**
- `icon-1024-light.png` / `icon-1024-dark.png` - Master icons
- `logo-3000x1000-light.png` / `logo-3000x1000-dark.png` - Master wordmarks

**SVG Files:**
- `icon-light.svg` / `icon-dark.svg` - Icon variants
- `logo-light.svg` / `logo-dark.svg` - Wordmark variants

**Note:** Other sizes (512, 192, 1200×400, 600×200) are provided in light version only. Use master files to generate additional sizes if needed.

## Final Asset List (Complete)

### PNG Files (11 files)
- ✅ `icon-1024-light.png` - Master icon (light)
- ✅ `icon-1024-dark.png` - Master icon (dark)
- ✅ `icon-512.png` - PWA icon (large)
- ✅ `icon-192.png` - PWA icon (small)
- ✅ `logo-3000x1000-light.png` - Master wordmark (light)
- ✅ `logo-3000x1000-dark.png` - Master wordmark (dark)
- ✅ `logo-1200x400.png` - Website header
- ✅ `logo-600x200.png` - Email signatures
- ✅ `linkedin-400.png` - LinkedIn logo
- ✅ `linkedin-banner.png` - LinkedIn banner
- ✅ `apple-touch-icon.png` - iOS icon

### SVG Files (5 files - placeholders)
- ⏳ `icon-light.svg` - Icon (light version)
- ⏳ `icon-dark.svg` - Icon (dark version)
- ⏳ `logo-light.svg` - Wordmark (light version)
- ⏳ `logo-dark.svg` - Wordmark (dark version)
- ⏳ `icon-mono.svg` - Monochrome icon (optional)

### Favicon Files (4 files)
- ✅ `favicon.ico` - Multi-size ICO (16×16, 32×32, 48×48)
- ✅ `favicon-16x16.png` - Reference
- ✅ `favicon-32x32.png` - Reference
- ✅ `favicon-48x48.png` - Reference

## Next Steps

1. ✅ PNG assets generated and ready to use
2. ⏳ Create SVG files from **true vector source** (Illustrator/Figma) - **Do NOT export from raster**
3. ⏳ Test favicon in all major browsers
4. ⏳ Update application code to use new asset paths
5. ⏳ Upload to CDN if using external asset hosting

## Technical Notes

- All PNG files are optimized for web use
- Logos are centered on white backgrounds with proper padding
- Favicon includes multiple sizes (16×16, 32×32, 48×48) in ICO format
- All assets maintain original aspect ratios
- High-quality LANCZOS resampling used for all resizing operations


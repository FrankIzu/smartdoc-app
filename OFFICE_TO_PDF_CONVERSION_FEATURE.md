# Office Document to PDF Conversion Feature - Implementation Guide

## Overview

This feature automatically converts Office documents (Word, Excel, PowerPoint) to PDF format for better viewing experience, especially on mobile devices and web browsers. The conversion happens in two phases:

1. **Save-time conversion** (during upload): Creates PDF version proactively
2. **View-time conversion** (on-demand): Converts when viewing if PDF doesn't exist

---

## Feature Architecture

### Two-Phase Conversion Strategy

#### Phase 1: Save-Time Conversion (Proactive)
- **When**: During file upload/save process
- **Where**: `shared_file_processing_pipeline_with_progress()` in `app_utils.py`
- **Purpose**: Pre-convert Office documents to PDF for faster viewing later
- **Storage**: PDF saved alongside original file in `processed/` directory

#### Phase 2: View-Time Conversion (On-Demand)
- **When**: When user requests to view an Office document
- **Where**: View endpoints (`mobile_view_file`, `view_file_internal`)
- **Purpose**: Convert on-the-fly if PDF version doesn't exist
- **Storage**: Temporary files (cleaned up after serving)

---

## File Storage Structure

### Directory Layout

```
data/
├── {company_id}/
│   └── users/
│       └── {username}/
│           ├── uploads/          # Original Office files
│           │   └── 20260129_031508_FALL_2025_Schedule.xlsx
│           └── processed/        # PDF versions
│               └── 20260129_FALL_2025_Schedule.pdf
```

### Naming Convention

**Original Office File:**
- Format: `{timestamp}_{original_name}.{ext}`
- Example: `20260129_031508_FALL_2025_Schedule.xlsx`

**PDF Version:**
- Format: `{timestamp}_{original_name}.pdf`
- Example: `20260129_FALL_2025_Schedule.pdf`
- **Note**: Timestamp prefix matches original file for easy lookup

### Database Storage

**Files Table:**
- `filepath`: Stores **original Office file** path (S3 URL or local path)
- `filename`: Stores unique filename (e.g., `20260129_031508_FALL_2025_Schedule.xlsx`)
- `original_filename`: Stores user's original filename (e.g., `FALL_2025_Schedule.xlsx`)
- **PDF path is NOT stored in database** - found via naming convention

---

## Office Document Detection

### Supported Formats

```python
office_extensions = [
    '.doc', '.docx',    # Word documents
    '.xls', '.xlsx',    # Excel spreadsheets
    '.ppt', '.pptx',    # PowerPoint presentations
    '.odt', '.ods', '.odp'  # OpenDocument formats
]
```

### Detection Function

```python
def _is_office_document(filename):
    """Check if a file is an Office document"""
    if not filename:
        return False
    filename_lower = filename.lower()
    office_extensions = ['.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.odt', '.ods', '.odp']
    return any(filename_lower.endswith(ext) for ext in office_extensions)
```

---

## Phase 1: Save-Time Conversion

### Flow Diagram

```
File Upload
    ↓
LocalAssetManager.save_processed_file()
    ↓
Detect Office Document → Set needs_pdf_conversion = True
    ↓
Return file_info with pdf_filename
    ↓
shared_file_processing_pipeline_with_progress()
    ↓
Check needs_pdf_conversion flag
    ↓
LocalAssetManager.convert_office_to_pdf()
    ↓
[Conversion Methods: LibreOffice → unoconv → pandoc]
    ↓
Save PDF to processed/ directory
    ↓
Upload PDF to S3 (if configured)
    ↓
Store PDF path in file_info['pdf_path']
```

### Implementation Details

**Location**: `backend/utils/app_utils.py` (lines 1617-1631)

```python
# Convert Office documents to PDF for mobile preview
if file_info.get('needs_pdf_conversion', False):
    pdf_filename = file_info.get('pdf_filename')
    if pdf_filename:
        pdf_path = asset_manager.convert_office_to_pdf(file_path, pdf_filename)
        if pdf_path:
            logger.info(f"Successfully created PDF version: {pdf_path}")
            file_info['pdf_path'] = pdf_path
```

**Location**: `backend/local_asset_manager.py` (lines 780-784)

```python
# Check if this is an Office document that needs PDF conversion
if self._is_office_document(filename):
    logger.info(f"Office document detected: {filename}, will create PDF version")
    result['needs_pdf_conversion'] = True
    result['pdf_filename'] = f"{timestamp}_{secure_name.rsplit('.', 1)[0]}.pdf"
```

### Conversion Method: `convert_office_to_pdf()`

**Location**: `backend/local_asset_manager.py` (lines 547-653)

**Conversion Methods (in order of preference):**

1. **LibreOffice** (Primary - most reliable)
   ```bash
   libreoffice --headless --convert-to pdf --outdir {processed_dir} {original_file}
   ```
   - Windows: `soffice.exe` in Program Files
   - Linux/Mac: `libreoffice` or `soffice` command

2. **unoconv** (Fallback)
   ```bash
   unoconv -f pdf -o {pdf_path} {original_file}
   ```

3. **pandoc** (Last resort - limited format support)
   ```bash
   pandoc {original_file} -o {pdf_path}
   ```

**S3 Upload:**
- After successful conversion, PDF is uploaded to S3
- S3 key: `{company_id}/users/{username}/processed/{pdf_filename}`
- Returns S3 URL if upload successful, otherwise local path

---

## Phase 2: View-Time Conversion

### Flow Diagram

```
User Requests View
    ↓
Get file path from database (original Office file)
    ↓
Check if Office document
    ↓
[Local File Path]
    ├─→ Check if PDF exists in processed/ directory
    │   ├─→ Found: Use PDF
    │   └─→ Not Found: Convert on-the-fly
    │
[S3 URL]
    ├─→ Download from S3 to temp file
    ├─→ Convert to PDF
    ├─→ Serve PDF
    └─→ Cleanup temp files
```

### Implementation: Local Files

**Location**: `backend/routes/mobile_routes.py` (lines 3219-3236)

```python
if original_filename and _is_office_document(original_filename) and not is_s3_url:
    # Look for PDF version in processed directory
    pdf_path = _find_pdf_version(file_path, original_filename)
    if pdf_path and os.path.exists(pdf_path):
        # Use existing PDF
        file_path = pdf_path
        stored_filename = os.path.splitext(original_filename)[0] + '.pdf'
    else:
        # Convert on-the-fly
        pdf_path = _convert_office_to_pdf_auto(file_path, original_filename)
        if pdf_path and os.path.exists(pdf_path):
            file_path = pdf_path
            stored_filename = os.path.splitext(original_filename)[0] + '.pdf'
```

### Implementation: S3 Files

**Location**: `backend/routes/mobile_routes.py` (lines 3237-3251)

```python
elif is_s3_url and original_filename and _is_office_document(original_filename):
    # Download, convert, and serve
    pdf_path = _convert_s3_office_to_pdf(file_path, original_filename, file, user_id)
    if pdf_path and os.path.exists(pdf_path):
        file_path = pdf_path
        stored_filename = os.path.splitext(original_filename)[0] + '.pdf'
        temp_pdf_path = pdf_path  # Track for cleanup
```

### Helper Function: `_find_pdf_version()`

**Location**: `backend/routes/mobile_routes.py` (lines 84-125)

**Purpose**: Locate PDF version using naming convention

**Logic:**
1. Extract directory from original file path
2. Replace `uploads/` with `processed/` directory
3. Extract timestamp prefix from original filename
4. Construct PDF filename: `{timestamp}_{base_name}.pdf`
5. Check if PDF exists at that location
6. Fallback: Search for any PDF with matching base name

**Example:**
```
Original: uploads/20260129_031508_FALL_2025_Schedule.xlsx
PDF:      processed/20260129_FALL_2025_Schedule.pdf
```

### Helper Function: `_convert_s3_office_to_pdf()`

**Location**: `backend/routes/mobile_routes.py` (lines 127-263)

**Purpose**: Download S3 Office file, convert to PDF, return temp PDF path

**Steps:**
1. Extract S3 key from URL using `file_access_manager.extract_s3_key_from_url()`
2. Download file from S3 to temporary location (with decryption)
3. Convert to PDF using conversion methods (LibreOffice → unoconv → pandoc)
4. Return temporary PDF path
5. Cleanup temporary Office file immediately
6. **Note**: PDF cleanup handled by caller after serving

**Temporary File Management:**
- Office file: Cleaned up immediately after conversion
- PDF file: Cleaned up after HTTP response is sent (using Flask's `after_this_request`)

---

## Conversion Methods Details

### Method 1: LibreOffice (Recommended)

**Command:**
```bash
libreoffice --headless --convert-to pdf --outdir {output_dir} {input_file}
```

**Platform-Specific:**
- **Windows**: `soffice.exe` in Program Files
  - Common paths:
    - `C:\Program Files\LibreOffice\program\soffice.exe`
    - `C:\Program Files (x86)\LibreOffice\program\soffice.exe`
- **Linux/Mac**: `libreoffice` or `soffice` command

**Output Behavior:**
- LibreOffice creates PDF with same name as input but `.pdf` extension
- Code renames output to desired filename

**Timeout**: 60 seconds

### Method 2: unoconv

**Command:**
```bash
unoconv -f pdf -o {output_path} {input_file}
```

**Requirements:**
- Requires LibreOffice to be installed (uses LibreOffice backend)
- Alternative interface to LibreOffice

**Timeout**: 60 seconds

### Method 3: pandoc

**Command:**
```bash
pandoc {input_file} -o {output_path}
```

**Limitations:**
- Limited format support (mainly text-based formats)
- May not work well for complex Excel/PPT files

**Timeout**: 60 seconds

---

## S3 Integration

### PDF Storage in S3

**S3 Key Pattern:**
```
{company_id}/users/{username}/processed/{pdf_filename}
```

**Example:**
```
0/users/john_doe/processed/20260129_FALL_2025_Schedule.pdf
```

### S3 URL Extraction

**Function**: `file_access_manager.extract_s3_key_from_url()`

**Supported URL Formats:**
- `https://files.grabdocs.com/{company_id}/users/{username}/processed/{filename}`
- `https://{bucket}.s3.amazonaws.com/{key}`
- `https://{bucket}.s3.{region}.amazonaws.com/{key}`
- Generic S3 endpoint URLs

**Extraction Logic:**
1. Check for known domain patterns (`files.grabdocs.com`)
2. Extract path after domain
3. Fallback to generic S3 URL parsing

---

## Error Handling & Fallbacks

### Conversion Failure Scenarios

1. **No conversion tool available**
   - Logs warning
   - Falls back to serving original Office file

2. **Conversion timeout**
   - 60-second timeout per method
   - Tries next method in sequence

3. **S3 download failure**
   - Logs error
   - Returns None (caller serves original file)

4. **File not found**
   - Checks multiple possible locations
   - Falls back to on-the-fly conversion

### Graceful Degradation

- **Best case**: Pre-converted PDF exists → Instant serving
- **Good case**: PDF doesn't exist → Convert on-the-fly
- **Fallback**: Conversion fails → Serve original Office file

---

## Cleanup Mechanisms

### Temporary Files

**S3 Conversion Cleanup:**
```python
# Office file: Cleaned up immediately after conversion
if temp_office_path and os.path.exists(temp_office_path):
    os.unlink(temp_office_path)

# PDF file: Cleaned up after HTTP response
@after_this_request
def cleanup_after_response(response):
    if temp_pdf_path and os.path.exists(temp_pdf_path):
        os.unlink(temp_pdf_path)
    return response
```

**Local Conversion Cleanup:**
- PDF files are permanent (stored in `processed/` directory)
- No cleanup needed (they're part of the file system)

---

## Implementation Checklist for Web Version

### Step 1: Add Helper Functions

1. **`_is_office_document(filename)`**
   - Check if file extension matches Office formats

2. **`_find_pdf_version(file_path, original_filename)`**
   - Locate PDF using naming convention
   - Search in `processed/` directory

3. **`_convert_office_to_pdf_auto(file_path, original_filename)`**
   - Convert local Office file to PDF
   - Try LibreOffice → unoconv → pandoc

4. **`_convert_s3_office_to_pdf(s3_url, original_filename, file_record, user_id)`**
   - Download S3 file
   - Convert to PDF
   - Return temp PDF path

### Step 2: Update View Endpoint

**Location**: `backend/routes/web_routes.py` → `view_file_internal()`

**Add before serving file:**
```python
# Get file path
file_path = get_user_file_path(file, user_id)
original_filename = file.original_filename or file.filename

# Check if Office document
is_s3_url = file_path.startswith('http://') or file_path.startswith('https://')
temp_pdf_path = None

if original_filename and _is_office_document(original_filename):
    if not is_s3_url:
        # Local file: Look for PDF or convert
        pdf_path = _find_pdf_version(file_path, original_filename)
        if pdf_path and os.path.exists(pdf_path):
            file_path = pdf_path
        else:
            pdf_path = _convert_office_to_pdf_auto(file_path, original_filename)
            if pdf_path:
                file_path = pdf_path
    else:
        # S3 file: Convert on-the-fly
        pdf_path = _convert_s3_office_to_pdf(file_path, original_filename, file, user_id)
        if pdf_path:
            file_path = pdf_path
            temp_pdf_path = pdf_path  # Track for cleanup
```

### Step 3: Add Cleanup Handler

**After creating response:**
```python
# Add cleanup for temporary PDF files
if temp_pdf_path and os.path.exists(temp_pdf_path):
    from flask import after_this_request
    
    @after_this_request
    def cleanup_temp_pdf(response):
        try:
            if os.path.exists(temp_pdf_path):
                os.unlink(temp_pdf_path)
                logger.info(f"Cleaned up temporary PDF: {temp_pdf_path}")
        except Exception as e:
            logger.warning(f"Failed to cleanup temp PDF: {e}")
        return response
```

### Step 4: Update File Serving Logic

**Modify file serving to use PDF path:**
```python
# Temporarily update file.filepath if PDF was found/converted
original_filepath = file.filepath
if file_path != get_user_file_path(file, user_id):
    file.filepath = file_path

try:
    response = get_file_access_manager().download_or_prepare_file(
        file, 
        user_id, 
        as_attachment=False
    )
    
    # Set correct Content-Type for PDF
    if file_path.endswith('.pdf'):
        response.headers['Content-Type'] = 'application/pdf'
    
    return response
finally:
    # Restore original filepath
    file.filepath = original_filepath
```

### Step 5: Test Scenarios

1. **Local Office file with existing PDF**
   - Should find and serve PDF

2. **Local Office file without PDF**
   - Should convert on-the-fly and serve PDF

3. **S3 Office file**
   - Should download, convert, serve PDF, cleanup

4. **Conversion failure**
   - Should serve original Office file

5. **Non-Office file**
   - Should serve normally (no conversion)

---

## Key Differences: Mobile vs Web

### Mobile Implementation
- Uses `/api/v1/mobile/file/{id}/view` endpoint
- PDF conversion integrated into view endpoint
- Temporary files cleaned up after response

### Web Implementation (To Be Done)
- Uses `/api/files/{id}/view` endpoint
- Should follow same pattern as mobile
- Same helper functions can be reused

---

## Performance Considerations

### Save-Time Conversion (Proactive)
- **Pros**: Faster viewing (PDF already exists)
- **Cons**: Slower upload (conversion adds time)
- **Best for**: Files that will be viewed multiple times

### View-Time Conversion (On-Demand)
- **Pros**: Faster upload (no conversion delay)
- **Cons**: Slower first view (conversion happens on-demand)
- **Best for**: Files that may not be viewed

### Hybrid Approach (Current)
- Convert during save (proactive)
- Convert on-demand if PDF missing (fallback)
- **Best of both worlds**: Fast upload + reliable viewing

---

## Dependencies

### Required System Tools

1. **LibreOffice** (Primary)
   - Windows: Install LibreOffice
   - Linux: `apt-get install libreoffice` or `yum install libreoffice`
   - Mac: `brew install libreoffice`

2. **unoconv** (Optional fallback)
   - `pip install unoconv` or system package

3. **pandoc** (Optional fallback)
   - `apt-get install pandoc` or `brew install pandoc`

### Python Dependencies
- Already included in existing codebase
- No additional packages needed

---

## Logging

### Key Log Messages

**Save-time:**
- `"Office document detected: {filename}, will create PDF version"`
- `"Successfully created PDF version: {pdf_path}"`
- `"Failed to convert {filename} to PDF, will use original file"`

**View-time:**
- `"Found PDF version for Office document: {pdf_path}"`
- `"No PDF version found, attempting automatic conversion"`
- `"Successfully converted Office document to PDF: {pdf_path}"`
- `"Office document is in S3, attempting PDF conversion"`
- `"Cleaned up temporary PDF file: {temp_pdf_path}"`

---

## Summary

This feature provides seamless Office-to-PDF conversion with:
- **Proactive conversion** during upload for faster viewing
- **On-demand conversion** as fallback for reliability
- **S3 support** with temporary file management
- **Graceful fallback** to original file if conversion fails
- **Automatic cleanup** of temporary files

The implementation uses a naming convention to locate PDFs without storing paths in the database, making it efficient and maintainable.

# External File Upload Implementation - Mobile App

## Overview
This implementation adds Dropbox and Google Drive file upload capabilities to the mobile app, allowing users to import files directly from their cloud storage accounts.

## Files Created/Modified

### New Files Created

#### 1. `services/externalFileServices.ts`
- Main service class for handling external file service integration
- Supports Dropbox and Google Drive OAuth authentication
- Handles file listing, navigation, and downloading from external services
- Uses secure storage for access tokens
- Provides utility methods for file operations

**Key Features:**
- OAuth 2.0 authentication flow using `expo-auth-session`
- Secure token storage with `expo-secure-store`
- File browsing with folder navigation
- Progress tracking for file downloads
- Error handling and user feedback

#### 2. `components/ExternalFilePicker.tsx`
- Modal component for browsing and selecting files from external services
- Provides unified interface for both Dropbox and Google Drive
- Supports folder navigation and file importing
- Shows authentication status for each service
- Includes loading states and progress indicators

**Key Features:**
- Service selection screen with visual indicators
- File browser with folder navigation
- Import progress tracking
- Authentication status display
- Toast notifications for user feedback

### Modified Files

#### 3. `manager-francis/backend/routes/mobile_routes.py`
- Added mobile-specific endpoints for external service integration
- Endpoints for OAuth authentication, file listing, and file downloading
- Mobile-optimized response format
- Integration with existing OAuth helpers

**New Endpoints:**
- `/api/v1/mobile/external-auth/dropbox` - Get Dropbox OAuth URL
- `/api/v1/mobile/external-auth/dropbox/exchange` - Exchange code for token
- `/api/v1/mobile/external-auth/googledrive` - Get Google Drive OAuth URL
- `/api/v1/mobile/external-auth/googledrive/exchange` - Exchange code for token
- `/api/v1/mobile/external-files/dropbox` - Get Dropbox files
- `/api/v1/mobile/external-files/googledrive` - Get Google Drive files
- `/api/v1/mobile/external-download/dropbox` - Download from Dropbox
- `/api/v1/mobile/external-download/googledrive` - Download from Google Drive

#### 4. `app/(tabs)/documents.tsx`
- Added "Import from Cloud" button in header
- Integrated ExternalFilePicker component
- Added state management for external file picker
- Handler functions for file import and success callbacks

**Key Changes:**
- New import button with cloud-download icon
- Modal integration for external file picker
- Refresh documents list after successful import
- Toast notifications for user feedback

#### 5. `app/_layout.tsx`
- Added Toast component for global notifications
- Imported react-native-toast-message for better UX

### Dependencies Added

```json
{
  "expo-auth-session": "^5.x.x",
  "expo-web-browser": "^13.x.x", 
  "expo-secure-store": "^13.x.x",
  "react-native-toast-message": "^2.x.x"
}
```

## Configuration Required

### App Configuration (`app.json`)
The app already has the required URL scheme configured:
```json
{
  "expo": {
    "scheme": "grabdocs"
  }
}
```

### Backend Environment Variables
The implementation uses the **SAME CREDENTIALS** as the existing web application. Ensure these environment variables are set in your `.env` file:

```env
# Dropbox Configuration (same as web app)
DROPBOX_APP_KEY=your_dropbox_app_key
DROPBOX_APP_SECRET=your_dropbox_app_secret

# Google Drive Configuration (same as web app)
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

**✅ VERIFIED: All newly added features use the EXACT SAME credentials as the existing web application**
- Mobile endpoints call `os.getenv('DROPBOX_APP_KEY')` and `os.getenv('DROPBOX_APP_SECRET')`
- Mobile endpoints call `os.getenv('GOOGLE_CLIENT_ID')` and `os.getenv('GOOGLE_CLIENT_SECRET')`
- These are the **identical** credential names used by `oauth_helpers.py` for the web application
- **No additional configuration or separate credentials needed**

## User Flow

### 1. Access External Files
- User navigates to Documents tab
- Taps the cloud-download icon in the header
- External File Picker modal opens

### 2. Service Selection
- User sees available services (Dropbox, Google Drive)
- Green checkmark indicates if already authenticated
- Tap service to connect or browse files

### 3. Authentication (if needed)
- OAuth flow opens in browser
- User authorizes app access
- Returns to app with success notification
- Access token stored securely

### 4. File Browsing
- Browse folders and files
- Tap folders to navigate deeper
- Back button to go up directory levels
- File icons indicate type (folder/document)

### 5. File Import
- Tap file to import
- Progress indicator shows download status
- Success notification when complete
- Documents list refreshes automatically

## Technical Implementation Details

### OAuth Flow
1. App requests auth URL from backend
2. Opens browser with OAuth URL
3. User authorizes access
4. Redirects back to app with code
5. App exchanges code for access token
6. Token stored securely for future use

### File Operations
1. List files using access token
2. Navigate folders using service-specific paths/IDs
3. Download files by ID and filename
4. Save to user's document storage
5. Create database record for tracking

### Security Features
- Access tokens stored in secure storage (Keychain/Keystore)
- Tokens encrypted at rest
- Session-based backend authentication
- No sensitive data in client logs

### Error Handling
- Network connectivity issues
- OAuth authorization failures
- Token expiration and refresh
- File download failures
- Service-specific error messages

## Backend Integration

### Mobile Endpoints
All endpoints follow mobile blueprint pattern:
- Prefixed with `/api/v1/mobile/`
- Mobile-optimized response format
- Session-based authentication required
- Proper error handling and logging

### OAuth Helpers
Reuses existing `oauth_helpers.py` functions:
- `get_dropbox_files()` - List Dropbox files
- `get_google_drive_files()` - List Google Drive files
- `download_dropbox_file()` - Download from Dropbox
- `download_google_drive_file()` - Download from Google Drive

### File Storage
- Files saved in user's processed directory
- Unique filenames with timestamp prefix
- Database records track source service
- Metadata includes original file ID

## Credential Verification Summary

✅ **CONFIRMED**: All external file upload features use the **exact same credentials** as the web application:

### Dropbox Credentials
- **Environment Variables**: `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET`
- **Used by Web**: `oauth_helpers.py` lines 37 and 60
- **Used by Mobile**: `mobile_routes.py` external auth endpoints
- **Status**: ✅ **Identical credentials**

### Google Drive Credentials  
- **Environment Variables**: `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
- **Used by Web**: `oauth_helpers.py` lines 157 and 179
- **Used by Mobile**: `mobile_routes.py` external auth endpoints
- **Status**: ✅ **Identical credentials**

### Integration Benefits
- **No additional setup required**
- **Unified credential management**
- **Consistent OAuth app configuration**
- **Same service account permissions**
- **Shared rate limits and quotas**

## Testing

### Manual Testing Steps
1. Tap cloud-download icon in Documents tab
2. Select Dropbox or Google Drive
3. Complete OAuth flow if needed
4. Browse folders and files
5. Import a test file
6. Verify file appears in Documents list
7. Test with different file types
8. Verify error handling for network issues

### Backend Testing
Created test script: `test-files/test_external_services.py`
- Tests OAuth authentication flow
- Validates file listing functionality
- Tests file download and import
- Verifies error handling

## Future Enhancements

### Planned Features
1. **Multi-file selection** - Import multiple files at once
2. **Folder import** - Import entire folders
3. **Sync status** - Show which files are synced
4. **Offline access** - Cache frequently used files
5. **More services** - OneDrive, iCloud Drive support

### Performance Optimizations
1. **Pagination** - Handle large file lists
2. **Caching** - Cache file listings temporarily
3. **Background download** - Download files in background
4. **Compression** - Optimize file transfer

## Troubleshooting

### Common Issues
1. **OAuth redirect not working**: Verify URL scheme in app.json
2. **Token storage issues**: Check secure storage permissions
3. **File download fails**: Verify backend environment variables
4. **UI not responding**: Check network connectivity

### Debug Logging
- Enable console logs in ExternalFileService
- Check backend logs for OAuth errors
- Verify mobile endpoint responses
- Monitor secure storage operations

## Security Considerations

### Data Protection
- Access tokens encrypted in secure storage
- No credentials stored in plain text
- Backend validates all requests
- Secure OAuth redirect handling

### Privacy
- Users control which files to import
- No automatic syncing or background access
- Clear indication of connected services
- Easy disconnect/revoke access

This implementation provides a complete, secure, and user-friendly way for mobile users to import files from their cloud storage accounts directly into the GrabDocs app using the **same credentials as the web application**. 
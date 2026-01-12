# Apple Sign In Implementation Guide

## Overview

This document describes the Apple Sign In implementation for the GrabDocs mobile app. The implementation follows the same pattern as Google authentication and integrates seamlessly with the existing authentication flow.

## Implementation Details

### 1. Package Installation

- **Package**: `expo-apple-authentication`
- **Version**: Compatible with Expo SDK 54
- **Installation**: `npx expo install expo-apple-authentication`

### 2. Configuration Files

#### `app.json`
- Added `expo-apple-authentication` plugin
- Added `usesAppleSignIn: true` to iOS configuration

#### `constants/Config.ts`
- `APPLE_CLIENT_ID`: Service ID from Apple Developer Console (default: `com.grabdocs.mobile.service`)
- `APPLE_REDIRECT_URI`: Callback URL for web/Android fallback (default: `https://api.grabdocs.com/auth/apple/callback`)

### 3. Service Implementation

**File**: `services/appleAuth.ts`

#### Key Features:
- Native iOS Apple Sign In using `expo-apple-authentication`
- Backend integration with `/api/v1/mobile/auth/apple-login`
- Device security integration (fingerprint, risk scoring, device trust)
- Enhanced 2FA support
- Comprehensive error handling

#### Main Methods:
- `signInWithApple()`: Initiates Apple Sign In flow
- `loginWithAppleToBackend()`: Sends authentication data to backend
- `signInWithAppleEnhanced()`: Full flow with 2FA and device security
- `isAvailableAsync()`: Checks if Apple Sign In is available

### 4. UI Integration

#### Sign-In Screen (`app/(auth)/sign-in.tsx`)
- Apple Sign In button (iOS only)
- Uses native `AppleAuthenticationButton` component
- Availability check before showing button
- Proper error handling and user feedback

#### Sign-Up Screen (`app/(auth)/sign-up.tsx`)
- Apple Sign In button for account creation
- Same availability and error handling as sign-in
- Terms agreement check before sign-up

### 5. Auth Context Enhancement

**File**: `app/context/auth.tsx`

Added `refreshSession()` method to refresh auth state after external authentication, allowing Apple/Google sign-in to properly update the user state.

## Backend Integration

### Endpoint
`POST /api/v1/mobile/auth/apple-login`

### Request Format
```json
{
  "appleId": "000123.abc456def789.0123",
  "email": "user@example.com",
  "name": "John Doe",
  "firstName": "John",
  "lastName": "Doe",
  "identityToken": "eyJraWQiOiJlWGF1...",
  "authorizationCode": "c1234567890abcdef...",
  "realUserStatus": 1,
  "deviceInfo": {
    "fingerprint": "device-fingerprint",
    "trustLevel": "trusted",
    "riskScore": 25
  }
}
```

### Expected Response Format
```json
{
  "success": true,
  "message": "Apple sign-in successful",
  "user": {
    "id": 123,
    "email": "user@example.com",
    "username": "user",
    "first_name": "John",
    "last_name": "Doe",
    "name": "John Doe"
  },
  "deviceTrusted": true,
  "requires2FA": false
}
```

### Backend Requirements

1. **Identity Token Verification**: Verify the JWT `identityToken` using Apple's public keys
2. **User Creation/Linking**: Create new user or link to existing account
3. **Email Handling**: Handle cases where user chooses to hide email
4. **Device Trust**: Update device trust status if login successful

## User Data Format

The app expects user data in the following format:
```typescript
{
  id: string;      // User ID as string
  email: string;  // User email (or placeholder if hidden)
  name: string;   // Display name
}
```

### Email Privacy Handling

If a user chooses to hide their email during Apple Sign In:
- The app uses a placeholder: `apple-{userId}@grabdocs.app`
- The backend should handle this and may request email later if needed

## Error Handling

### User Cancellation
- No error message shown to user
- Graceful return to sign-in screen

### Network Errors
- Error message displayed
- Failed attempts tracked for security

### Backend Errors
- Error message from backend displayed
- 2FA requirements handled appropriately

### Missing Data
- Validation ensures required fields are present
- Fallback values used when appropriate

## Testing

### Requirements
- **Physical iOS Device**: Apple Sign In doesn't work in simulator
- **Apple Developer Account**: App ID must have "Sign in with Apple" enabled
- **Service ID**: Must be configured in Apple Developer Console

### Test Cases
1. ✅ Successful sign-in with email provided
2. ✅ Successful sign-in with email hidden
3. ✅ User cancellation
4. ✅ Network error handling
5. ✅ Backend error handling
6. ✅ 2FA requirement handling
7. ✅ Device trust integration
8. ✅ Sign-up flow

## Security Considerations

1. **Identity Token Verification**: Backend must verify JWT tokens
2. **Device Fingerprinting**: Integrated with device security service
3. **Risk Scoring**: Calculated for each login attempt
4. **Device Trust**: Tracks trusted devices
5. **Failed Attempts**: Tracks and limits failed login attempts

## Platform Support

- **iOS**: ✅ Full native support
- **Android**: ❌ Not supported (Apple Sign In is iOS-only)
- **Web**: ⚠️ Limited support via Service ID (not implemented)

## Apple Developer Setup

### Required Configuration

1. **App ID**: Enable "Sign in with Apple" capability
2. **Service ID**: Create and configure for web/Android fallback
3. **Return URLs**: Configure callback URLs
4. **Domains**: Add domains for Service ID

### Service ID Configuration
- **Primary App ID**: `com.grabdocs.mobile`
- **Domains**: `api.grabdocs.com`
- **Return URLs**: `https://api.grabdocs.com/auth/apple/callback`

## Troubleshooting

### Button Not Showing
- Check if running on iOS device (not simulator)
- Verify `expo-apple-authentication` is installed
- Check if Apple Sign In is available: `await appleAuthService.isAvailableAsync()`

### Authentication Fails
- Verify App ID has "Sign in with Apple" enabled
- Check backend endpoint is implemented
- Verify identity token verification on backend
- Check network connectivity

### User Data Not Stored
- Check secure storage permissions
- Verify user data format matches expectations
- Check auth context refresh is called

## Future Enhancements

1. **Android Support**: Implement web-based fallback for Android
2. **Account Linking**: Better handling of existing accounts
3. **Email Recovery**: Handle email privacy better
4. **Analytics**: Track Apple Sign In usage

## Related Files

- `services/appleAuth.ts` - Main service implementation
- `app/(auth)/sign-in.tsx` - Sign-in screen integration
- `app/(auth)/sign-up.tsx` - Sign-up screen integration
- `app/context/auth.tsx` - Auth context with refresh method
- `constants/Config.ts` - Configuration constants
- `app.json` - App configuration

## References

- [Expo Apple Authentication Docs](https://docs.expo.dev/versions/latest/sdk/apple-authentication/)
- [Apple Sign In Documentation](https://developer.apple.com/sign-in-with-apple/)
- [Apple Developer Console](https://developer.apple.com/account/)



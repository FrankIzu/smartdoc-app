# Mobile OTP Authentication Implementation

This document explains the mobile OTP (One-Time Password) authentication feature that has been implemented for the GrabDocs mobile app.

## Overview

The mobile OTP authentication system provides secure verification for users during login by sending verification codes via SMS or email, based on the user's registered contact methods.

## How It Works

### **Criteria for OTP Verification:**
1. **Phone Number Available**: If user has a phone number → SMS OTP via Twilio
2. **Email Only**: If user has no phone but has email → Email OTP via Resend
3. **No Contact Methods**: Regular password-only authentication

### **Authentication Flow:**

```
1. User enters username/password
   ↓
2. System checks if user exists and has contact methods
   ↓
3. If user has phone/email → Request OTP
   ↓ 
4. User receives SMS/Email with 6-digit code
   ↓
5. User enters code in app
   ↓
6. System verifies code and completes authentication
```

## Technical Implementation

### **Backend Endpoints (Mobile)**

#### `/api/v1/mobile/auth/check-user` (POST)
Checks if user exists and has contact methods for OTP.

**Request:**
```json
{
  "username": "francis"
}
```

**Response:**
```json
{
  "success": true,
  "exists": true,
  "hasPhone": true,
  "hasEmail": true,
  "requiresOtp": true,
  "preferredMethod": "sms"
}
```

#### `/api/v1/mobile/auth/request-otp` (POST)
Requests OTP code for authentication.

**Request:**
```json
{
  "username": "francis",
  "purpose": "login"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Verification code sent to your phone",
  "method": "sms",
  "identifier": "***-***-1234",
  "expiresIn": 600
}
```

#### `/api/v1/mobile/auth/verify-otp` (POST)
Verifies OTP code and completes authentication.

**Request:**
```json
{
  "username": "francis",
  "otpCode": "123456"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Authentication successful",
  "user": {
    "id": 2,
    "username": "francis",
    "email": "francis@example.com",
    "name": "Francis Onodueze"
  },
  "authMethod": "2fa"
}
```

#### `/api/v1/mobile/auth/resend-otp` (POST)
Resends OTP code.

**Request:**
```json
{
  "username": "francis"
}
```

### **Frontend Implementation**

#### **Enhanced Sign-In Flow**
- `app/(auth)/sign-in.tsx` - Updated to trigger OTP verification
- `app/(auth)/otp-verification.tsx` - New OTP input screen

#### **Key Features:**
- ✅ **Auto-detection**: Automatically determines SMS vs Email based on user data
- ✅ **6-digit input**: Clean, accessible OTP input interface  
- ✅ **Auto-submit**: Automatically submits when all digits are entered
- ✅ **Countdown timer**: Shows expiration countdown (10 minutes)
- ✅ **Resend functionality**: Allows resending after 1 minute
- ✅ **Error handling**: Clear error messages and retry logic
- ✅ **Accessibility**: Full keyboard navigation and screen reader support

## Security Features

### **Rate Limiting**
- Max 3 OTP requests per hour per user
- Max 3 verification attempts per OTP code
- Automatic lockout after failed attempts

### **Code Security**
- 6-digit random codes
- 10-minute expiration
- One-time use only
- Secure generation using crypto.random

### **Audit Logging**
All OTP actions are logged including:
- OTP requests and method used
- Verification attempts (success/failure)
- IP addresses and user agents
- Timestamps and user identification

## User Experience

### **SMS Flow Example:**
1. User enters username/password
2. App shows: "Sending verification code to your phone..."
3. User receives SMS: "Your GrabDocs mobile app verification code is: 123456. Valid for 10 minutes."
4. App navigates to OTP screen showing: "Enter the 6-digit code sent to ***-***-1234"
5. User enters code → Automatic verification → Success!

### **Email Flow Example:**
1. User enters username/password  
2. App shows: "Sending verification code to your email..."
3. User receives email with styled code
4. App shows: "Enter the 6-digit code sent to f***@example.com"
5. User enters code → Automatic verification → Success!

## Configuration

### **Environment Variables Required:**

```bash
# Twilio (for SMS)
TWILIO_ACCOUNT_SID=your-account-sid
TWILIO_AUTH_TOKEN=your-auth-token
TWILIO_PHONE_NUMBER=your-twilio-phone

# Resend (for Email)
RESEND_API_KEY=your-resend-api-key
```

### **Database Tables:**
- `otp_requests` - Stores temporary OTP codes
- `phone_verification_audit` - Security audit logs  
- `users` - User phone/email information

## Testing

### **Test Users:**
```bash
# User with phone number (SMS OTP)
Username: francis
Password: password123
Phone: +1234567890

# User with email only (Email OTP)  
Username: testuser
Password: testpass
Email: test@example.com
```

### **Test Phone Numbers:**
For development, use Twilio test numbers:
- `+15005550006` - Valid test number (returns OTP in response)

### **Development Mode:**
- OTP codes are logged to console for testing
- Test phone numbers bypass SMS sending
- Email OTP works with real email addresses

## Error Handling

### **Common Error Scenarios:**
1. **User not found**: "User not found"
2. **No contact methods**: Falls back to regular password auth
3. **SMS failure**: "Failed to send SMS verification code"
4. **Email failure**: "Failed to send email verification code"
5. **Invalid OTP**: "Invalid verification code. X attempts remaining"
6. **Expired OTP**: "Code has expired. Please request a new one"
7. **Too many attempts**: "Too many failed attempts. Please request a new code"

## Benefits

### **Enhanced Security:**
- ✅ Two-factor authentication for mobile users
- ✅ Protects against password-only attacks  
- ✅ Device-independent verification
- ✅ Audit trail for all authentication events

### **User Experience:**
- ✅ Seamless integration with existing login flow
- ✅ Automatic method detection (SMS/Email)
- ✅ Clean, intuitive OTP input interface
- ✅ Clear status messages and error handling
- ✅ Works on any network (no IP dependencies)

### **Reliability:**
- ✅ Fallback to email if SMS fails
- ✅ Robust error handling and retry logic
- ✅ Compatible with both Expo Go and production builds
- ✅ Full offline capability for cached sessions

## Future Enhancements

1. **Push Notifications**: Add push notification OTP delivery
2. **Biometric Bypass**: Skip OTP for trusted biometric users  
3. **Smart Detection**: Skip OTP for trusted devices/locations
4. **Admin Controls**: Allow admin to enable/disable OTP per user
5. **Custom Messages**: Personalized OTP messages per organization

## Files Modified

### **Backend:**
- `manager-francis/backend/routes/mobile_routes.py` - Added OTP endpoints
- Uses existing `utils/phone_auth.py` and `shared.py` models

### **Frontend:**
- `app/(auth)/sign-in.tsx` - Enhanced with OTP trigger logic
- `app/(auth)/otp-verification.tsx` - New OTP input screen
- `constants/Config.ts` - Added API base URL import

### **Documentation:**
- `MOBILE_OTP_IMPLEMENTATION.md` - This comprehensive guide

## Conclusion

The mobile OTP authentication feature provides enterprise-grade security while maintaining excellent user experience. It automatically adapts to each user's contact methods (phone vs email) and integrates seamlessly with the existing authentication flow.

Users with phone numbers get instant SMS codes, while email-only users receive beautifully formatted email codes. The system is production-ready with comprehensive error handling, rate limiting, and security auditing. 
# OAuth Deployment Guide - GrabDocs Mobile

## 🔑 **OAuth Credentials Setup**

Your app uses **two sets of OAuth credentials**:

### **1. Backend OAuth (Already Configured on Render)**
Your Flask backend on Render already has these environment variables:
- `GOOGLE_CLIENT_ID` - Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Your Google OAuth client secret  
- `DROPBOX_APP_KEY` - Your Dropbox app key
- `DROPBOX_APP_SECRET` - Your Dropbox app secret

### **2. Mobile App OAuth (Needs Configuration)**
The mobile app needs platform-specific client IDs for OAuth flow:

## 📱 **Mobile App OAuth Setup**

### **Step 1: Create `.env.production` File**

Create a `.env.production` file in your mobile app root directory with this content:

```bash
# GrabDocs Mobile App - Production Environment Variables

# Backend API URL (auto-detects to https://api.grabdocs.com in production)
# EXPO_PUBLIC_API_URL=https://api.grabdocs.com

# Environment (auto-detects to 'production' when not in __DEV__ mode)
# EXPO_PUBLIC_ENVIRONMENT=production

# App configuration
EXPO_PUBLIC_APP_NAME=GrabDocs Mobile
EXPO_PUBLIC_APP_VERSION=1.0.0

# Google OAuth Client IDs (Platform-specific)
EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB=603386649315-vp4revvrcgrcjme51ebuhbkbspl048l9.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID=603386649315-vp4revvrcgrcjme51ebuhbkbspl048l9.apps.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS=603386649315-vp4revvrcgrcjme51ebuhbkbspl048l9.apps.googleusercontent.com

# Dropbox App Key (Get this from your Dropbox app settings)
EXPO_PUBLIC_DROPBOX_APP_KEY=your-dropbox-app-key-here
```

### **Step 2: Get Your Dropbox App Key**

1. Go to [Dropbox App Console](https://www.dropbox.com/developers/apps)
2. Find your existing app (or create a new one)
3. Copy the "App key" 
4. Replace `your-dropbox-app-key-here` in `.env.production`

### **Step 3: Verify Google OAuth Setup**

Your Google OAuth is already configured with:
- **Client ID**: `603386649315-vp4revvrcgrcjme51ebuhbkbspl048l9.apps.googleusercontent.com`
- **Backend Secret**: Already set on Render
- **Redirect URIs**: Should include:
  - `https://api.grabdocs.com/api/v1/mobile/oauth/callback/google`
  - `grabdocs://oauth/callback/google`

## 🔄 **How OAuth Works in Your App**

### **Google OAuth Flow**
1. **Mobile App**: Uses `EXPO_PUBLIC_GOOGLE_CLIENT_ID_*` to initiate OAuth
2. **Google**: Redirects to `https://api.grabdocs.com/api/v1/mobile/oauth/callback/google`
3. **Backend**: Uses `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to exchange code
4. **Backend**: Returns session token to mobile app
5. **Mobile App**: Stores token and makes authenticated requests

### **Dropbox OAuth Flow**
1. **Mobile App**: Uses `EXPO_PUBLIC_DROPBOX_APP_KEY` to initiate OAuth
2. **Dropbox**: Redirects to `https://api.grabdocs.com/api/v1/mobile/oauth/callback/dropbox`
3. **Backend**: Uses `DROPBOX_APP_KEY` and `DROPBOX_APP_SECRET` to exchange code
4. **Backend**: Returns access token to mobile app
5. **Mobile App**: Uses token to access Dropbox files

## ✅ **Deployment Checklist**

### **Before Building**
- [ ] Create `.env.production` file with correct OAuth credentials
- [ ] Verify Dropbox app key is correct
- [ ] Test OAuth flow in development mode

### **Google Play Store**
- [ ] Ensure Google OAuth redirect URIs include Android package name
- [ ] Test Google Sign-In on Android device
- [ ] Verify Google Drive integration works

### **Apple App Store**  
- [ ] Ensure Google OAuth redirect URIs include iOS bundle ID
- [ ] Test Google Sign-In on iOS device
- [ ] Verify Google Drive integration works

## 🧪 **Testing OAuth**

### **Development Testing**
```bash
# Start development server
expo start

# Test Google Sign-In
# 1. Go to login screen
# 2. Tap "Sign in with Google"
# 3. Should open browser and redirect back

# Test Dropbox Integration
# 1. Go to Documents screen
# 2. Tap cloud download icon
# 3. Select Dropbox
# 4. Should authenticate and show files
```

### **Production Testing**
```bash
# Build production app
eas build --platform android --profile production

# Install on device and test OAuth flows
```

## 🔒 **Security Notes**

### **OAuth Credentials**
- **Mobile App**: Only needs client IDs (public)
- **Backend**: Has client secrets (private)
- **Environment Variables**: Use `EXPO_PUBLIC_` prefix for client-side access

### **Token Storage**
- OAuth tokens stored securely in device keychain
- Backend handles token refresh and validation
- Mobile app never stores sensitive credentials

## 🚨 **Common Issues**

### **"Invalid Client" Error**
- Check that OAuth client IDs match between mobile app and Google Console
- Verify redirect URIs are correctly configured

### **"Redirect URI Mismatch" Error**
- Ensure redirect URIs in Google Console match your backend URLs
- Check that mobile app scheme (`grabdocs://`) is properly configured

### **Dropbox Authentication Fails**
- Verify Dropbox app key is correct
- Check that Dropbox app has proper permissions
- Ensure redirect URI is configured in Dropbox app settings

## 📞 **Support**

If you encounter OAuth issues:
1. Check backend logs on Render for OAuth errors
2. Verify environment variables are set correctly
3. Test OAuth flow in development mode first
4. Check Google/Dropbox console for any configuration issues

---

**Your OAuth setup is nearly complete! Just add the Dropbox app key to `.env.production` and you're ready to deploy.**



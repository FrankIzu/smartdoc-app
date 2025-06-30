# Google Play Store Submission Checklist

## ✅ Build Ready
- [x] **Production AAB file**: `grabdocs-production.aab` (64MB)
- [x] **Package name**: `com.grabdocs.mobile`
- [x] **Version**: 1.0.0 (Version Code: 1)

## 📋 Required Information to Complete

### 1. App Information
- [x] **App name**: GrabDocs - Document Scanner & Manager
- [x] **Short description**: Scan, organize, and manage all your documents securely in one place.
- [x] **Full description**: Ready in `PLAY_STORE_LISTING.md`
- [ ] **App icon**: 512x512px (use `assets/images/icon.png`)
- [ ] **Feature graphic**: 1024x500px (needs to be created)

### 2. Screenshots Required
- [ ] **Phone screenshots**: At least 2 (16:9 or 9:16 ratio)
- [ ] **7-inch tablet screenshots**: At least 1 (recommended)
- [ ] **10-inch tablet screenshots**: At least 1 (recommended)

### 3. Content Rating
- [ ] Complete the content rating questionnaire
- [ ] Expected rating: "Everyone" or "Teen" depending on features

### 4. Target Audience
- [ ] Select target age groups
- [ ] Recommended: 13+ (Teen and Adult)

### 5. Data Safety
- [ ] **Data collection**: Declare what data you collect
- [ ] **Data sharing**: Specify if data is shared with third parties
- [ ] **Security practices**: Encryption in transit and at rest
- [ ] **Data deletion**: User can request account deletion

### 6. Privacy Policy
- [x] **URL**: https://www.grabdocs.com/privacy-policy
- [ ] Verify the URL is accessible and complete

### 7. App Category
- [x] **Primary**: Productivity
- [x] **Secondary**: Business (optional)

### 8. Store Presence
- [ ] **Countries**: Select where to distribute (start with your country)
- [ ] **Pricing**: Free or Paid
- [ ] **In-app purchases**: Declare if applicable

### 9. Release Management
- [ ] **Release name**: v1.0.0 - Initial Release
- [ ] **Release notes**: What's new in this version
- [ ] **Rollout percentage**: Start with 20% for gradual rollout

## 🔧 Google Cloud Setup (For Automated Submission)
- [ ] **Enable Google Play Android Developer API**: 
  - Go to: https://console.developers.google.com/apis/api/androidpublisher.googleapis.com/overview?project=388172995920
  - Click "Enable"
  - Wait 5-10 minutes
- [x] **Service Account**: `grabdocs@grabdocs-463905.iam.gserviceaccount.com`
- [ ] **Grant Play Console access**: Add service account to Play Console

## 📱 Testing Before Release
- [ ] **Internal testing**: Upload to internal track first
- [ ] **Test on multiple devices**: Different Android versions
- [ ] **Test all core features**: Login, scanning, cloud sync
- [ ] **Test biometric authentication**: On supported devices

## 🚀 Release Process
1. **Internal Release** → Test with team
2. **Closed Testing** → Test with limited users  
3. **Open Testing** → Public beta (optional)
4. **Production** → Full release

## 📊 Post-Release Monitoring
- [ ] Monitor crash reports in Play Console
- [ ] Check user reviews and ratings
- [ ] Monitor app performance metrics
- [ ] Plan for updates and improvements

## 🔗 Important Links
- **Play Console**: https://play.google.com/console
- **Developer Policy**: https://play.google.com/about/developer-content-policy/
- **App Bundle Guide**: https://developer.android.com/guide/app-bundle
- **EAS Submit Docs**: https://docs.expo.dev/submit/android/ 
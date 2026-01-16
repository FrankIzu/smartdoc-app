# Testing HMS Meeting Integration Locally

This guide covers multiple ways to test HMS meeting functionality locally before doing a full build.

## 🚀 Quick Testing Options

### Option 1: Backend-Only Test (Fastest - No Build Required)

Test the backend HMS room creation logic without building the mobile app:

```bash
# Run the test script
python test_hms_backend.py
```

**What it tests:**
- ✅ Backend creates actual HMS room via `hms_api.create_room()`
- ✅ HMS `room_id` is stored in database
- ✅ Response includes `roomCode` with HMS `room_id`
- ✅ Token generation endpoint works

**Pros:**
- ⚡ Fast - no build needed
- ✅ Verifies backend logic is correct
- ✅ Can iterate quickly on backend fixes

**Cons:**
- ❌ Doesn't test mobile UI/UX
- ❌ Doesn't test actual HMS SDK integration

---

### Option 2: Development Build (Full Test - Recommended)

Test the complete flow including HMS SDK integration:

#### Step 1: Create Development Build

**For Android:**
```bash
npx expo run:android
```

**For iOS:**
```bash
npx expo run:ios
```

#### Step 2: Test Meeting Creation Flow

1. **Start your backend** (if not already running):
   ```bash
   cd manager-francis/backend
   python app.py
   ```

2. **In the mobile app:**
   - Navigate to a workspace
   - Tap "Start Call" button
   - Or navigate to `/quick-reach/create-meeting` and create a meeting

3. **Verify:**
   - Meeting is created successfully
   - App navigates to HMS interface
   - HMS prebuilt UI loads (not the development fallback)
   - You can join the meeting

#### Step 3: Test with Existing Meeting

You can also test joining an existing meeting:

1. Use `test_hms_backend.py` to create a meeting and get a `roomCode`
2. In the app, navigate directly to HMS interface:
   ```typescript
   router.push({
     pathname: '/quick-reach/hms-meeting-interface',
     params: {
       meetingId: 'your-room-code-from-backend-test',
       title: 'Test Meeting',
       userName: 'Test User'
     }
   });
   ```

**Pros:**
- ✅ Tests complete end-to-end flow
- ✅ Verifies HMS SDK integration
- ✅ Tests actual UI/UX

**Cons:**
- ⏱️ Requires build time (~5-10 minutes)
- 🔄 Need to rebuild for native config changes

---

### Option 3: Development Mode Fallback (Quick UI Test)

The HMS interface has a development mode fallback that shows meeting info even without HMS SDK:

**When it appears:**
- Running in Expo Go (HMS SDK not available)
- HMS SDK failed to load
- Testing UI flow without actual HMS connection

**What you can test:**
- ✅ Navigation flow
- ✅ Meeting ID extraction from response
- ✅ Token generation API calls
- ✅ Error handling
- ✅ UI layout

**How to trigger:**
- Run in Expo Go: `npx expo start` then scan QR code
- Or comment out HMS imports temporarily

**Pros:**
- ⚡ Instant - no build needed
- ✅ Test UI/UX flow
- ✅ Verify API integration

**Cons:**
- ❌ Doesn't test actual HMS SDK
- ❌ Can't test video/audio functionality

---

## 🧪 Step-by-Step Testing Workflow

### Recommended Testing Sequence:

1. **First: Backend Test** (5 minutes)
   ```bash
   python test_hms_backend.py
   ```
   - Verify HMS room creation works
   - Get a `roomCode` for testing

2. **Second: Development Mode Test** (5 minutes)
   - Run `npx expo start` (Expo Go)
   - Navigate to meeting creation
   - Verify UI flow and API calls work
   - Check console logs for token generation

3. **Third: Full Development Build** (10-15 minutes)
   - Create dev build: `npx expo run:android` or `npx expo run:ios`
   - Test complete HMS integration
   - Verify video/audio works

---

## 🔍 What to Check in Each Test

### Backend Test Checklist:
- [ ] Meeting creation endpoint returns `roomCode` with HMS `room_id`
- [ ] Database record has `hms_room_id` field populated
- [ ] Token generation endpoint accepts `roomCode` and returns token
- [ ] Response format matches what mobile expects

### Development Mode Test Checklist:
- [ ] Meeting creation navigates to HMS interface
- [ ] `meetingId` (roomCode) is correctly extracted from response
- [ ] Token generation API is called with correct `roomCode`
- [ ] Development mode UI shows correct meeting info
- [ ] Error handling works (network errors, invalid roomCode, etc.)

### Full Build Test Checklist:
- [ ] HMS Prebuilt UI loads (not development fallback)
- [ ] Can join meeting successfully
- [ ] Video works (camera permission granted)
- [ ] Audio works (microphone permission granted)
- [ ] Can toggle video/audio
- [ ] Can leave meeting
- [ ] No "room not found" errors

---

## 🐛 Troubleshooting

### Backend Test Fails

**Issue: Connection Error**
```bash
# Make sure backend is running
cd manager-francis/backend
python app.py
```

**Issue: HMS Room Creation Fails**
- Check HMS credentials in `manager-francis/.env`:
  ```env
  HMS_APP_ID=your_app_id
  HMS_APP_SECRET=your_app_secret
  HMS_TEMPLATE_ID_MOBILE=your_template_id
  ```
- Verify `hms_api.py` is correctly configured
- Check backend logs for HMS API errors

### Development Build Test Fails

**Issue: "HMS package not available"**
- Make sure you're using a development build (not Expo Go)
- Rebuild: `npx expo run:android` or `npx expo run:ios`
- Check that `@100mslive/react-native-hms` and `@100mslive/react-native-room-kit` are installed

**Issue: "Room not found [code: 400]"**
- Verify backend is creating HMS rooms correctly (use backend test script)
- Check that `roomCode` being passed is the HMS `room_id`, not database `meeting_id`
- Verify token generation endpoint is working

**Issue: Development Mode UI Shows Instead of HMS**
- This is expected if HMS SDK isn't loaded
- Make sure you're using a development build
- Check console logs for HMS import errors

---

## 💡 Tips for Faster Iteration

1. **Test Backend First**: Use `test_hms_backend.py` to verify backend logic before building
2. **Use Development Mode**: Test UI flow in Expo Go first, then test HMS SDK in dev build
3. **Keep Dev Build Running**: Don't close the app between tests - use Metro reload for JS changes
4. **Test Incrementally**: 
   - First verify meeting creation works
   - Then verify token generation works
   - Finally test HMS SDK integration

---

## 📝 Example Test Session

```bash
# 1. Test backend (2 minutes)
python test_hms_backend.py
# Output: roomCode = "abc123-def456"

# 2. Start backend (if not running)
cd manager-francis/backend && python app.py

# 3. Start Expo (development mode test - 1 minute)
npx expo start
# Navigate to create meeting, verify flow

# 4. Create dev build (10 minutes - only if step 3 passes)
npx expo run:android

# 5. Test full HMS integration
# Use roomCode from step 1 or create new meeting
```

---

## ✅ Success Criteria

You'll know everything works when:

1. ✅ Backend test creates HMS room and returns `roomCode`
2. ✅ Mobile app receives `roomCode` and navigates to HMS interface
3. ✅ HMS Prebuilt UI loads (not development fallback)
4. ✅ You can join meeting and see video/audio working
5. ✅ No "room not found" or token errors

---

## 🚨 Important Notes

- **Expo Go Limitation**: HMS SDK requires native modules, so it won't work in Expo Go. You need a development build for full testing.
- **Backend Required**: All HMS token generation happens via backend API - make sure backend is running.
- **Permissions**: Make sure camera/microphone permissions are granted in the app.
- **Network**: HMS requires internet connection - localhost testing still needs internet for HMS API calls.

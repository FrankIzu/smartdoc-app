# Testing 100ms Prebuilt Interface with Existing Meetings in Localhost

This guide explains how to test the 100ms prebuilt meeting interface using an existing meeting in your localhost environment.

## Prerequisites

1. **Development Build Required**: The 100ms React Native SDK requires native modules, so you **cannot** test this in Expo Go. You need a development build.

2. **Backend HMS Endpoints**: Your backend must have HMS endpoints configured:
   - `POST /api/v1/mobile/meetings/hms-token` - Generate auth token
   - `POST /api/v1/mobile/meetings/hms-room` - Create/join room
   - `GET /api/v1/mobile/meetings/hms-room/{roomCode}` - Get room details

3. **HMS Credentials**: Your backend needs HMS credentials configured in `manager-francis/.env`:
   ```env
   HMS_APP_ID=your_hms_app_id
   HMS_APP_SECRET=your_hms_app_secret
   HMS_TEMPLATE_ID_MOBILE=your_mobile_template_id
   ```

## Setup Steps

### 1. Install HMS Package

```bash
npm install @100mslive/react-native-hms
```

### 2. Create Development Build

Since HMS requires native modules, you need a development build (not Expo Go):

**For Android:**
```bash
npx expo run:android
```

**For iOS:**
```bash
npx expo run:ios
```

### 3. Get an Existing Meeting ID

You can get an existing meeting ID from:

1. **From the Meeting Call Screen**: 
   - Navigate to `/quick-reach/meeting-call`
   - View your existing meetings
   - Note the `meetingId` from any meeting

2. **From Database/Backend**:
   - Query your meetings API: `GET /api/v1/mobile/meetings`
   - Use the `meetingId` field from any meeting

### 4. Test with Existing Meeting

#### Option A: Via Meeting Call Screen (Recommended)

1. Open the app and navigate to **Meeting Call** screen (`/quick-reach/meeting-call`)
2. Find an existing meeting in the list
3. Tap the **video camera icon** (📹) on the meeting card
4. The app will navigate to the HMS prebuilt interface with the meeting ID

#### Option B: Direct Navigation (For Testing)

You can also navigate directly to the HMS interface with a meeting ID:

```typescript
router.push({
  pathname: '/quick-reach/hms-meeting-interface',
  params: {
    meetingId: 'your-existing-meeting-id',
    title: 'Test Meeting',
    userName: 'Test User'
  }
});
```

#### Option C: Join by Meeting ID

1. On the Meeting Call screen, tap **"Join"** button
2. Enter the existing meeting ID
3. Enter passcode if required
4. Tap **"Join"** - this will navigate to HMS interface

## How It Works

1. **Meeting ID is Passed**: The existing meeting ID is passed as `roomCode` to the HMS interface
2. **Auth Token Generated**: The app calls your backend to generate an HMS auth token for that room
3. **HMS Prebuilt Loads**: The 100ms prebuilt interface loads with the room code and auth token
4. **Meeting Joins**: You join the existing meeting room

## Troubleshooting

### Issue: "HMS package not available"

**Solution**: 
- Make sure you installed the package: `npm install @100mslive/react-native-hms`
- You're using a development build (not Expo Go)
- Rebuild the app: `npx expo run:android` or `npx expo run:ios`

### Issue: "Failed to generate auth token"

**Solution**:
- Check that your backend HMS endpoints are working
- Verify HMS credentials in `manager-francis/.env`
- Check backend logs for errors
- Ensure the meeting ID exists in your database

### Issue: "Room not found" or "Invalid room code"

**Solution**:
- Verify the meeting ID exists in your database
- Check that the meeting hasn't been ended/deleted
- Ensure the meeting ID format matches what HMS expects

### Issue: Development Mode UI Shows Instead of HMS Interface

**Solution**:
- This is expected if HMS package isn't loaded
- Make sure you're using a development build (not Expo Go)
- Reinstall and rebuild: 
  ```bash
  npm install @100mslive/react-native-hms
  npx expo run:android  # or run:ios
  ```

## Testing Flow

```
1. User opens Meeting Call screen
   ↓
2. Sees list of existing meetings from database
   ↓
3. Taps "Join" on an existing meeting
   ↓
4. App navigates to HMS interface with meetingId
   ↓
5. App calls backend: POST /api/v1/mobile/meetings/hms-token
   ↓
6. Backend generates HMS auth token
   ↓
7. HMS Prebuilt interface loads with roomCode + authToken
   ↓
8. User joins the existing meeting room
```

## Notes

- **Expo Go Limitation**: The HMS SDK requires native modules, so it won't work in Expo Go. You must use a development build.
- **Backend Required**: The app doesn't store HMS credentials directly. All token generation happens via your backend API.
- **Existing Meetings**: You can use any meeting ID from your database, as long as it's a valid HMS room code format.
- **Development Mode**: If HMS package isn't available, you'll see a development mode UI showing the meeting info, which is useful for debugging.

## Next Steps

Once you have it working:
1. Test with multiple existing meetings
2. Test joining from different devices
3. Verify audio/video functionality
4. Test meeting controls (mute, video toggle, etc.)
5. Test leaving the meeting



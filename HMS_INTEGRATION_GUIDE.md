# GrabDocs Prebuilt Meeting Interface - Mobile Integration Guide

This guide explains how to implement and use the GrabDocs prebuilt meeting interface in the mobile application.

## Overview

The mobile app now includes a GrabDocs prebuilt meeting interface that provides:
- High-quality video conferencing
- Audio/video controls
- Participant management
- Real-time communication
- Cross-platform compatibility
- **Integration with existing web webhooks** for transcripts, summaries, chat, and meeting reports
- **Database integration** for loading previous user meetings

## Files Added/Modified

### New Files Created:
1. **`services/hmsService.ts`** - Core HMS SDK service for meeting management
2. **`services/hmsBackendService.ts`** - Backend API integration for HMS
3. **`app/quick-reach/hms-meeting-interface.tsx`** - 100ms prebuilt meeting UI
4. **`app/quick-reach/test-hms.tsx`** - Test component for HMS integration
5. **`grabdocs\.env`** - Environment variables for HMS credentials

### Modified Files:
1. **`app/quick-reach/meeting-interface.tsx`** - Added HMS switch button
2. **`package.json`** - Added HMS React Native SDK dependency

## Setup Instructions

### 1. Install Dependencies

The HMS React Native SDK has been installed:
```bash
npm install @100mslive/react-native-hms
```

### 2. Configure GrabDocs Meeting Credentials

Create a `.env` file in the `grabdocs` directory with your meeting service credentials:

```env
# GrabDocs Meeting Configuration for Mobile
HMS_APP_ID=your_hms_app_id_here
HMS_APP_SECRET=your_hms_app_secret_here
HMS_TEMPLATE_ID=your_hms_template_id_here  # For web
HMS_TEMPLATE_ID_MOBILE=your_mobile_template_id_here  # For mobile
HMS_DOMAIN=prod.100ms.live
HMS_ROOM_PREFIX=grabdocs-mobile
```

**To get these credentials:**
1. Sign up at [100ms.live](https://100ms.live)
2. Create a new app in the dashboard
3. Get your App ID and App Secret
4. Create a room template and get the Template ID

### 3. Backend Integration

The mobile implementation uses **existing web webhook endpoints** for meeting assets and data. You need to implement the following backend endpoints to support GrabDocs meeting token generation:

#### Required Endpoints:

**POST `/api/v1/mobile/meetings/hms-token`**
```json
{
  "roomCode": "string",
  "userName": "string", 
  "role": "string",
  "userId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "token": "hms_auth_token_here",
  "roomCode": "room_code_here"
}
```

**POST `/api/v1/mobile/meetings/hms-room`**
```json
{
  "roomName": "string",
  "templateId": "string"
}
```

**Response:**
```json
{
  "success": true,
  "roomCode": "generated_room_code",
  "roomId": "room_id"
}
```

**GET `/api/v1/mobile/meetings/hms-room/{roomCode}`**
```json
{
  "success": true,
  "room": {
    "id": "room_id",
    "code": "room_code",
    "name": "room_name",
    "templateId": "template_id"
  }
}
```

**POST `/api/v1/mobile/meetings/hms-room/{roomCode}/end`**
```json
{
  "success": true,
  "message": "Room ended successfully"
}
```

#### Existing Web Webhook Endpoints (Used by Mobile):

The mobile app uses the **same web webhook endpoints** as the web version:

**GET `/api/meeting-assets`** - Get all meeting assets
**GET `/api/meetings/{meetingId}/transcript`** - Get meeting transcript
**GET `/api/meetings/{meetingId}/summary`** - Get meeting summary  
**GET `/api/meetings/{meetingId}/chat`** - Get meeting chat
**GET `/api/meetings/{meetingId}/report`** - Get meeting report
**GET `/api/meetings/{meetingId}/download/{assetType}`** - Download meeting asset

**GET `/api/v1/mobile/meetings`** - Get user's previous meetings from database

### 4. Backend Implementation Example (Python/Flask)

```python
import os
import requests
from flask import Flask, request, jsonify

app = Flask(__name__)

# HMS Configuration (same credentials as web, mobile-specific template)
HMS_APP_ID = os.getenv('HMS_APP_ID')
HMS_APP_SECRET = os.getenv('HMS_APP_SECRET')
HMS_TEMPLATE_ID = os.getenv('HMS_TEMPLATE_ID')  # For web
HMS_TEMPLATE_ID_MOBILE = os.getenv('HMS_TEMPLATE_ID_MOBILE')  # For mobile

@app.route('/api/v1/mobile/meetings/hms-token', methods=['POST'])
def generate_hms_token():
    data = request.json
    room_code = data.get('roomCode')
    user_name = data.get('userName')
    role = data.get('role', 'viewer')
    user_id = data.get('userId')
    
    # Generate HMS auth token
    token_payload = {
        'room_code': room_code,
        'user_id': user_id,
        'role': role,
        'user_name': user_name
    }
    
    # Call HMS API to generate token
    response = requests.post(
        f'https://prod.100ms.live/v2/tokens',
        headers={
            'Authorization': f'Bearer {HMS_APP_SECRET}',
            'Content-Type': 'application/json'
        },
        json=token_payload
    )
    
    if response.status_code == 200:
        token_data = response.json()
        return jsonify({
            'success': True,
            'token': token_data['token'],
            'roomCode': room_code
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Failed to generate token'
        }), 400

@app.route('/api/v1/mobile/meetings/hms-room', methods=['POST'])
def create_hms_room():
    data = request.json
    room_name = data.get('roomName')
    template_id = data.get('templateId', HMS_TEMPLATE_ID_MOBILE)  # Default to mobile template
    
    # Create HMS room
    room_payload = {
        'name': room_name,
        'template_id': template_id
    }
    
    response = requests.post(
        f'https://prod.100ms.live/v2/rooms',
        headers={
            'Authorization': f'Bearer {HMS_APP_SECRET}',
            'Content-Type': 'application/json'
        },
        json=room_payload
    )
    
    if response.status_code == 201:
        room_data = response.json()
        return jsonify({
            'success': True,
            'roomCode': room_data['room_code'],
            'roomId': room_data['id']
        })
    else:
        return jsonify({
            'success': False,
            'message': 'Failed to create room'
        }), 400
```

## Usage

### 1. Testing the Integration

Navigate to the test screen to verify HMS integration:
```
/quick-reach/test-hms
```

This screen allows you to:
- Test HMS service initialization
- Verify backend connectivity
- Test room joining functionality

### 2. Using the GrabDocs Meeting Interface

#### From Existing Meeting Interface:
1. Open any meeting in the app
2. Tap the "GrabDocs" button in the header
3. Confirm the switch to GrabDocs interface
4. The app will navigate to the GrabDocs prebuilt interface

#### Direct Navigation:
```typescript
router.push({
  pathname: '/quick-reach/hms-meeting-interface',
  params: {
    meetingId: 'room_code_here',
    title: 'Meeting Title',
    userName: 'User Name'
  }
});
```

### 3. GrabDocs Meeting Service API

The `hmsService` provides the following methods:

```typescript
// Initialize the service
await hmsService.initialize();

// Join a meeting
await hmsService.joinMeeting({
  roomCode: 'room_code',
  userName: 'user_name',
  enableAudio: true,
  enableVideo: true,
  role: 'viewer'
});

// Leave meeting
await hmsService.leaveMeeting();

// Toggle audio
await hmsService.toggleAudio();

// Toggle video
await hmsService.toggleVideo();

// Get meeting state
const state = hmsService.getMeetingState();

// Subscribe to state changes
const listenerId = hmsService.subscribeToStateChanges((state) => {
  console.log('Meeting state changed:', state);
});

// Unsubscribe
hmsService.unsubscribeFromStateChanges(listenerId);
```

## Web Webhook Integration

The mobile implementation **reuses existing web webhook endpoints** to ensure consistency and avoid duplication:

### Meeting Assets Integration:
- **Transcripts**: Uses `/api/meetings/{meetingId}/transcript` webhook
- **Summaries**: Uses `/api/meetings/{meetingId}/summary` webhook  
- **Chat Logs**: Uses `/api/meetings/{meetingId}/chat` webhook
- **Meeting Reports**: Uses `/api/meetings/{meetingId}/report` webhook
- **Downloads**: Uses `/api/meetings/{meetingId}/download/{assetType}` webhook

### Database Integration:
- **Previous Meetings**: Loads from `/api/v1/mobile/meetings` endpoint
- **Meeting History**: Sorted by date (most recent first)
- **Status Filtering**: Separates upcoming, ongoing, and completed meetings

### Benefits:
- ✅ **No duplicate endpoints** - reuses existing web infrastructure
- ✅ **Consistent data** - same webhooks serve both web and mobile
- ✅ **Easier maintenance** - single source of truth for meeting data
- ✅ **Cost effective** - leverages existing backend implementation

## Features

### GrabDocs Meeting Interface Features:
- **Video Conferencing**: High-quality video with multiple participants
- **Audio Controls**: Mute/unmute functionality
- **Video Controls**: Turn camera on/off
- **Participant Management**: View participant count and status
- **Real-time Communication**: Low-latency audio/video
- **Error Handling**: Comprehensive error handling and user feedback
- **Loading States**: Proper loading indicators
- **Responsive Design**: Optimized for mobile devices

### Integration Features:
- **Seamless Switching**: Easy switch between custom and GrabDocs interfaces
- **Backend Integration**: Secure token generation via backend
- **State Management**: Real-time meeting state updates
- **Error Recovery**: Automatic retry mechanisms
- **Cross-platform**: Works on both iOS and Android

## Permissions

The following permissions are already configured in `app.json`:

```json
{
  "permissions": [
    "android.permission.CAMERA",
    "android.permission.RECORD_AUDIO"
  ]
}
```

## Troubleshooting

### Common Issues:

1. **"Auth token generation not implemented"**
   - Ensure backend endpoints are implemented
   - Check GrabDocs meeting credentials in .env file
   - Verify backend server is running

2. **"Failed to join meeting"**
   - Check network connectivity
   - Verify room code is valid
   - Ensure GrabDocs meeting credentials are correct

3. **Camera/Microphone not working**
   - Check app permissions
   - Ensure device has camera/microphone
   - Try restarting the app

4. **SDK initialization failed**
   - Check GrabDocs meeting SDK installation
   - Verify React Native version compatibility
   - Check for conflicting dependencies

### Debug Steps:

1. Use the test screen (`/quick-reach/test-hms`) to verify integration
2. Check console logs for detailed error messages
3. Verify backend API responses
4. Test with different room codes
5. Check GrabDocs meeting dashboard for room status

## Security Considerations

1. **Token Security**: Auth tokens are generated server-side using GrabDocs meeting App Secret
2. **Room Access**: Implement proper room access controls in backend
3. **User Authentication**: Integrate with existing user authentication system
4. **Data Privacy**: Ensure compliance with privacy regulations

## Performance Optimization

1. **Lazy Loading**: GrabDocs meeting SDK is loaded only when needed
2. **Memory Management**: Proper cleanup of resources
3. **Network Optimization**: Efficient token caching
4. **Battery Optimization**: Optimized for mobile battery usage

## Mobile: Screenshare, Whiteboard & Host Controls

Screenshare, whiteboard, and host mute/unmute work on web; on mobile they need dashboard permissions and (for iOS screenshare) optional native setup. See **[docs/MOBILE_SCREENSHARE_WHITEBOARD.md](docs/MOBILE_SCREENSHARE_WHITEBOARD.md)** for:

- **Host mute/unmute:** If the host can mute but not unmute participants, enable the **Unmute** permission for the host role in the 100ms Dashboard (no app change needed).
- **Android:** Screenshare activity and permission (already added in this repo); ensure the mobile role has screenshare in the 100ms dashboard.
- **iOS:** Screenshare is optional and requires Xcode to add a Broadcast Upload Extension; if you don’t use Xcode, skip it—all other meeting options work on iOS without it.
- **Whiteboard:** Enable in the dashboard for the mobile template/role; display on mobile may require a WebView (see 100ms React Native whiteboard docs).
- **All options:** Checklist in the doc for mute, unmute, screenshare, whiteboard, chat, recording, and change role so everything works on web and mobile.

## Future Enhancements

Potential improvements for the HMS integration:
- Chat integration
- Recording capabilities
- Breakout rooms
- Custom UI themes
- Advanced participant controls

## Support

For issues related to:
- **HMS SDK**: Check [100ms documentation](https://100ms.live/docs)
- **Mobile Integration**: Review this guide and check console logs
- **Backend Issues**: Verify API endpoints and credentials
- **App Issues**: Check React Native and Expo documentation

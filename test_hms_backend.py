#!/usr/bin/env python3
"""
Test script to verify HMS backend integration locally.
This tests the backend HMS room creation without needing a full mobile build.

Usage:
    python test_hms_backend.py
"""

import requests
import json
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'manager-francis', 'backend'))

# Configuration - adjust these to match your local setup
BASE_URL = "http://localhost:5000"  # Adjust if your backend runs on different port
TEST_USER_TOKEN = ""  # Optional: Add a valid auth token if your endpoints require auth

def test_create_meeting_with_hms():
    """Test creating a meeting and verify HMS room is created"""
    print("🧪 Testing HMS Meeting Creation...")
    print("=" * 60)
    
    # Test payload
    payload = {
        "roomName": "Test Meeting - HMS Verification",
        "title": "Test Meeting - HMS Verification",
        "description": "Testing HMS room creation",
        "isPrivate": False,
        "enableRecording": False,
        "enableTranscription": False,
        "participants": []
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    if TEST_USER_TOKEN:
        headers["Authorization"] = f"Bearer {TEST_USER_TOKEN}"
    
    try:
        # Create meeting
        print(f"\n1️⃣ Creating meeting via POST {BASE_URL}/api/v1/video/room/create")
        response = requests.post(
            f"{BASE_URL}/api/v1/video/room/create",
            json=payload,
            headers=headers,
            timeout=10
        )
        
        print(f"   Status Code: {response.status_code}")
        
        if response.status_code == 200 or response.status_code == 201:
            data = response.json()
            print(f"   ✅ Success!")
            print(f"\n   Response Data:")
            print(json.dumps(data, indent=2))
            
            # Extract meeting info
            meeting_data = data.get('data') or data.get('room') or data
            
            meeting_id = meeting_data.get('meetingId')
            room_code = meeting_data.get('roomCode')
            hms_room_id = meeting_data.get('hmsRoomId')
            title = meeting_data.get('title') or meeting_data.get('name')
            
            print(f"\n2️⃣ Verification:")
            print(f"   Meeting ID (DB): {meeting_id}")
            print(f"   Room Code: {room_code}")
            print(f"   HMS Room ID: {hms_room_id}")
            print(f"   Title: {title}")
            
            # Verify HMS room was created
            if hms_room_id or room_code:
                print(f"\n   ✅ HMS Room Created Successfully!")
                print(f"   📝 Use this roomCode for testing: {room_code or hms_room_id}")
                
                # Test token generation
                if room_code:
                    print(f"\n3️⃣ Testing Token Generation...")
                    test_token_generation(room_code)
            else:
                print(f"\n   ⚠️  Warning: No HMS room_id found in response")
                print(f"   This might indicate HMS room creation failed")
                
        else:
            print(f"   ❌ Failed!")
            print(f"   Response: {response.text}")
            return False
            
    except requests.exceptions.ConnectionError:
        print(f"\n   ❌ Connection Error: Could not connect to {BASE_URL}")
        print(f"   Make sure your backend is running!")
        return False
    except Exception as e:
        print(f"\n   ❌ Error: {str(e)}")
        return False
    
    return True

def test_token_generation(room_code):
    """Test generating an HMS auth token for a room"""
    print(f"   Generating token for roomCode: {room_code}")
    
    headers = {
        "Content-Type": "application/json"
    }
    
    if TEST_USER_TOKEN:
        headers["Authorization"] = f"Bearer {TEST_USER_TOKEN}"
    
    try:
        # Try mobile endpoint first
        response = requests.post(
            f"{BASE_URL}/api/v1/mobile/meetings/hms-token",
            json={"roomCode": room_code},
            headers=headers,
            timeout=10
        )
        
        if response.status_code == 200:
            data = response.json()
            token = data.get('token') or data.get('authToken')
            if token:
                print(f"   ✅ Token generated successfully!")
                print(f"   Token (first 50 chars): {token[:50]}...")
                return True
            else:
                print(f"   ⚠️  Token endpoint returned success but no token")
        else:
            print(f"   ⚠️  Token generation failed: {response.status_code}")
            print(f"   Response: {response.text}")
            
    except Exception as e:
        print(f"   ⚠️  Token generation error: {str(e)}")
    
    return False

def main():
    print("\n" + "=" * 60)
    print("HMS Backend Integration Test")
    print("=" * 60)
    
    print(f"\n📋 Configuration:")
    print(f"   Backend URL: {BASE_URL}")
    print(f"   Auth Token: {'Set' if TEST_USER_TOKEN else 'Not set (may fail if auth required)'}")
    
    print(f"\n💡 Tip: Make sure your backend is running before testing!")
    print(f"   You can start it with: cd manager-francis/backend && python app.py")
    
    input("\nPress Enter to start testing...")
    
    success = test_create_meeting_with_hms()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ Test completed!")
        print("\n📱 Next Steps:")
        print("   1. Use the roomCode from above in your mobile app")
        print("   2. Create a development build: npx expo run:android (or run:ios)")
        print("   3. Navigate to the HMS meeting interface with that roomCode")
    else:
        print("❌ Test failed - check errors above")
    print("=" * 60 + "\n")

if __name__ == "__main__":
    main()

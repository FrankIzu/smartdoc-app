#!/usr/bin/env python3
"""
Test Mobile Chat Display
Tests that the mobile app should be displaying chat list correctly
"""

import requests
import json

def test_mobile_chat_display():
    """Test that mobile app should display chat list correctly"""
    print("=== Testing Mobile Chat Display ===")
    
    base_url = "http://192.168.1.7:5000"
    mobile_base = f"{base_url}/api/v1/mobile"
    
    # Create session to maintain cookies
    session = requests.Session()
    session.headers.update({
        "X-Platform": "android",
        "Content-Type": "application/json"
    })
    
    # Step 1: Login
    print("\n1. Logging in...")
    login_data = {
        "username": "francis",
        "password": "password123"
    }
    
    try:
        login_response = session.post(f"{mobile_base}/login", json=login_data)
        print(f"   Status: {login_response.status_code}")
        
        if login_response.status_code != 200:
            print("   ❌ Login failed")
            return False
        
        login_result = login_response.json()
        if not login_result.get('success'):
            print(f"   ❌ Login failed: {login_result.get('message')}")
            return False
        
        print("   ✅ Login successful!")
        
    except Exception as e:
        print(f"   ❌ Login error: {e}")
        return False
    
    # Step 2: Get chat history
    print("\n2. Getting chat history...")
    try:
        history_response = session.get(f"{mobile_base}/chat/history")
        print(f"   Status: {history_response.status_code}")
        
        if history_response.status_code == 200:
            history_data = history_response.json()
            histories = history_data.get('data', [])
            print(f"   ✅ Found {len(histories)} chat histories")
            
            # Show the most recent chats
            recent_chats = histories[:5]
            print(f"\n   📱 Most recent chats:")
            for i, chat in enumerate(recent_chats, 1):
                chat_id = chat.get('id')
                title = chat.get('title', 'Untitled')
                selected_files = chat.get('selected_files', [])
                message_count = len(chat.get('conversation_data', []))
                updated_at = chat.get('updated_at', 'Unknown')
                
                print(f"   {i}. ID: {chat_id}")
                print(f"      Title: {title}")
                print(f"      Files: {selected_files}")
                print(f"      Messages: {message_count}")
                print(f"      Updated: {updated_at}")
                print()
            
            # Check for chats with file context
            chats_with_files = [chat for chat in histories if chat.get('selected_files')]
            print(f"   📄 Chats with file context: {len(chats_with_files)}")
            
            if chats_with_files:
                print(f"   ✅ Found chats with file context - these should appear in mobile app")
                for chat in chats_with_files[:3]:
                    print(f"      - {chat.get('title')} (Files: {chat.get('selected_files')})")
            else:
                print(f"   ⚠️ No chats with file context found")
                
        else:
            print(f"   ❌ Failed to get chat history: {history_response.status_code}")
            return False
            
    except Exception as e:
        print(f"   ❌ Error getting chat history: {e}")
        return False
    
    print("\n=== Mobile App Display Instructions ===")
    print("1. Open the mobile app")
    print("2. Go to the Chats tab")
    print("3. Pull down to refresh the chat list")
    print("4. You should see:")
    print("   - Chat Assistant (default)")
    print("   - Recent chats with file context")
    print("   - Document-focused chats with file icons")
    print("5. If chats don't appear:")
    print("   - Check the network connection indicator")
    print("   - Try pulling to refresh")
    print("   - Check the console logs for any errors")
    
    return True

if __name__ == "__main__":
    test_mobile_chat_display()

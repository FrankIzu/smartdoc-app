#!/usr/bin/env python3
"""
Test Chat with File Context
Tests sending a chat message with file context and verifies it's saved
"""

import requests
import json
import time

def test_chat_with_context():
    """Test sending a chat message with file context"""
    print("=== Testing Chat with File Context ===")
    
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
    
    # Step 2: Get available files for context
    print("\n2. Getting available files...")
    try:
        files_response = session.get(f"{mobile_base}/files?page=1&perPage=10")
        print(f"   Status: {files_response.status_code}")
        
        if files_response.status_code == 200:
            files_data = files_response.json()
            files = files_data.get('files', [])
            print(f"   ✅ Found {len(files)} files")
            
            if len(files) > 0:
                # Use the first file as context
                test_file = files[0]
                file_id = test_file.get('id')
                file_name = test_file.get('original_filename', 'Unknown file')
                print(f"   📄 Using file: {file_name} (ID: {file_id})")
            else:
                print("   ⚠️ No files available for context")
                file_id = None
        else:
            print(f"   ❌ Failed to get files: {files_response.status_code}")
            file_id = None
            
    except Exception as e:
        print(f"   ❌ Error getting files: {e}")
        file_id = None
    
    # Step 3: Send chat message with file context
    print("\n3. Sending chat message with file context...")
    
    chat_data = {
        "message": "What is this document about?",
        "selected_files": [file_id] if file_id else [],
        "context_file_ids": [file_id] if file_id else [],
        "response_mode": "flexible",
        "search_type": "refined"
    }
    
    try:
        chat_response = session.post(f"{mobile_base}/chat/smart", json=chat_data)
        print(f"   Status: {chat_response.status_code}")
        
        if chat_response.status_code == 200:
            chat_result = chat_response.json()
            if chat_result.get('success'):
                print("   ✅ Chat message sent successfully!")
                chat_id = chat_result.get('chat_id')
                response_text = chat_result.get('response', '')
                print(f"   💬 Chat ID: {chat_id}")
                print(f"   📝 Response: {response_text[:100]}...")
                
                # Wait a moment for the chat to be saved
                time.sleep(2)
                
                # Step 4: Check if the chat appears in history
                print("\n4. Checking chat history...")
                history_response = session.get(f"{mobile_base}/chat/history")
                print(f"   Status: {history_response.status_code}")
                
                if history_response.status_code == 200:
                    history_data = history_response.json()
                    histories = history_data.get('data', [])
                    print(f"   📚 Found {len(histories)} chat histories")
                    
                    # Look for our new chat
                    new_chat = None
                    for history in histories:
                        if history.get('id') == int(chat_id) if chat_id else False:
                            new_chat = history
                            break
                    
                    if new_chat:
                        print("   ✅ New chat found in history!")
                        print(f"   📋 Title: {new_chat.get('title')}")
                        print(f"   📄 Selected files: {new_chat.get('selected_files', [])}")
                        print(f"   💬 Messages: {len(new_chat.get('conversation_data', []))}")
                        
                        # Check if file context was saved
                        selected_files = new_chat.get('selected_files', [])
                        if file_id and file_id in selected_files:
                            print("   ✅ File context was saved correctly!")
                        else:
                            print("   ⚠️ File context not found in saved chat")
                    else:
                        print("   ❌ New chat not found in history")
                        print(f"   🔍 Looking for chat ID: {chat_id}")
                        print(f"   📚 Available chat IDs: {[h.get('id') for h in histories]}")
                else:
                    print(f"   ❌ Failed to get chat history: {history_response.status_code}")
            else:
                print(f"   ❌ Chat failed: {chat_result.get('message')}")
        else:
            print(f"   ❌ Chat request failed: {chat_response.status_code}")
            print(f"   Response: {chat_response.text}")
            
    except Exception as e:
        print(f"   ❌ Chat error: {e}")
        return False
    
    print("\n=== Test Summary ===")
    print("✅ Chat with file context test completed")
    return True

if __name__ == "__main__":
    test_chat_with_context()

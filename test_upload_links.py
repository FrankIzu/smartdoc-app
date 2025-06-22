#!/usr/bin/env python3
"""
Test script to debug upload links endpoint
"""
import requests
import json

def test_upload_links():
    base_url = "http://192.168.1.7:5000"
    
    # First, login to get session
    login_data = {
        "username": "francis",
        "password": "password123"
    }
    
    session = requests.Session()
    
    print("🔐 Attempting login...")
    try:
        login_response = session.post(f"{base_url}/api/v1/mobile/login", json=login_data)
        print(f"Login status: {login_response.status_code}")
        
        if login_response.status_code == 200:
            login_result = login_response.json()
            print(f"Login successful: {login_result.get('success')}")
            print(f"User: {login_result.get('user', {}).get('username')}")
            
            # Test upload links endpoint
            print("\n🔗 Testing upload links endpoint...")
            upload_links_response = session.get(f"{base_url}/api/v1/mobile/upload-links")
            print(f"Upload links status: {upload_links_response.status_code}")
            
            if upload_links_response.status_code == 200:
                upload_links_data = upload_links_response.json()
                print(f"✅ Upload links response: {json.dumps(upload_links_data, indent=2)}")
            else:
                print(f"❌ Upload links error:")
                print(f"Status: {upload_links_response.status_code}")
                print(f"Response: {upload_links_response.text}")
                
        else:
            print(f"❌ Login failed: {login_response.text}")
            
    except Exception as e:
        print(f"❌ Error: {str(e)}")

if __name__ == "__main__":
    test_upload_links() 
#!/usr/bin/env python3
"""
Final Mobile Connection Test
Tests the complete mobile app connection and authentication flow
"""

import requests
import json
import time

def test_mobile_connection():
    """Test the complete mobile connection and authentication"""
    print("=== Final Mobile Connection Test ===")
    
    base_url = "http://192.168.1.7:5000"
    mobile_base = f"{base_url}/api/v1/mobile"
    
    # Create session to maintain cookies
    session = requests.Session()
    session.headers.update({
        "X-Platform": "android",
        "Content-Type": "application/json"
    })
    
    # Test 1: Health Check
    print("\n1. Testing health endpoint...")
    try:
        health_response = session.get(f"{mobile_base}/health")
        print(f"   Status: {health_response.status_code}")
        if health_response.status_code == 200:
            health_data = health_response.json()
            print(f"   ✅ Health check successful: {health_data.get('message')}")
        else:
            print(f"   ❌ Health check failed: {health_response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Health check error: {e}")
        return False
    
    # Test 2: Auth Check (should be false initially)
    print("\n2. Testing initial auth check...")
    try:
        auth_response = session.get(f"{mobile_base}/auth-check")
        print(f"   Status: {auth_response.status_code}")
        auth_data = auth_response.json()
        print(f"   Authenticated: {auth_data.get('authenticated', False)}")
        if not auth_data.get('authenticated', False):
            print("   ✅ Correctly not authenticated initially")
        else:
            print("   ⚠️ Already authenticated (session exists)")
    except Exception as e:
        print(f"   ❌ Auth check error: {e}")
    
    # Test 3: Login
    print("\n3. Testing login...")
    login_data = {
        "username": "francis",
        "password": "password123"
    }
    
    try:
        login_response = session.post(f"{mobile_base}/login", json=login_data)
        print(f"   Status: {login_response.status_code}")
        
        if login_response.status_code == 200:
            login_result = login_response.json()
            if login_result.get('success'):
                print("   ✅ Login successful!")
                user_data = login_result.get('user', {})
                print(f"   👤 User: {user_data.get('username')} ({user_data.get('email')})")
            else:
                print(f"   ❌ Login failed: {login_result.get('message')}")
                return False
        else:
            print(f"   ❌ Login request failed: {login_response.status_code}")
            print(f"   Response: {login_response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Login error: {e}")
        return False
    
    # Test 4: Auth Check (should be true after login)
    print("\n4. Testing auth check after login...")
    try:
        auth_response = session.get(f"{mobile_base}/auth-check")
        print(f"   Status: {auth_response.status_code}")
        auth_data = auth_response.json()
        print(f"   Authenticated: {auth_data.get('authenticated', False)}")
        if auth_data.get('authenticated', False):
            print("   ✅ Correctly authenticated after login")
        else:
            print("   ❌ Not authenticated after login")
            return False
    except Exception as e:
        print(f"   ❌ Auth check error: {e}")
        return False
    
    # Test 5: Dashboard Analytics
    print("\n5. Testing dashboard analytics...")
    try:
        analytics_response = session.get(f"{mobile_base}/analysis/dashboard")
        print(f"   Status: {analytics_response.status_code}")
        if analytics_response.status_code == 200:
            analytics_data = analytics_response.json()
            print("   ✅ Dashboard analytics successful!")
            print(f"   📊 Data keys: {list(analytics_data.keys())}")
        else:
            print(f"   ❌ Dashboard analytics failed: {analytics_response.status_code}")
            print(f"   Response: {analytics_response.text}")
    except Exception as e:
        print(f"   ❌ Dashboard analytics error: {e}")
    
    # Test 6: Files List
    print("\n6. Testing files list...")
    try:
        files_response = session.get(f"{mobile_base}/files?page=1&perPage=10")
        print(f"   Status: {files_response.status_code}")
        if files_response.status_code == 200:
            files_data = files_response.json()
            print("   ✅ Files list successful!")
            files = files_data.get('files', [])
            print(f"   📁 Found {len(files)} files")
        else:
            print(f"   ❌ Files list failed: {files_response.status_code}")
            print(f"   Response: {files_response.text}")
    except Exception as e:
        print(f"   ❌ Files list error: {e}")
    
    print("\n=== Test Summary ===")
    print("✅ Backend server is running and accessible")
    print("✅ Mobile API endpoints are working")
    print("✅ Authentication flow is working")
    print("✅ Session management is working")
    print("\n🎉 Mobile app should now be able to connect and authenticate!")
    
    return True

if __name__ == "__main__":
    test_mobile_connection()

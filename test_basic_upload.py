#!/usr/bin/env python3
"""
Basic Upload Test - Bypasses Complex Pipeline
Tests basic file upload without AI classification to isolate the issue
"""

import requests
import json
from pathlib import Path

# Configuration
BASE_URL = "http://localhost:5000"
LOGIN_URL = f"{BASE_URL}/api/v1/mobile/login"

# Test credentials
USERNAME = "francis"
PASSWORD = "password123"

def create_test_file():
    """Create a simple test file for upload"""
    test_content = """Test Document for Upload
    
This is a test document to verify the upload functionality.
It contains some text that should be processed by the classification pipeline.

Date: December 20, 2024
Type: Test Document
Purpose: Upload verification
"""
    
    test_file = Path("test_basic_upload.txt")
    test_file.write_text(test_content)
    return test_file

def test_direct_api_call():
    """Test a direct API call to create a file record without the pipeline"""
    print("🧪 Testing Direct File Record Creation")
    print("=" * 60)
    
    # Create session
    session = requests.Session()
    session.headers.update({
        'X-Platform': 'android',
        'Content-Type': 'application/json'
    })
    
    # Login
    print("\n1️⃣ Logging in...")
    try:
        login_data = {"username": USERNAME, "password": PASSWORD}
        response = session.post(LOGIN_URL, json=login_data)
        
        if response.status_code != 200:
            print("❌ Login failed!")
            return False
            
        result = response.json()
        if not result.get('success'):
            print(f"❌ Login unsuccessful: {result.get('message')}")
            return False
            
        print("✅ Login successful!")
        
    except Exception as e:
        print(f"❌ Login error: {e}")
        return False
    
    # Test creating a basic file record directly
    print("\n2️⃣ Testing direct file record creation...")
    
    # Create a test endpoint for this - we'll add it to mobile routes
    test_endpoint = f"{BASE_URL}/api/v1/mobile/test-file-creation"
    
    try:
        response = session.post(test_endpoint, json={
            "filename": "test_document.txt",
            "content": "This is test content for file creation",
            "test_mode": True
        })
        
        print(f"   Status: {response.status_code}")
        print(f"   Response: {response.text}")
        
        if response.status_code == 200:
            result = response.json()
            if result.get('success'):
                print("✅ Direct file creation successful!")
                return True
            else:
                print(f"❌ Direct creation failed: {result.get('message')}")
                return False
        else:
            print(f"❌ Direct creation failed with status {response.status_code}")
            return False
            
    except Exception as e:
        print(f"❌ Direct creation error: {e}")
        return False

def main():
    """Main test function"""
    print("🔍 Basic Upload Diagnosis")
    print("Testing basic file operations without complex pipeline")
    
    success = test_direct_api_call()
    
    print("\n" + "=" * 60)
    if success:
        print("✅ Basic operations work! The issue is in the complex pipeline.")
        print("\n🔧 Next steps:")
        print("1. Check the document_classifier function")
        print("2. Check the index_document_for_search function")
        print("3. Check AI/LLM service connectivity")
        print("4. Check database transaction handling")
    else:
        print("❌ Basic operations also fail.")
        print("\n🔧 This suggests a more fundamental issue:")
        print("1. Database connectivity problems")
        print("2. Flask app context issues")
        print("3. Session/authentication problems")
        print("4. Basic Flask setup issues")
    
    return success

if __name__ == "__main__":
    main() 
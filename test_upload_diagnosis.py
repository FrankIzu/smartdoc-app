#!/usr/bin/env python3
"""
Upload Diagnosis Test - Full Classification Pipeline
Tests the mobile upload endpoint with proper authentication and full processing
"""

import requests
import json
import os
import subprocess
from pathlib import Path

# Configuration
BASE_URL = "http://localhost:5000"
LOGIN_URL = f"{BASE_URL}/api/v1/mobile/login"
UPLOAD_URL = f"{BASE_URL}/api/v1/mobile/upload"
AUTH_CHECK_URL = f"{BASE_URL}/api/v1/mobile/auth-check"

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
    
    test_file = Path("test_upload_file.txt")
    test_file.write_text(test_content)
    return test_file

def test_upload_with_curl():
    """Test upload using curl which handles multipart better"""
    print("🧪 Testing Upload with curl")
    print("=" * 60)
    
    # Create test file
    test_file = create_test_file()
    print(f"Created test file: {test_file}")
    
    try:
        # Step 1: Login to get cookies
        print("\n1️⃣ Logging in with curl...")
        login_cmd = [
            'curl', '-c', 'cookies.txt', '-X', 'POST',
            '-H', 'Content-Type: application/json',
            '-H', 'X-Platform: android',
            '-d', json.dumps({"username": USERNAME, "password": PASSWORD}),
            LOGIN_URL
        ]
        
        result = subprocess.run(login_cmd, capture_output=True, text=True)
        print(f"Login status: {result.returncode}")
        print(f"Login response: {result.stdout}")
        
        if result.returncode != 0:
            print(f"❌ Login failed: {result.stderr}")
            return False
            
        # Step 2: Upload file with cookies
        print("\n2️⃣ Uploading file with curl...")
        upload_cmd = [
            'curl', '-b', 'cookies.txt',
            '-H', 'X-Platform: android',
            '-F', f'file=@{test_file}',
            '-v',  # Verbose output
            UPLOAD_URL
        ]
        
        result = subprocess.run(upload_cmd, capture_output=True, text=True)
        print(f"Upload status: {result.returncode}")
        print(f"Upload stdout: {result.stdout}")
        print(f"Upload stderr: {result.stderr}")
        
        if result.returncode == 0:
            try:
                response_data = json.loads(result.stdout)
                if response_data.get('success'):
                    print("✅ Upload successful!")
                    return True
                else:
                    print(f"❌ Upload unsuccessful: {response_data.get('message')}")
                    return False
            except json.JSONDecodeError:
                print(f"❌ Invalid JSON response: {result.stdout}")
                return False
        else:
            print(f"❌ Curl upload failed")
            return False
            
    finally:
        # Cleanup
        if test_file.exists():
            test_file.unlink()
        if Path('cookies.txt').exists():
            Path('cookies.txt').unlink()

def test_upload_with_requests():
    """Test upload using requests library with better multipart handling"""
    print("🧪 Testing Upload with requests (improved)")
    print("=" * 60)
    
    # Create session to maintain cookies
    session = requests.Session()
    session.headers.update({
        'X-Platform': 'android',
    })
    
    # Step 1: Test login
    print("\n1️⃣ Testing login...")
    try:
        login_data = {
            "username": USERNAME,
            "password": PASSWORD
        }
        
        session.headers['Content-Type'] = 'application/json'
        response = session.post(LOGIN_URL, json=login_data)
        print(f"   Status: {response.status_code}")
        
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
    
    # Step 2: Create test file and upload
    print("\n2️⃣ Creating and uploading test file...")
    test_file = create_test_file()
    
    try:
        # Remove Content-Type header to let requests set it properly for multipart
        if 'Content-Type' in session.headers:
            del session.headers['Content-Type']
        
        with open(test_file, 'rb') as f:
            files = {'file': (test_file.name, f, 'text/plain')}
            
            print(f"   Uploading: {test_file.name}")
            print(f"   File size: {test_file.stat().st_size} bytes")
            
            response = session.post(UPLOAD_URL, files=files)
            
            print(f"   Status: {response.status_code}")
            print(f"   Response: {response.text}")
            
            if response.status_code == 200:
                try:
                    result = response.json()
                    if result.get('success'):
                        print("✅ Upload successful with full classification!")
                        file_info = result.get('file', {})
                        print(f"   File ID: {file_info.get('id')}")
                        print(f"   Classification: {file_info.get('file_kind')}")
                        return True
                    else:
                        print(f"❌ Upload unsuccessful: {result.get('message')}")
                        return False
                        
                except json.JSONDecodeError:
                    print(f"❌ Invalid JSON response: {response.text}")
                    return False
            else:
                print(f"❌ Upload failed with status {response.status_code}")
                return False
                
    except Exception as e:
        print(f"❌ Upload error: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Cleanup
        if test_file.exists():
            test_file.unlink()

def main():
    """Main test function"""
    print("🔍 Full Pipeline Upload Diagnosis")
    print("Testing upload with complete classification processing")
    
    # Try both methods
    print("\n" + "="*60)
    print("METHOD 1: Using requests library")
    success1 = test_upload_with_requests()
    
    print("\n" + "="*60)
    print("METHOD 2: Using curl")
    success2 = test_upload_with_curl()
    
    print("\n" + "=" * 60)
    if success1 or success2:
        print("✅ At least one upload method worked!")
    else:
        print("❌ Both upload methods failed.")
        
        print("\n🔧 Troubleshooting suggestions:")
        print("1. Check that the backend server is running on port 5000")
        print("2. Look at the backend terminal for detailed error logs")
        print("3. Verify the shared_file_processing_pipeline function")
        print("4. Check if Flask app context is properly set up")
        print("5. Test with a different file type (PDF, image, etc.)")
    
    return success1 or success2

if __name__ == "__main__":
    main() 
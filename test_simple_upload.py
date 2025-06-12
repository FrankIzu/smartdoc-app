#!/usr/bin/env python3

import requests
import json
import tempfile
import os

# Configuration
BASE_URL = "http://localhost:5000"
HEADERS = {
    "X-Platform": "android"
}

def test_simple_upload():
    """Test uploading a simple file"""
    
    # Create session to maintain cookies
    session = requests.Session()
    session.headers.update(HEADERS)
    
    print("=== Testing Simple Mobile Upload ===")
    
    # Login first
    login_data = {
        "username": "admin",
        "password": "admin123"
    }
    
    login_response = session.post(f"{BASE_URL}/api/v1/mobile/login", json=login_data)
    print(f"Login Status: {login_response.status_code}")
    
    if login_response.status_code != 200:
        print("Login failed, cannot test upload")
        return
    
    print("Login successful, proceeding with upload test...")
    
    # Create a temporary file
    with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as temp_file:
        temp_file.write("This is a test document for GrabDocs mobile app.\nCreated by test script.")
        temp_file_path = temp_file.name
    
    try:
        print(f"\nCreated temporary file: {temp_file_path}")
        
        # Upload the file
        with open(temp_file_path, 'rb') as f:
            files = {'file': ('test_document.txt', f, 'text/plain')}
            upload_headers = {"X-Platform": "android"}
            
            print("Uploading file...")
            upload_response = session.post(
                f"{BASE_URL}/api/v1/mobile/upload", 
                files=files,
                headers=upload_headers
            )
            
            print(f"Upload Status: {upload_response.status_code}")
            print(f"Upload Response: {upload_response.text}")
            
            if upload_response.status_code == 200:
                result = upload_response.json()
                print(f"Upload Success!")
                print(f"File ID: {result.get('file', {}).get('id')}")
                print(f"Filename: {result.get('file', {}).get('name')}")
            
    finally:
        # Clean up temporary file
        if os.path.exists(temp_file_path):
            os.unlink(temp_file_path)
    
    # Check files endpoint after upload
    print(f"\n=== Checking Files After Upload ===")
    files_response = session.get(f"{BASE_URL}/api/v1/mobile/files")
    print(f"Files Status: {files_response.status_code}")
    
    if files_response.status_code == 200:
        result = files_response.json()
        files_list = result.get('files', [])
        print(f"Found {len(files_list)} files:")
        for file_item in files_list:
            print(f"  - {file_item.get('filename')} (Kind: {file_item.get('file_kind')}, Type: {file_item.get('file_type')})")
        
        if 'debug' in result:
            print(f"Available categories: {result['debug'].get('available_categories', [])}")
    else:
        print(f"Files retrieval failed: {files_response.text}")

if __name__ == "__main__":
    test_simple_upload() 
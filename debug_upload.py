#!/usr/bin/env python3

import requests
import json
import tempfile
import os

# Test the upload step by step
def debug_upload_endpoint():
    print("=== Debugging Upload Endpoint ===")
    
    # First, let's check if the endpoint exists
    session = requests.Session()
    session.headers.update({"X-Platform": "android"})
    
    # Login
    login_data = {"username": "admin", "password": "admin123"}
    login_response = session.post("http://localhost:5000/api/v1/mobile/login", json=login_data)
    print(f"Login Status: {login_response.status_code}")
    
    if login_response.status_code != 200:
        print("Login failed")
        return
    
    # Test upload endpoint without file first
    print("\n1. Testing upload without file...")
    upload_response = session.post("http://localhost:5000/api/v1/mobile/upload", headers={"X-Platform": "android"})
    print(f"No file status: {upload_response.status_code}")
    print(f"No file response: {upload_response.text}")
    
    # Test with empty file field
    print("\n2. Testing upload with empty file field...")
    files = {'file': ('', '', 'text/plain')}
    upload_response = session.post("http://localhost:5000/api/v1/mobile/upload", files=files, headers={"X-Platform": "android"})
    print(f"Empty file status: {upload_response.status_code}")
    print(f"Empty file response: {upload_response.text}")
    
    # Test with actual file content
    print("\n3. Testing upload with actual file...")
    file_content = b"Test file content for GrabDocs"
    files = {'file': ('test.txt', file_content, 'text/plain')}
    upload_response = session.post("http://localhost:5000/api/v1/mobile/upload", files=files, headers={"X-Platform": "android"})
    print(f"Real file status: {upload_response.status_code}")
    print(f"Real file response: {upload_response.text}")
    
    # Check if there's a different upload endpoint
    print("\n4. Testing regular upload endpoint...")
    upload_response = session.post("http://localhost:5000/upload", files=files, headers={"X-Platform": "android"})
    print(f"Regular upload status: {upload_response.status_code}")
    print(f"Regular upload response: {upload_response.text}")
    
    # Let's also check what endpoints are available
    print("\n5. Testing root mobile endpoint...")
    mobile_response = session.get("http://localhost:5000/api/v1/mobile/", headers={"X-Platform": "android"})
    print(f"Mobile root status: {mobile_response.status_code}")
    print(f"Mobile root response: {mobile_response.text}")

if __name__ == "__main__":
    debug_upload_endpoint() 
#!/usr/bin/env python3

import requests
import json

# Configuration
BASE_URL = "http://localhost:5000"
HEADERS = {
    "Content-Type": "application/json",
    "X-Platform": "android"
}

def test_login_and_files():
    """Test login and files endpoint"""
    
    # Create session to maintain cookies
    session = requests.Session()
    session.headers.update(HEADERS)
    
    print("=== Testing Mobile Login ===")
    
    # Try login
    login_data = {
        "username": "admin",  # or whatever username exists
        "password": "admin123"  # or whatever password exists
    }
    
    login_response = session.post(f"{BASE_URL}/api/v1/mobile/login", json=login_data)
    print(f"Login Status: {login_response.status_code}")
    print(f"Login Response: {json.dumps(login_response.json(), indent=2)}")
    
    if login_response.status_code == 200:
        print("\n=== Testing Files Endpoint ===")
        
        # Test files endpoint
        files_response = session.get(f"{BASE_URL}/api/v1/mobile/files")
        print(f"Files Status: {files_response.status_code}")
        print(f"Files Response: {json.dumps(files_response.json(), indent=2)}")
        
        # Test with category filters
        categories = ['all', 'documents', 'receipts', 'forms', 'unknown']
        for category in categories:
            print(f"\n--- Testing category: {category} ---")
            cat_response = session.get(f"{BASE_URL}/api/v1/mobile/files?category={category}")
            print(f"Status: {cat_response.status_code}")
            result = cat_response.json()
            print(f"Files count: {len(result.get('files', []))}")
            if 'debug' in result:
                print(f"Available categories: {result['debug'].get('available_categories', [])}")
        
        # Test dashboard stats
        print(f"\n=== Testing Dashboard Stats ===")
        dashboard_response = session.get(f"{BASE_URL}/api/v1/mobile/analysis/dashboard")
        print(f"Dashboard Status: {dashboard_response.status_code}")
        print(f"Dashboard Response: {json.dumps(dashboard_response.json(), indent=2)}")
        
    else:
        print("Login failed, cannot test files endpoint")
        
        # Let's also test if we can check what users exist
        print("\n=== Checking Database Directly ===")
        try:
            import sys
            import os
            sys.path.append('backend')
            
            from backend.shared import db, File, User
            
            # Check users
            users = db.session.query(User).all()
            print(f"Total users: {len(users)}")
            for user in users:
                print(f"  User {user.id}: {user.username} ({user.email})")
            
            # Check files
            files = db.session.query(File).all()
            print(f"Total files: {len(files)}")
            for file in files[:5]:
                print(f"  File {file.id}: {file.filename} (kind: {file.file_kind}, user: {file.user_id})")
                
            # Check unique file kinds
            unique_kinds = db.session.query(File.file_kind).distinct().all()
            print(f"Unique file_kind values: {[k[0] for k in unique_kinds]}")
            
        except Exception as e:
            print(f"Database check error: {e}")

if __name__ == "__main__":
    test_login_and_files() 
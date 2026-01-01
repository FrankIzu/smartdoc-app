#!/usr/bin/env python3

import requests
import json

# Configuration
BASE_URL = "http://localhost:5000"
HEADERS = {
    "Content-Type": "application/json",
    "X-Platform": "android"
}

def test_francis_files():
    """Test files endpoint with francis credentials"""
    
    # Create session to maintain cookies
    session = requests.Session()
    session.headers.update(HEADERS)
    
    print("=== Testing Francis Account Files ===")
    
    # Try login with francis credentials
    login_data = {
        "username": "francis",
        "password": "password123"
    }
    
    login_response = session.post(f"{BASE_URL}/api/v1/mobile/login", json=login_data)
    print(f"Login Status: {login_response.status_code}")
    print(f"Login Response: {json.dumps(login_response.json(), indent=2)}")
    
    if login_response.status_code == 200:
        print("\n=== Testing Files Endpoint ===")
        
        # Test files endpoint
        files_response = session.get(f"{BASE_URL}/api/v1/mobile/files")
        print(f"Files Status: {files_response.status_code}")
        result = files_response.json()
        
        files_list = result.get('files', [])
        print(f"Total files found: {len(files_list)}")
        
        if 'debug' in result:
            debug_info = result['debug']
            print(f"Available categories: {debug_info.get('available_categories', [])}")
            print(f"Total files for user: {debug_info.get('total_files_for_user', 0)}")
        
        # Show sample files
        print(f"\nFirst 10 files:")
        for i, file_item in enumerate(files_list[:10]):
            print(f"  {i+1}. {file_item.get('filename')} (Kind: {file_item.get('file_kind')}, Type: {file_item.get('file_type')})")
        
        if len(files_list) > 10:
            print(f"  ... and {len(files_list) - 10} more files")
        
        # Test with category filters
        print(f"\n=== Testing Category Filters ===")
        categories = ['all', 'documents', 'receipts', 'forms', 'unknown']
        for category in categories:
            print(f"\n--- Testing category: {category} ---")
            cat_response = session.get(f"{BASE_URL}/api/v1/mobile/files?category={category}")
            cat_result = cat_response.json()
            cat_files = cat_result.get('files', [])
            print(f"Status: {cat_response.status_code}")
            print(f"Files count: {len(cat_files)}")
            
            # Show a few files from this category
            for i, file_item in enumerate(cat_files[:3]):
                print(f"  - {file_item.get('filename')} (Kind: {file_item.get('file_kind')})")
        
        # Test dashboard stats
        print(f"\n=== Testing Dashboard Stats ===")
        dashboard_response = session.get(f"{BASE_URL}/api/v1/mobile/analysis/dashboard")
        print(f"Dashboard Status: {dashboard_response.status_code}")
        if dashboard_response.status_code == 200:
            dashboard_result = dashboard_response.json()
            stats = dashboard_result.get('data', {}).get('stats', {})
            print(f"Dashboard stats:")
            print(f"  Total Files: {stats.get('totalFiles', 0)}")
            print(f"  Total Documents: {stats.get('totalDocuments', 0)}")
            print(f"  Total Forms: {stats.get('totalForms', 0)}")
            print(f"  Total Size: {stats.get('totalSize', 0)}")
        
    else:
        print("Login failed - cannot test files endpoint")
        print("Trying to check what users exist in database...")
        
        # Check database directly if login fails
        try:
            import sys
            import os
            sys.path.append('manager-francis/backend')
            
            from backend.shared import db, File, User
            
            # Check users
            users = db.session.query(User).all()
            print(f"\nTotal users in database: {len(users)}")
            for user in users:
                print(f"  User {user.id}: {user.username} ({user.email})")
                
                # Count files for each user
                file_count = db.session.query(File).filter_by(user_id=user.id).count()
                print(f"    Files: {file_count}")
                
        except Exception as e:
            print(f"Database check error: {e}")

if __name__ == "__main__":
    test_francis_files() 
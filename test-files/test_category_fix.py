#!/usr/bin/env python3

import requests
import json

def test_category_fix():
    """Test the category filtering fix"""
    
    session = requests.Session()
    session.headers.update({"X-Platform": "android", "Content-Type": "application/json"})
    
    # Login with francis
    login_data = {"username": "francis", "password": "password123"}
    login_response = session.post("http://localhost:5000/api/v1/mobile/login", json=login_data)
    
    if login_response.status_code != 200:
        print("Login failed")
        return
    
    print("🔍 Testing Category Filtering Fix")
    print("=" * 50)
    
    # Test different category formats
    test_categories = [
        ("all", "Should show all files"),
        ("documents", "Should show Document files"), 
        ("receipts", "Should show Receipt files"),
        ("forms", "Should show Form files"),
        ("Document", "Direct database value"),
        ("Receipt", "Direct database value"),
        ("Form", "Direct database value")
    ]
    
    for category, description in test_categories:
        response = session.get(f"http://localhost:5000/api/v1/mobile/files?category={category}")
        
        if response.status_code == 200:
            result = response.json()
            files_count = len(result.get('files', []))
            debug_info = result.get('debug', {})
            
            print(f"\n📂 Category: '{category}'")
            print(f"   Description: {description}")
            print(f"   Files found: {files_count}")
            print(f"   Available categories: {debug_info.get('available_categories', [])}")
            
            # Show a few file names if found
            if files_count > 0:
                files = result.get('files', [])
                print(f"   Sample files:")
                for i, file_item in enumerate(files[:3]):
                    kind = file_item.get('file_kind', 'Unknown')
                    name = file_item.get('filename', 'Unknown')[:50]
                    print(f"     {i+1}. {name}... (Kind: {kind})")
        else:
            print(f"\n❌ Category: '{category}' - Status: {response.status_code}")

    print("\n" + "=" * 50)
    print("📊 Summary:")
    print("If the fix is working, you should see:")
    print("  - 'all' category shows ~20 files")
    print("  - 'documents' and 'Document' show same files") 
    print("  - 'receipts' and 'Receipt' show same files")
    print("  - 'forms' and 'Form' show same files")

if __name__ == "__main__":
    test_category_fix() 
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

def create_test_files():
    """Create some test files for uploading"""
    files = {}
    
    # Create a test PDF-like file
    pdf_content = b"%PDF-1.4\n1 0 obj\n<<\n/Type /Catalog\n/Pages 2 0 R\n>>\nendobj\n2 0 obj\n<<\n/Type /Pages\n/Kids [3 0 R]\n/Count 1\n>>\nendobj\n3 0 obj\n<<\n/Type /Page\n/Parent 2 0 R\n/MediaBox [0 0 612 792]\n>>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000099 00000 n \ntrailer\n<<\n/Size 4\n/Root 1 0 R\n>>\nstartxref\n173\n%%EOF"
    files['test_document.pdf'] = ('test_document.pdf', pdf_content, 'application/pdf')
    
    # Create a test text file
    txt_content = b"This is a test document for the GrabDocs application.\nIt contains some sample text to test file uploads."
    files['test_receipt.txt'] = ('test_receipt.txt', txt_content, 'text/plain')
    
    # Create another test file
    doc_content = b"Invoice #12345\nDate: 2024-12-01\nAmount: $150.00\nVendor: Test Company"
    files['invoice_sample.txt'] = ('invoice_sample.txt', doc_content, 'text/plain')
    
    return files

def test_upload_and_retrieve():
    """Test uploading files and then retrieving them"""
    
    # Create session to maintain cookies
    session = requests.Session()
    session.headers.update(HEADERS)
    
    print("=== Testing Mobile Upload and Retrieval ===")
    
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
    
    # Create test files
    test_files = create_test_files()
    
    print(f"\n=== Uploading {len(test_files)} test files ===")
    
    for filename, file_data in test_files.items():
        print(f"\nUploading: {filename}")
        
        # Prepare multipart form data
        files = {'file': file_data}
        
        # Remove Content-Type header for multipart upload
        upload_headers = {"X-Platform": "android"}
        
        upload_response = session.post(
            f"{BASE_URL}/api/v1/mobile/upload", 
            files=files,
            headers=upload_headers
        )
        
        print(f"Upload Status: {upload_response.status_code}")
        if upload_response.status_code == 200:
            result = upload_response.json()
            print(f"Upload Success: {result.get('message', 'No message')}")
            if 'files' in result:
                for uploaded_file in result['files']:
                    print(f"  Uploaded: {uploaded_file.get('filename')} (ID: {uploaded_file.get('id')})")
        else:
            print(f"Upload Failed: {upload_response.text}")
    
    print(f"\n=== Checking Files After Upload ===")
    
    # Check files endpoint
    files_response = session.get(f"{BASE_URL}/api/v1/mobile/files")
    print(f"Files Status: {files_response.status_code}")
    
    if files_response.status_code == 200:
        result = files_response.json()
        print(f"Files Response: {json.dumps(result, indent=2)}")
        
        files_list = result.get('files', [])
        print(f"\nFound {len(files_list)} files:")
        for file_item in files_list:
            print(f"  - {file_item.get('filename')} (Kind: {file_item.get('file_kind')}, Type: {file_item.get('file_type')})")
    else:
        print(f"Files retrieval failed: {files_response.text}")
    
    # Test dashboard stats after upload
    print(f"\n=== Dashboard Stats After Upload ===")
    dashboard_response = session.get(f"{BASE_URL}/api/v1/mobile/analysis/dashboard")
    if dashboard_response.status_code == 200:
        result = dashboard_response.json()
        stats = result.get('data', {}).get('stats', {})
        print(f"Total Files: {stats.get('totalFiles', 0)}")
        print(f"Total Documents: {stats.get('totalDocuments', 0)}")
        print(f"Total Size: {stats.get('totalSize', 0)}")
    else:
        print(f"Dashboard failed: {dashboard_response.text}")

if __name__ == "__main__":
    test_upload_and_retrieve() 
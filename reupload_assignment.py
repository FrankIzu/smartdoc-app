import requests
import os

def reupload_assignment():
    session = requests.Session()
    
    # Login first
    print("🔐 Logging in...")
    login_data = {'username': 'francis', 'password': 'password123'}
    login_response = session.post('http://192.168.1.7:5000/api/v1/mobile/login', 
                                 json=login_data, headers={'X-Platform': 'android'})
    
    if login_response.status_code != 200:
        print(f"❌ Login failed: {login_response.status_code}")
        return
    
    print("✅ Login successful")
    
    # Check if the Assignment file still exists in database
    print("📄 Checking existing files...")
    files_response = session.get('http://192.168.1.7:5000/api/v1/mobile/files?page=1&per_page=50',
                                headers={'X-Platform': 'android'})
    
    assignment_file = None
    if files_response.status_code == 200:
        data = files_response.json()
        if data.get('success'):
            files = data.get('files', [])
            for file in files:
                if file.get('id') == 166 or 'Assignment' in file.get('original_filename', ''):
                    assignment_file = file
                    break
    
    if assignment_file:
        print(f"✅ Assignment file found in database:")
        print(f"   ID: {assignment_file['id']}")
        print(f"   Name: {assignment_file['original_filename']}")
        print(f"   Size: {assignment_file['file_size']} bytes")
        print(f"   Type: {assignment_file['file_type']}")
        
        # The file exists in database but needs to be re-indexed
        # We can trigger re-indexing by making a chat request about it
        print("\n🔄 Testing document search with the existing file...")
        
        chat_data = {
            'message': 'Summarize the Assignment 1 document by Dr. Onodueze',
            'filters': {
                'document_ids': [assignment_file['id']],
                'context_type': 'document'
            }
        }
        
        chat_response = session.post('http://192.168.1.7:5000/api/v1/mobile/chat/send',
                                    json=chat_data, headers={'X-Platform': 'android'})
        
        if chat_response.status_code == 200:
            result = chat_response.json()
            print(f"📊 Chat response received")
            print(f"✅ Success: {result.get('success', False)}")
            
            response_text = result.get('response', '')
            print(f"📄 Response length: {len(response_text)} characters")
            print(f"📄 Response preview: {response_text[:200]}...")
            
            # Check if it's a generic response or document-specific
            if any(keyword in response_text.lower() for keyword in ['assignment', 'chapter', 'dr', 'onodueze']):
                print("✅ Response appears to be document-specific!")
            else:
                print("⚠️  Response appears to be generic - document may not be indexed")
                
            if 'metadata' in result:
                metadata = result['metadata']
                print(f"🎯 Advanced search enabled: {metadata.get('advanced_search_enabled', False)}")
                print(f"🔍 Query type: {metadata.get('query_type', 'N/A')}")
                if 'filters_applied' in metadata:
                    print(f"🎯 Filters applied: {metadata['filters_applied']}")
        else:
            print(f"❌ Chat request failed: {chat_response.status_code}")
            print(f"Response: {chat_response.text}")
    else:
        print("❌ Assignment file not found in database")
        print("   The file may have been lost when ChromaDB was removed")
        print("   You may need to re-upload the file through the mobile app")

if __name__ == "__main__":
    reupload_assignment() 
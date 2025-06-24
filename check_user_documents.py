import chromadb
import os

def check_user_documents():
    try:
        # Connect to backend ChromaDB
        backend_chroma_path = './manager-francis/backend/chroma_db'
        client = chromadb.PersistentClient(path=backend_chroma_path)
        
        # Get the user_documents collection
        collection = client.get_collection('user_documents')
        print(f'📊 user_documents collection: {collection.count()} total chunks')
        
        # Search for assignment-related content
        results = collection.query(
            query_texts=['Assignment Dr Onodueze'],
            n_results=10
        )
        
        print(f'\n🔍 Assignment search results: {len(results["documents"][0])}')
        
        if results['documents'][0]:
            print('✅ Assignment content found!')
            for i, (doc, metadata) in enumerate(zip(results['documents'][0], results['metadatas'][0])):
                print(f'   {i+1}. File ID: {metadata.get("file_id", "N/A")}')
                print(f'      Filename: {metadata.get("filename", "N/A")}')
                print(f'      Content: {doc[:100]}...')
                print()
        else:
            print('❌ No assignment content found in search')
            
        # Check specifically for file ID 166
        try:
            file_166_results = collection.get(
                where={"file_id": 166},
                limit=10
            )
            print(f'\n📄 File ID 166 chunks: {len(file_166_results["documents"])}')
            
            if file_166_results["documents"]:
                print('✅ Assignment file (ID 166) IS indexed!')
                for i, (doc, metadata) in enumerate(zip(file_166_results["documents"], file_166_results["metadatas"])):
                    print(f'   Chunk {i+1}: {doc[:100]}...')
                    print(f'   Metadata: {metadata}')
                    print()
            else:
                print('❌ Assignment file (ID 166) NOT found by file_id')
                
        except Exception as e:
            print(f'Error querying by file_id: {e}')
            
        # Check for file ID as string
        try:
            file_166_str_results = collection.get(
                where={"file_id": "166"},
                limit=10
            )
            print(f'\n📄 File ID "166" (string) chunks: {len(file_166_str_results["documents"])}')
            
            if file_166_str_results["documents"]:
                print('✅ Assignment file (ID "166" as string) IS indexed!')
            else:
                print('❌ Assignment file (ID "166" as string) NOT found')
                
        except Exception as e:
            print(f'Error querying by file_id as string: {e}')
            
        # Get a sample of all metadata to see the structure
        print('\n📋 Sample metadata structure:')
        sample = collection.get(limit=5)
        if sample['metadatas']:
            for i, metadata in enumerate(sample['metadatas'][:3]):
                print(f'   Sample {i+1}: {metadata}')
                
    except Exception as e:
        print(f'❌ Error: {e}')

if __name__ == "__main__":
    check_user_documents() 
#!/usr/bin/env python3
"""
Simple debug script to test FileUploadLink model directly
"""
import sys
import os

# Add the manager-francis/backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'manager-francis', 'backend'))

def debug_file_upload_link():
    try:
        print("🔍 Testing FileUploadLink import...")
        from shared import db, FileUploadLink, User
        print("✅ Successfully imported FileUploadLink and related models")
        
        print("🔧 Testing app context...")
        from app import app
        with app.app_context():
            print("✅ App context created successfully")
            
            print("🗃️ Testing database connection...")
            # Simple test query
            user_count = db.session.query(User).count()
            print(f"✅ Database connection working - Found {user_count} users")
            
            print("📋 Testing FileUploadLink table...")
            try:
                # Test if we can query the table
                link_count = db.session.query(FileUploadLink).count()
                print(f"✅ FileUploadLink table accessible - Found {link_count} upload links")
                
                # Test the exact query from the endpoint
                from sqlalchemy import desc
                upload_links = db.session.query(FileUploadLink).filter_by(
                    user_id=2  # Francis's user ID
                ).order_by(desc(FileUploadLink.created_at)).all()
                
                print(f"✅ Query executed successfully - Found {len(upload_links)} links for user 2")
                
                if upload_links:
                    link = upload_links[0]
                    print(f"📝 Sample link attributes:")
                    print(f"  - ID: {getattr(link, 'id', 'Missing')}")
                    print(f"  - link_name: {getattr(link, 'link_name', 'Missing')}")
                    print(f"  - name: {getattr(link, 'name', 'Missing')}")  
                    print(f"  - link_token: {getattr(link, 'link_token', 'Missing')}")
                    print(f"  - token: {getattr(link, 'token', 'Missing')}")
                    print(f"  - is_active: {getattr(link, 'is_active', 'Missing')}")
                    print(f"  - expires_at: {getattr(link, 'expires_at', 'Missing')}")
                    print(f"  - created_at: {getattr(link, 'created_at', 'Missing')}")
                    print(f"  - uploaded_files: {getattr(link, 'uploaded_files', 'Missing')}")
                    print(f"  - files: {getattr(link, 'files', 'Missing')}")
                
            except Exception as e:
                print(f"❌ FileUploadLink table error: {str(e)}")
                
                # Check table structure
                print("📊 Checking table structure...")
                inspector = db.inspect(db.engine)
                if 'file_upload_links' in inspector.get_table_names():
                    columns = inspector.get_columns('file_upload_links')
                    print("📋 Table columns:")
                    for col in columns:
                        print(f"  - {col['name']}: {col['type']}")
                else:
                    print("❌ file_upload_links table does not exist!")
                    print("📋 Available tables:")
                    for table in inspector.get_table_names():
                        print(f"  - {table}")
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    debug_file_upload_link() 
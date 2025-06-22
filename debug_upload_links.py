#!/usr/bin/env python3
"""
Debug script to check FileUploadLink model and database
"""
import sys
import os

# Add the manager-francis/backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'manager-francis', 'backend'))

def debug_upload_links():
    try:
        # Try to import and check the model
        print("🔍 Checking FileUploadLink model...")
        from shared import db, FileUploadLink
        print(f"✅ FileUploadLink model imported successfully")
        print(f"Model class: {FileUploadLink}")
        print(f"Table name: {getattr(FileUploadLink, '__tablename__', 'Not defined')}")
        
        # Check model attributes
        print("\n📋 Model attributes:")
        for attr in dir(FileUploadLink):
            if not attr.startswith('_'):
                print(f"  - {attr}")
        
        # Try to query the database
        print("\n🗃️ Checking database...")
        try:
            # Initialize the app context
            from app import app
            with app.app_context():
                # Check if table exists by trying to query
                upload_links = db.session.query(FileUploadLink).limit(1).all()
                print(f"✅ FileUploadLink table exists and is accessible")
                print(f"Found {len(upload_links)} upload links")
                
                # Check table columns
                print("\n📊 Table columns:")
                inspector = db.inspect(db.engine)
                columns = inspector.get_columns('file_upload_links')
                for col in columns:
                    print(f"  - {col['name']}: {col['type']}")
                    
        except Exception as db_error:
            print(f"❌ Database error: {str(db_error)}")
            
            # Check if table exists at all
            try:
                inspector = db.inspect(db.engine)
                tables = inspector.get_table_names()
                print(f"\n📋 Available tables:")
                for table in tables:
                    print(f"  - {table}")
                    
                if 'file_upload_links' not in tables:
                    print("❌ file_upload_links table does not exist!")
                else:
                    print("✅ file_upload_links table exists")
                    
            except Exception as e:
                print(f"❌ Could not check tables: {str(e)}")
        
    except ImportError as e:
        print(f"❌ Import error: {str(e)}")
    except Exception as e:
        print(f"❌ General error: {str(e)}")

if __name__ == "__main__":
    debug_upload_links() 
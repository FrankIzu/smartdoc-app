#!/usr/bin/env python3

import os
import sys

# Add backend to path
sys.path.append('backend')

def test_imports_and_setup():
    """Test if we can import the required modules and create directories"""
    
    print("=== Testing Imports and Setup ===")
    
    try:
        print("1. Testing imports...")
        from backend.shared import db, File, User
        print("✅ Successfully imported db, File, User from shared")
        
        # Test werkzeug imports  
        from werkzeug.utils import secure_filename
        print("✅ Successfully imported secure_filename")
        
        print("\n2. Testing File model...")
        # Check if we can access File model attributes
        print(f"File table name: {File.__tablename__}")
        print(f"File columns: {[col.name for col in File.__table__.columns]}")
        
        print("\n3. Testing directory creation...")
        uploads_dir = "uploads"
        test_user_dir = os.path.join(uploads_dir, "1")
        
        print(f"Creating directory: {test_user_dir}")
        os.makedirs(test_user_dir, exist_ok=True)
        
        if os.path.exists(test_user_dir):
            print("✅ Successfully created uploads directory")
        else:
            print("❌ Failed to create uploads directory")
        
        print("\n4. Testing file creation...")
        test_file_path = os.path.join(test_user_dir, "test.txt")
        with open(test_file_path, 'w') as f:
            f.write("Test content")
        
        if os.path.exists(test_file_path):
            print("✅ Successfully created test file")
            # Clean up
            os.remove(test_file_path)
            print("✅ Successfully removed test file")
        else:
            print("❌ Failed to create test file")
        
        print("\n5. Testing database connection...")
        try:
            user_count = db.session.query(User).count()
            print(f"✅ Database connection works, found {user_count} users")
        except Exception as e:
            print(f"❌ Database connection failed: {e}")
        
        print("\n6. Testing File model creation...")
        try:
            # Don't actually commit, just test the model creation
            test_file = File(
                filename="test.txt",
                file_type="text",
                file_size=100,
                user_id=1,
                file_kind="test"
            )
            print("✅ File model creation works")
        except Exception as e:
            print(f"❌ File model creation failed: {e}")
            
    except ImportError as e:
        print(f"❌ Import error: {e}")
    except Exception as e:
        print(f"❌ General error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_imports_and_setup() 
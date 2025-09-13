#!/usr/bin/env python3

import os
import sys

# Add the manager-francis directory to Python path
manager_francis_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'manager-francis')
sys.path.insert(0, manager_francis_path)

from backend.app import app
from shared import db, File

def debug_file_529():
    with app.app_context():
        try:
            # Check if file exists in database
            file = db.session.query(File).filter_by(id=529).first()
            print(f"File 529 exists in DB: {file is not None}")
            
            if file:
                print(f"File 529 details:")
                print(f"  - ID: {file.id}")
                print(f"  - Path: {file.path}")
                print(f"  - Filename: {getattr(file, 'filename', 'N/A')}")
                print(f"  - Name: {getattr(file, 'name', 'N/A')}")
                print(f"  - User ID: {file.user_id}")
                print(f"  - Type: {getattr(file, 'type', 'N/A')}")
                
                # Check if physical file exists
                from backend.utils.app_utils import get_upload_folder
                upload_folder = get_upload_folder()
                file_path = os.path.join(upload_folder, file.path)
                print(f"  - Full file path: {file_path}")
                print(f"  - File exists on disk: {os.path.exists(file_path)}")
                
                if os.path.exists(file_path):
                    print(f"  - File size: {os.path.getsize(file_path)} bytes")
                else:
                    print("  - ERROR: Physical file does not exist!")
                    
                    # Check if upload folder exists
                    print(f"  - Upload folder exists: {os.path.exists(upload_folder)}")
                    if os.path.exists(upload_folder):
                        print(f"  - Upload folder contents: {os.listdir(upload_folder)}")
            else:
                print("File 529 not found in database!")
                
        except Exception as e:
            print(f"Error debugging file 529: {e}")
            import traceback
            traceback.print_exc()

if __name__ == "__main__":
    debug_file_529()

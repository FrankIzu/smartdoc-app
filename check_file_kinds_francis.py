#!/usr/bin/env python3

import sys
import os

# Add manager-francis backend to path
sys.path.append('manager-francis')
sys.path.append('manager-francis/backend')

def check_francis_file_kinds():
    """Check the exact file_kind values for francis user"""
    
    try:
        from shared import db, File, User
        from sqlalchemy import func
        
        print("=== Checking Francis File Kinds ===")
        
        # Find francis user
        francis = db.session.query(User).filter_by(username='francis').first()
        if not francis:
            print("Francis user not found!")
            return
            
        print(f"Francis User ID: {francis.id}")
        
        # Get all files for francis
        francis_files = db.session.query(File).filter_by(user_id=francis.id).all()
        print(f"Total files for francis: {len(francis_files)}")
        
        # Get unique file_kind values
        unique_kinds = db.session.query(File.file_kind).filter_by(user_id=francis.id).distinct().all()
        print(f"\nUnique file_kind values:")
        for kind in unique_kinds:
            count = db.session.query(File).filter_by(user_id=francis.id, file_kind=kind[0]).count()
            print(f"  '{kind[0]}': {count} files")
        
        # Test the filtering logic directly
        print(f"\nTesting filtering logic:")
        
        # Test documents filter
        documents = db.session.query(File).filter_by(user_id=francis.id).filter(File.file_kind.in_(['Document', 'document', 'documents'])).all()
        print(f"Documents filter (['Document', 'document', 'documents']): {len(documents)} files")
        
        # Test receipts filter  
        receipts = db.session.query(File).filter_by(user_id=francis.id).filter(File.file_kind.in_(['Receipt', 'receipt', 'receipts'])).all()
        print(f"Receipts filter (['Receipt', 'receipt', 'receipts']): {len(receipts)} files")
        
        # Test forms filter
        forms = db.session.query(File).filter_by(user_id=francis.id).filter(File.file_kind.in_(['Form', 'form', 'forms'])).all()
        print(f"Forms filter (['Form', 'form', 'forms']): {len(forms)} files")
        
        # Show some sample files
        print(f"\nSample files:")
        for i, file in enumerate(francis_files[:5]):
            print(f"  {i+1}. {file.filename} (kind: '{file.file_kind}', type: '{file.file_type}')")
            
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    check_francis_file_kinds() 
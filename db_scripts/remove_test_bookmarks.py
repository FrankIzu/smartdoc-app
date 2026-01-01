#!/usr/bin/env python3
"""
Remove the test bookmarks that were just added, keeping only original user data
"""

import sys
import os

# Add backend to path
sys.path.append('manager-francis/backend')

# Set up Flask app context
from app import app
from shared import db, Bookmark

def remove_test_bookmarks():
    """Remove the test bookmarks that were just added"""
    
    with app.app_context():
        try:
            # Names of test bookmarks to remove
            test_bookmark_names = [
                'Important Documents',
                'Financial Records', 
                'Project Files'
            ]
            
            removed_count = 0
            for name in test_bookmark_names:
                bookmark = db.session.query(Bookmark).filter_by(
                    user_id=2,
                    name=name,
                    is_active=True
                ).first()
                
                if bookmark:
                    db.session.delete(bookmark)
                    removed_count += 1
                    print(f"🗑️  Removed test bookmark: {name}")
                else:
                    print(f"⚠️  Test bookmark not found: {name}")
            
            if removed_count > 0:
                db.session.commit()
                print(f"\n✅ Successfully removed {removed_count} test bookmark(s)!")
            else:
                print("\n📝 No test bookmarks found to remove")
            
            # Show final count
            final_count = db.session.query(Bookmark).filter_by(user_id=2, is_active=True).count()
            print(f"📊 User now has {final_count} original bookmark(s)")
            
            # Show remaining bookmarks
            remaining = db.session.query(Bookmark).filter_by(user_id=2, is_active=True).all()
            if remaining:
                print(f"\n📚 Remaining bookmarks:")
                for bookmark in remaining:
                    file_count = bookmark.get_file_count() if hasattr(bookmark, 'get_file_count') else 0
                    print(f"  - {bookmark.name} ({file_count} files)")
            
            return True
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            db.session.rollback()
            return False

if __name__ == "__main__":
    success = remove_test_bookmarks()
    if success:
        print("\n✅ Test bookmarks cleanup completed successfully!")
    else:
        print("\n❌ Failed to cleanup test bookmarks!") 
#!/usr/bin/env python3
"""
Add test bookmarks for user 2 (francis)
"""

import sys
import os
from datetime import datetime

# Add backend to path
sys.path.append('manager-francis/backend')

# Set up Flask app context
from app import app
from shared import db, Bookmark, User, File, BookmarkFile

def add_test_bookmarks():
    """Add some test bookmarks for user 2"""
    
    with app.app_context():
        try:
            # Check if user 2 exists
            user = db.session.query(User).filter_by(id=2).first()
            if not user:
                print("❌ User with ID 2 not found!")
                return False
                
            print(f"✅ Found user: {user.username} (ID: {user.id})")
            
            # Check if user already has bookmarks
            existing_bookmarks = db.session.query(Bookmark).filter_by(user_id=2, is_active=True).count()
            print(f"📚 User currently has {existing_bookmarks} active bookmark(s)")
            
            # Create test bookmarks
            test_bookmarks = [
                {
                    'name': 'Important Documents',
                    'description': 'Collection of important personal and business documents',
                    'color': '#007AFF'
                },
                {
                    'name': 'Financial Records',
                    'description': 'Bank statements, receipts, and financial documents',
                    'color': '#34C759'
                },
                {
                    'name': 'Project Files',
                    'description': 'Documents related to current projects and proposals',
                    'color': '#FF9500'
                }
            ]
            
            created_count = 0
            for bookmark_data in test_bookmarks:
                # Check if bookmark with this name already exists
                existing = db.session.query(Bookmark).filter_by(
                    user_id=2, 
                    name=bookmark_data['name'],
                    is_active=True
                ).first()
                
                if existing:
                    print(f"⚠️  Bookmark '{bookmark_data['name']}' already exists")
                    continue
                
                # Create new bookmark
                bookmark = Bookmark(
                    user_id=2,
                    name=bookmark_data['name'],
                    description=bookmark_data['description'],
                    color=bookmark_data['color'],
                    is_active=True,
                    created_at=datetime.utcnow(),
                    updated_at=datetime.utcnow()
                )
                
                db.session.add(bookmark)
                created_count += 1
                print(f"✅ Created bookmark: {bookmark_data['name']}")
            
            if created_count > 0:
                db.session.commit()
                print(f"\n🎉 Successfully created {created_count} new bookmark(s)!")
            else:
                print("\n📝 No new bookmarks created (all already exist)")
            
            # Show final count
            final_count = db.session.query(Bookmark).filter_by(user_id=2, is_active=True).count()
            print(f"📊 User now has {final_count} total active bookmark(s)")
            
            return True
            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            db.session.rollback()
            return False

if __name__ == "__main__":
    success = add_test_bookmarks()
    if success:
        print("\n✅ Test bookmarks setup completed successfully!")
    else:
        print("\n❌ Failed to setup test bookmarks!") 
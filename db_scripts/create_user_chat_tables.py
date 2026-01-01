#!/usr/bin/env python3
"""
Script to create UserChat related database tables
This script creates the necessary tables for user-to-user chat functionality
"""

import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'manager-francis', 'backend'))

from model import init_models
from shared import db
from app import app
from sqlalchemy import text

def create_user_chat_tables():
    """Create UserChat related tables"""
    
    with app.app_context():
        # Initialize models to ensure they're registered
        models = init_models()
        
        # Check if tables already exist
        inspector = db.inspect(db.engine)
        existing_tables = inspector.get_table_names()
        
        tables_to_create = ['user_chats', 'user_chat_participants', 'user_chat_messages', 'user_chat_notifications']
        tables_needed = [table for table in tables_to_create if table not in existing_tables]
        
        if not tables_needed:
            print("✅ All UserChat tables already exist!")
            return
        
        print(f"📋 Need to create tables: {', '.join(tables_needed)}")
        
        try:
            # Create the tables
            db.create_all()
            print("✅ Successfully created UserChat tables!")
            
            # Verify tables were created
            inspector = db.inspect(db.engine)
            new_existing_tables = inspector.get_table_names()
            
            for table in tables_to_create:
                if table in new_existing_tables:
                    print(f"  ✓ {table}")
                else:
                    print(f"  ❌ {table} - FAILED")
                    
        except Exception as e:
            print(f"❌ Error creating tables: {str(e)}")
            raise

def create_sample_chat_data():
    """Create some sample chat data for testing"""
    
    with app.app_context():
        from shared import User, UserChat, UserChatParticipant, UserChatMessage
        
        try:
            # Find the francis user
            francis_user = db.session.query(User).filter_by(username='francis').first()
            if not francis_user:
                print("❌ Francis user not found - skipping sample data creation")
                return
            
            # Check if sample chat already exists
            existing_chat = db.session.query(UserChat).filter_by(created_by=francis_user.id).first()
            if existing_chat:
                print("✅ Sample chat data already exists!")
                return
            
            # Create a workspace chat for testing
            sample_chat = UserChat(
                type='workspace',
                name='General Discussion',
                created_by=francis_user.id,
                workspace_id=None,  # You can set this to a specific workspace ID if needed
                is_active=True
            )
            
            db.session.add(sample_chat)
            db.session.flush()  # Get the chat ID
            
            # Add francis as a participant
            participant = UserChatParticipant(
                chat_id=sample_chat.id,
                user_id=francis_user.id,
                is_active=True
            )
            
            db.session.add(participant)
            
            # Add a welcome message
            welcome_message = UserChatMessage(
                chat_id=sample_chat.id,
                sender_id=francis_user.id,
                content="Welcome to the chat! This is a test message.",
                message_type='text'
            )
            
            db.session.add(welcome_message)
            db.session.commit()
            
            print("✅ Created sample chat data!")
            print(f"  📝 Chat ID: {sample_chat.id}")
            print(f"  👤 Participant: {francis_user.username}")
            print(f"  💬 Messages: 1")
            
        except Exception as e:
            print(f"❌ Error creating sample data: {str(e)}")
            db.session.rollback()
            raise

if __name__ == "__main__":
    print("🚀 Creating UserChat database tables...")
    
    try:
        create_user_chat_tables()
        create_sample_chat_data()
        print("\n✅ UserChat setup completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Setup failed: {str(e)}")
        sys.exit(1) 
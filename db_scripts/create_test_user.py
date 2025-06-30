#!/usr/bin/env python3
"""
Script to create test user 'francis' with password 'password123'
"""

import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'manager-francis', 'backend'))

from model import init_models
from shared import db, User
from app import app
from werkzeug.security import generate_password_hash

def create_test_user():
    """Create test user 'francis' with password 'password123'"""
    
    with app.app_context():
        # Initialize models to ensure they're registered
        models = init_models()
        
        try:
            # Check if user already exists
            existing_user = db.session.query(User).filter_by(username='francis').first()
            if existing_user:
                print("✅ Test user 'francis' already exists!")
                return
            
            # Create test user
            test_user = User(
                username='francis',
                email='francis@example.com',
                password_hash=generate_password_hash('password123'),
                first_name='Francis',
                last_name='Test',
                is_active=True,
                is_admin=True
            )
            
            db.session.add(test_user)
            db.session.commit()
            
            print("✅ Created test user:")
            print(f"  👤 Username: {test_user.username}")
            print(f"  📧 Email: {test_user.email}")
            print(f"  🔑 Password: password123")
            
        except Exception as e:
            print(f"❌ Error creating test user: {str(e)}")
            db.session.rollback()
            raise

if __name__ == "__main__":
    print("🚀 Creating test user...")
    
    try:
        create_test_user()
        print("\n✅ Test user setup completed successfully!")
        
    except Exception as e:
        print(f"\n❌ Setup failed: {str(e)}")
        sys.exit(1) 
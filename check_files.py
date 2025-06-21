from flask import Flask
from shared import db, File, User
import os

# Create Flask app
app = Flask(__name__)

# Configure database
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv('DATABASE_URL', 'postgresql://manager_owner:npg_fHPvr8JoMOy7@ep-orange-star-a5tn5fzq.us-east-2.aws.neon.tech/manager?sslmode=require')
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

# Initialize database with app
db.init_app(app)

with app.app_context():
    print('🔍 Checking files in database...')
    
    # Find user francis
    user = db.session.query(User).filter_by(username='francis').first()
    if user:
        print(f'✅ Found user: {user.username} (ID: {user.id})')
        
        # Get recent files
        files = db.session.query(File).filter_by(user_id=user.id).order_by(File.created_at.desc()).limit(15).all()
        print(f'📄 Found {len(files)} recent files:')
        print()
        
        for i, file in enumerate(files, 1):
            print(f'{i}. ID: {file.id}')
            print(f'   Original filename: "{file.original_filename}"')
            print(f'   Stored filename: "{file.filename}"')
            print(f'   File type: {file.file_type}')
            print(f'   File kind: {file.file_kind}')
            print(f'   Created: {file.created_at}')
            print(f'   Size: {file.file_size} bytes')
            
            # Check if filename contains "assignment" or similar
            filename_lower = (file.original_filename or '').lower()
            if 'assign' in filename_lower or 'homework' in filename_lower or 'hw' in filename_lower:
                print(f'   🎯 POTENTIAL ASSIGNMENT FILE!')
            
            print('   ---')
            print()
            
        # Search for any files with "assign" in the name
        print('🔍 Searching specifically for assignment-related files...')
        assignment_files = db.session.query(File).filter(
            File.user_id == user.id,
            File.original_filename.ilike('%assign%')
        ).all()
        
        if assignment_files:
            print(f'📋 Found {len(assignment_files)} assignment files:')
            for file in assignment_files:
                print(f'   - {file.original_filename} (ID: {file.id})')
        else:
            print('❌ No files found with "assign" in the name')
            
        # Also search for any files with common assignment keywords
        keywords = ['homework', 'hw', 'cosc', 'syllabus', 'assignment', 'project']
        for keyword in keywords:
            keyword_files = db.session.query(File).filter(
                File.user_id == user.id,
                File.original_filename.ilike(f'%{keyword}%')
            ).all()
            
            if keyword_files:
                print(f'🔍 Files containing "{keyword}":')
                for file in keyword_files:
                    print(f'   - {file.original_filename} (ID: {file.id})')
                    
    else:
        print('❌ User francis not found') 
#!/usr/bin/env python3
"""
Direct test of the mobile upload links function
"""
import sys
import os

# Add the manager-francis/backend directory to the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'manager-francis', 'backend'))

def test_upload_links_direct():
    try:
        print("🔍 Setting up test environment...")
        
        from app import app
        from shared import db, FileUploadLink, File
        from sqlalchemy import desc
        import logging
        
        # Set up logging to see details
        logging.basicConfig(level=logging.DEBUG)
        logger = logging.getLogger(__name__)
        
        with app.app_context():
            print("✅ App context created")
            
            # Simulate the exact function logic
            print("🔧 Testing mobile_get_upload_links logic...")
            
            # Simulate session (user_id = 2 for francis)
            user_id = 2
            print(f"📝 Using user_id: {user_id}")
            
            # Get upload links for the user - exact query from endpoint
            print("🗃️ Executing query...")
            upload_links = db.session.query(FileUploadLink).filter_by(
                user_id=user_id
            ).order_by(desc(FileUploadLink.created_at)).all()
            
            print(f"✅ Query successful - Found {len(upload_links)} upload links")
            
            # Process each link - exact logic from endpoint
            links_data = []
            for i, link in enumerate(upload_links):
                print(f"🔄 Processing link {i+1}/{len(upload_links)} (ID: {link.id})")
                
                # Safely get upload count by querying files table directly
                upload_count = 0
                try:
                    upload_count = db.session.query(File).filter_by(upload_link_id=link.id).count()
                    print(f"  📊 Upload count: {upload_count}")
                except Exception as e:
                    print(f"  ⚠️ Could not get upload count: {str(e)}")
                    upload_count = 0
                
                # Build link data - exact logic from endpoint
                try:
                    link_data = {
                        'id': link.id,
                        'name': link.link_name or '',
                        'description': getattr(link, 'description', ''),
                        'token': link.link_token or '',
                        'is_active': getattr(link, 'is_active', True),
                        'expires_at': link.expires_at.isoformat() if link.expires_at else None,
                        'created_at': link.created_at.isoformat() if link.created_at else None,
                        'upload_count': upload_count,
                        'max_uploads': getattr(link, 'max_uploads', 0),
                        'url': f"http://localhost:5000/api/v1/mobile/upload-to/{link.link_token}"
                    }
                    links_data.append(link_data)
                    print(f"  ✅ Link data created successfully")
                    
                except Exception as e:
                    print(f"  ❌ Error creating link data: {str(e)}")
                    import traceback
                    traceback.print_exc()
                    break
            
            print(f"✅ Successfully processed {len(links_data)} links")
            
            # Create response data
            response_data = {
                'success': True,
                'platform': 'mobile',
                'upload_links': links_data,
                'count': len(links_data)
            }
            
            print(f"🎉 Response created successfully with {len(links_data)} links")
            print("📋 Sample links:")
            for link in links_data[:2]:  # Show first 2 links
                print(f"  - {link['name']} (ID: {link['id']}, Active: {link['is_active']})")
                
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test_upload_links_direct() 
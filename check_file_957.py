#!/usr/bin/env python3
"""
Check if file 957 exists in the database and verify related records
"""
import sys
import os

# Add manager-francis/backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'manager-francis', 'backend'))

from shared import db, File, VideoCall, CallRecording
from app import app

def check_file_957():
    with app.app_context():
        print("\n" + "="*80)
        print("CHECKING FILE 957 IN DATABASE")
        print("="*80 + "\n")
        
        # Check File table
        print("1. Checking File table for file_id=957...")
    file_957 = File.query.filter_by(id=957).first()
    if file_957:
        print(f"   ✅ File 957 EXISTS in File table")
        print(f"   - user_id: {file_957.user_id}")
        print(f"   - video_call_id: {file_957.video_call_id}")
        print(f"   - file_type: {getattr(file_957, 'file_type', 'N/A')}")
        print(f"   - file_kind: {getattr(file_957, 'file_kind', 'N/A')}")
        print(f"   - filename: {getattr(file_957, 'filename', 'N/A')}")
        print(f"   - original_filename: {getattr(file_957, 'original_filename', 'N/A')}")
        print(f"   - filepath: {getattr(file_957, 'filepath', 'N/A')}")
        
        if file_957.video_call_id:
            print(f"\n2. Checking VideoCall table for video_call_id={file_957.video_call_id}...")
            video_call = VideoCall.query.filter_by(id=file_957.video_call_id).first()
            if video_call:
                print(f"   ✅ VideoCall {file_957.video_call_id} EXISTS")
                print(f"   - creator_id: {video_call.creator_id}")
                print(f"   - meeting_id (HMS): {getattr(video_call, 'meeting_id', 'N/A')}")
                print(f"   - room_name: {getattr(video_call, 'room_name', 'N/A')}")
                print(f"   - meeting_subject: {getattr(video_call, 'meeting_subject', 'N/A')}")
            else:
                print(f"   ❌ VideoCall {file_957.video_call_id} NOT FOUND")
    else:
        print(f"   ❌ File 957 NOT FOUND in File table")
    
    # Check CallRecording table
    print(f"\n3. Checking CallRecording table for id=957...")
    call_recording_957 = CallRecording.query.filter_by(id=957).first()
    if call_recording_957:
        print(f"   ✅ CallRecording 957 EXISTS")
        print(f"   - video_call_id: {call_recording_957.video_call_id}")
        print(f"   - recording_id: {getattr(call_recording_957, 'recording_id', 'N/A')}")
        print(f"   - recording_url: {getattr(call_recording_957, 'recording_url', 'N/A')}")
        print(f"   - local_recording_path: {getattr(call_recording_957, 'local_recording_path', 'N/A')}")
        print(f"   - status: {getattr(call_recording_957, 'status', 'N/A')}")
        
        video_call = VideoCall.query.filter_by(id=call_recording_957.video_call_id).first()
        if video_call:
            print(f"\n4. VideoCall {call_recording_957.video_call_id} for CallRecording 957:")
            print(f"   - creator_id: {video_call.creator_id}")
            print(f"   - meeting_id (HMS): {getattr(video_call, 'meeting_id', 'N/A')}")
            print(f"   - room_name: {getattr(video_call, 'room_name', 'N/A')}")
    else:
        print(f"   ❌ CallRecording 957 NOT FOUND")
    
    # Search for recordings with URL containing /957/
    print(f"\n5. Searching for Files with filepath containing '/957/'...")
    files_with_957 = File.query.filter(File.filepath.contains('/957/')).all()
    if files_with_957:
        print(f"   ✅ Found {len(files_with_957)} file(s) with '/957/' in filepath:")
        for f in files_with_957[:5]:  # Show first 5
            print(f"   - File ID: {f.id}, video_call_id: {f.video_call_id}, filepath: {f.filepath[:100]}...")
    else:
        print(f"   ❌ No files found with '/957/' in filepath")
    
    # Search for the specific URL from the logs
    print(f"\n6. Searching for specific URL from logs...")
    url_pattern = "room_composite_693df865b8129df53db46b03_c023a1c0.webm"
    files_with_url = File.query.filter(File.filepath.contains(url_pattern)).all()
    if files_with_url:
        print(f"   ✅ Found {len(files_with_url)} file(s) with that filename:")
        for f in files_with_url:
            print(f"   - File ID: {f.id}, video_call_id: {f.video_call_id}")
            print(f"     filepath: {f.filepath}")
    else:
        print(f"   ❌ No files found with that filename")
    
    # Check meeting ID from logs (85506248)
    print(f"\n7. Checking meeting_id='85506248' (HMS ID from logs)...")
    video_call_by_meeting_id = VideoCall.query.filter_by(meeting_id='85506248').first()
    if video_call_by_meeting_id:
        print(f"   ✅ VideoCall with meeting_id='85506248' EXISTS")
        print(f"   - VideoCall.id (database ID): {video_call_by_meeting_id.id}")
        print(f"   - creator_id: {video_call_by_meeting_id.creator_id}")
        print(f"   - room_name: {getattr(video_call_by_meeting_id, 'room_name', 'N/A')}")
        
        # Check files for this video_call
        files_for_meeting = File.query.filter_by(video_call_id=video_call_by_meeting_id.id).all()
        print(f"\n   Files for VideoCall {video_call_by_meeting_id.id}:")
        if files_for_meeting:
            for f in files_for_meeting[:10]:  # Show first 10
                print(f"   - File ID: {f.id}, file_type: {getattr(f, 'file_type', 'N/A')}, filepath: {getattr(f, 'filepath', 'N/A')[:80]}...")
        else:
            print(f"   ❌ No files found for this meeting")
        
        # Check CallRecordings for this video_call
        recordings_for_meeting = CallRecording.query.filter_by(video_call_id=video_call_by_meeting_id.id).all()
        print(f"\n   CallRecordings for VideoCall {video_call_by_meeting_id.id}:")
        if recordings_for_meeting:
            for r in recordings_for_meeting:
                print(f"   - CallRecording ID: {r.id}, recording_id: {getattr(r, 'recording_id', 'N/A')}")
                print(f"     recording_url: {getattr(r, 'recording_url', 'N/A')[:80]}...")
        else:
            print(f"   ❌ No CallRecordings found for this meeting")
    else:
        print(f"   ❌ VideoCall with meeting_id='85506248' NOT FOUND")
    
    print("\n" + "="*80)
    print("DONE")
    print("="*80 + "\n")

if __name__ == '__main__':
    check_file_957()


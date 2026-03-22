#!/usr/bin/env python3
"""
Add last_message_preview column to chat_history table.
Used for lightweight chat list - avoids loading full conversation_data.
Backfills existing rows from conversation_data.
"""

import os
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'manager-francis', 'backend'))

from shared import db, ChatHistory
from app import app
from sqlalchemy import text


def add_last_message_preview_column():
    """Add last_message_preview column if it doesn't exist."""
    with app.app_context():
        inspector = db.inspect(db.engine)
        columns = [c['name'] for c in inspector.get_columns('chat_history')]
        if 'last_message_preview' in columns:
            print("✅ last_message_preview column already exists")
            return
        try:
            db.session.execute(text(
                "ALTER TABLE chat_history ADD COLUMN last_message_preview VARCHAR(255) NULL"
            ))
            db.session.commit()
            print("✅ Added last_message_preview column to chat_history")
        except Exception as e:
            db.session.rollback()
            print(f"❌ Error: {e}")
            raise


def backfill_last_message_preview():
    """Backfill last_message_preview for existing rows from conversation_data."""
    with app.app_context():
        rows = db.session.query(ChatHistory).filter(
            ChatHistory.last_message_preview.is_(None),
            ChatHistory.conversation_data.isnot(None)
        ).all()
        updated = 0
        for row in rows:
            if row.conversation_data:
                preview = ChatHistory.extract_last_message_preview(row.conversation_data)
                if preview:
                    row.last_message_preview = preview
                    updated += 1
        if updated:
            db.session.commit()
            print(f"✅ Backfilled last_message_preview for {updated} rows")
        else:
            print("✅ No rows needed backfill")


if __name__ == "__main__":
    print("🚀 Adding last_message_preview column to chat_history...")
    try:
        add_last_message_preview_column()
        print("🔄 Backfilling existing rows...")
        backfill_last_message_preview()
        print("\n✅ Migration completed successfully!")
    except Exception as e:
        print(f"\n❌ Migration failed: {e}")
        sys.exit(1)

#!/usr/bin/env python3
"""Create secure_message_invites table if missing."""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'manager-francis', 'backend'))

from sqlalchemy import text


def main():
    from app import app
    from shared import db
    from model import init_models

    with app.app_context():
        init_models()
        inspector = db.inspect(db.engine)
        if 'secure_message_invites' in inspector.get_table_names():
            print('secure_message_invites already exists')
            return
        db.create_all()
        # Ensure indexes exist
        try:
            db.session.execute(text(
                'CREATE INDEX IF NOT EXISTS ix_smi_inviter_email_status '
                'ON secure_message_invites (inviter_user_id, invitee_email, status)'
            ))
            db.session.execute(text(
                'CREATE INDEX IF NOT EXISTS ix_smi_inviter_phone_status '
                'ON secure_message_invites (inviter_user_id, invitee_phone, status)'
            ))
            db.session.commit()
        except Exception as e:
            print('index note:', e)
            db.session.rollback()
        print('Created secure_message_invites')


if __name__ == '__main__':
    main()

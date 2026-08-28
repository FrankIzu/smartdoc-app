-- Secure Messaging invites (email/SMS deep links; token stored as SHA-256 hash only).
-- Canonical copy lives in manager-francis/db_scripts/20260828_secure_message_invites.sql
-- Safe / idempotent: CREATE TABLE IF NOT EXISTS + IF NOT EXISTS indexes.

CREATE TABLE IF NOT EXISTS secure_message_invites (
    id SERIAL PRIMARY KEY,
    company_id INTEGER NOT NULL DEFAULT 0 REFERENCES companies(id),
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    inviter_user_id INTEGER NOT NULL REFERENCES users(id),
    chat_id INTEGER NOT NULL REFERENCES user_chats(id),
    invitee_email VARCHAR(255) NULL,
    invitee_phone VARCHAR(32) NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending | accepted | expired | revoked
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP NULL,
    accepted_user_id INTEGER NULL REFERENCES users(id),
    revoked_at TIMESTAMP NULL,
    sms_sent_at TIMESTAMP NULL,
    email_sent_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
    updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
);

COMMENT ON TABLE secure_message_invites IS
    'Secure Messaging invite lifecycle; raw token never stored (SHA-256 hash only).';

COMMENT ON COLUMN secure_message_invites.token_hash IS
    'SHA-256 hex digest of invite token (≥128-bit CSPRNG at issuance).';

COMMENT ON COLUMN secure_message_invites.status IS
    'pending until accept/revoke/expire; accepted chats become normal user chats.';

CREATE INDEX IF NOT EXISTS ix_secure_message_invites_company_id
    ON secure_message_invites (company_id);

CREATE INDEX IF NOT EXISTS ix_secure_message_invites_token_hash
    ON secure_message_invites (token_hash);

CREATE INDEX IF NOT EXISTS ix_secure_message_invites_inviter_user_id
    ON secure_message_invites (inviter_user_id);

CREATE INDEX IF NOT EXISTS ix_secure_message_invites_chat_id
    ON secure_message_invites (chat_id);

CREATE INDEX IF NOT EXISTS ix_secure_message_invites_invitee_email
    ON secure_message_invites (invitee_email);

CREATE INDEX IF NOT EXISTS ix_secure_message_invites_invitee_phone
    ON secure_message_invites (invitee_phone);

CREATE INDEX IF NOT EXISTS ix_secure_message_invites_status
    ON secure_message_invites (status);

CREATE INDEX IF NOT EXISTS ix_smi_inviter_email_status
    ON secure_message_invites (inviter_user_id, invitee_email, status);

CREATE INDEX IF NOT EXISTS ix_smi_inviter_phone_status
    ON secure_message_invites (inviter_user_id, invitee_phone, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_smi_pending_inviter_email
    ON secure_message_invites (inviter_user_id, invitee_email)
    WHERE status = 'pending' AND invitee_email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_smi_pending_inviter_phone
    ON secure_message_invites (inviter_user_id, invitee_phone)
    WHERE status = 'pending' AND invitee_phone IS NOT NULL;

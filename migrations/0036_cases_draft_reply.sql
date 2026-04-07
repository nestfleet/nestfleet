-- DEFERRED-24: Store AI draft reply on the case so the Lead can view, edit, and send it
-- when auto-send gates fail (awaiting-lead status).
ALTER TABLE cases ADD COLUMN IF NOT EXISTS draft_reply TEXT;
ALTER TABLE cases ADD COLUMN IF NOT EXISTS draft_metadata JSONB;

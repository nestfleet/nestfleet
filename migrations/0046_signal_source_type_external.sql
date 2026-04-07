-- FEAT-003: Add 'external' and 'bridge_event' to check constraints.
-- 'bridge_event' was added to the Zod schema in BEF-11 but the DB constraint was never updated.
-- Adding both here to keep code and DB in sync.

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_type_check;
ALTER TABLE signals ADD CONSTRAINT signals_source_type_check
  CHECK (source_type IN (
    'email', 'telegram', 'github_webhook', 'scheduled', 'manual',
    'contact_form', 'chat', 'bridge_event', 'external'
  ));

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('email', 'telegram', 'internal', 'chat', 'external'));

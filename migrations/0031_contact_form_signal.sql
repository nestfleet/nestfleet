-- DEFERRED-13: Add 'contact_form' as a valid signal source type.
-- Conversation channel stays 'email' — the signal source_type is the canonical origin marker.

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_type_check;
ALTER TABLE signals ADD CONSTRAINT signals_source_type_check
  CHECK (source_type IN ('email', 'telegram', 'github_webhook', 'scheduled', 'manual', 'contact_form'));

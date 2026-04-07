-- DEFERRED-05: Add 'chat' as a valid conversation channel and signal source type.
--
-- The chat widget creates conversations with channel='chat' and signals with
-- source_type='chat'. Both CHECK constraints need extending.

ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_channel_check;
ALTER TABLE conversations ADD CONSTRAINT conversations_channel_check
  CHECK (channel IN ('email', 'telegram', 'internal', 'chat'));

ALTER TABLE signals DROP CONSTRAINT IF EXISTS signals_source_type_check;
ALTER TABLE signals ADD CONSTRAINT signals_source_type_check
  CHECK (source_type IN ('email', 'telegram', 'github_webhook', 'scheduled', 'manual', 'contact_form', 'chat'));

-- Index for fast SSE session lookup: find conversation by thread_key prefix 'chat:{productId}:{sessionId}'.
-- The existing conversations_dedup_idx already covers (product_id, channel, thread_key).
-- Add a partial index scoped to chat for frequent lookups by sessionId alone.
CREATE INDEX IF NOT EXISTS conversations_chat_thread_idx
  ON conversations (product_id, thread_key)
  WHERE channel = 'chat';

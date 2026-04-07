-- FEAT-003: Add channel_thread_id to signals for cross-channel thread dedup.
-- Non-null only for channels that have a native thread concept (email In-Reply-To,
-- external webhook threadId, etc.).  Indexed only for non-null rows.

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS channel_thread_id text;

CREATE INDEX IF NOT EXISTS idx_signals_channel_thread_id
  ON signals (product_id, channel_thread_id)
  WHERE channel_thread_id IS NOT NULL;

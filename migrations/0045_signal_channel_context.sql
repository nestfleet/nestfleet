-- FEAT-003: Add channel_context jsonb to signals.
-- Stores arbitrary channel-specific metadata for external webhook signals
-- (e.g. Telegram chat_id, Discord guild_id, or any caller-supplied context).
-- Nullable — only populated by the external webhook ingress.

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS channel_context jsonb;

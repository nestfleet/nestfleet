-- SLICE-26: Add 'slack' as a valid notification channel.
--
-- The existing CHECK constraint on notifications.channel only allows
-- 'email' and 'telegram'. We drop and recreate it to include 'slack'.

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_channel_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_channel_check
    CHECK (channel IN ('email', 'telegram', 'slack'));

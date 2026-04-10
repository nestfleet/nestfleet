-- FEAT-014: Add notification_preferences column to products
-- Rollback: ALTER TABLE products DROP COLUMN IF EXISTS notification_preferences;
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS notification_preferences JSONB NOT NULL DEFAULT '{}';

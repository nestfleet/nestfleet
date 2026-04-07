-- SLICE-09: Notification escalation level tracking
-- Adds escalation_level to track how many escalation steps have fired.
-- Note: ack_required, ack_deadline, acked_at, acked_by already exist from 0010_notifications.sql.

ALTER TABLE notifications
  ADD COLUMN IF NOT EXISTS escalation_level INTEGER NOT NULL DEFAULT 0;

-- Partial index for the escalation runner — only unacked, ack-required rows matter.
CREATE INDEX IF NOT EXISTS notifications_escalation_overdue_idx
  ON notifications (product_id, ack_deadline)
  WHERE ack_required = true AND acked_at IS NULL;

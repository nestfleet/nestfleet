-- SLICE-07: Notification Control Plane
-- Stores all notification events with dedup, scheduling, and ack tracking.

CREATE TABLE IF NOT EXISTS notifications (
  notification_id TEXT PRIMARY KEY,
  product_id      TEXT NOT NULL,
  kind            TEXT NOT NULL
    CHECK (kind IN ('approval_request','escalation_alert','reminder','digest_summary',
                    'pr_ready','stale_case_alert','stale_change_alert',
                    'user_follow_up','clarification_request','resolution_message','status_update')),
  priority        TEXT NOT NULL
    CHECK (priority IN ('critical','high','normal','low')),
  audience_type   TEXT NOT NULL
    CHECK (audience_type IN ('operator','support_lead','product_lead','change_lead','knowledge_lead','end_user')),
  channel         TEXT NOT NULL DEFAULT 'email'
    CHECK (channel IN ('email','telegram')),
  recipient_ref   TEXT NOT NULL,  -- email address or telegram chat_id
  source_type     TEXT NOT NULL,  -- 'case','change_request','system'
  source_ref      TEXT NOT NULL,  -- entity ID
  correlation_id  TEXT,           -- groups related notifications
  subject         TEXT,
  body            TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','scheduled','sent','suppressed','failed','acked')),
  scheduled_for   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at         TIMESTAMPTZ,
  ack_required    BOOLEAN NOT NULL DEFAULT FALSE,
  ack_deadline    TIMESTAMPTZ,
  acked_at        TIMESTAMPTZ,
  acked_by        TEXT,
  retry_count     INTEGER NOT NULL DEFAULT 0,
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TRIGGER set_notifications_updated_at
  BEFORE UPDATE ON notifications
  FOR EACH ROW EXECUTE FUNCTION nestfleet_set_updated_at();

-- Dedup index: prevents duplicate notifications for same event
CREATE UNIQUE INDEX IF NOT EXISTS notifications_dedup_idx
  ON notifications (product_id, kind, source_type, source_ref, priority)
  WHERE status NOT IN ('suppressed', 'failed');

CREATE INDEX IF NOT EXISTS notifications_pending_idx
  ON notifications (product_id, status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS notifications_product_idx
  ON notifications (product_id, created_at DESC);

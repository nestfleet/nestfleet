CREATE TABLE IF NOT EXISTS telemetry_pings (
  id          text PRIMARY KEY DEFAULT gen_random_uuid()::text,
  instance_id text        NOT NULL,
  version     text        NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  payload     jsonb       NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_telemetry_pings_instance_reported
  ON telemetry_pings (instance_id, reported_at DESC);

CREATE INDEX IF NOT EXISTS idx_telemetry_pings_reported_at
  ON telemetry_pings (reported_at DESC);

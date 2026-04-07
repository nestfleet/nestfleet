-- BIL-02: Outcome Unit usage ledger.
--
-- One row per qualifying OU event (case resolved, CR completed).
-- The month column (YYYY-MM) enables monthly rollup queries without
-- a full table scan.  entity_ref + event_type form a natural dedup key
-- so duplicate webhook deliveries cannot double-count.

CREATE TABLE IF NOT EXISTS outcome_unit_usage (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    product_id  TEXT        NOT NULL,
    event_type  TEXT        NOT NULL,   -- 'case.resolved' | 'cr.completed'
    entity_ref  TEXT        NOT NULL,   -- caseId or crId
    month       TEXT        NOT NULL,   -- YYYY-MM (derived from counted_at)
    counted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

    UNIQUE (event_type, entity_ref)     -- idempotent: same event counts once
);

CREATE INDEX IF NOT EXISTS idx_ouu_month ON outcome_unit_usage (month);

-- SLICE-14D: Store original normalized signal text on case record.
-- SA Review #7 fix: workers read signal text from cases.signal_text
-- instead of reconstructing from downstream artifacts.

ALTER TABLE cases ADD COLUMN IF NOT EXISTS signal_text TEXT;

COMMENT ON COLUMN cases.signal_text IS 'Original normalized signal body stored at ingestion — authoritative source for workers';

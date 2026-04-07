-- 0039_cr_track.sql
-- Add cr_track to change_requests to distinguish customer-reported CRs from
-- infrastructure-debt CRs auto-created by the Steward side-car path (SS-03).
--
-- customer_reported: primary CR created when a bug_report has no known-issue match.
-- infra_debt:        side-car CR created when a bug_report auto-resolves (known-issue
--                    match) but triage labels contain infra/performance signals.
--
-- Default is 'customer_reported' so all existing rows are unaffected.

ALTER TABLE change_requests
  ADD COLUMN cr_track TEXT NOT NULL DEFAULT 'customer_reported'
    CHECK (cr_track IN ('customer_reported', 'infra_debt'));

COMMENT ON COLUMN change_requests.cr_track IS
  'Origin track: customer_reported (primary CR from unmatched bug) | infra_debt (steward side-car from auto-resolved bug with infra signals)';

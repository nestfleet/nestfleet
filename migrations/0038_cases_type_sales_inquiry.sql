-- 0038_cases_type_sales_inquiry.sql
-- Extend cases.type CHECK constraint to include 'sales_inquiry'.
--
-- The original inline CHECK in 0007_domain_model.sql was auto-named by
-- PostgreSQL. We look it up by content to drop it safely, then re-add
-- with a deterministic name that includes the new value.

DO $$
DECLARE
  v_constraint TEXT;
BEGIN
  SELECT conname INTO v_constraint
  FROM   pg_constraint
  WHERE  conrelid = 'cases'::regclass
    AND  contype  = 'c'
    AND  pg_get_constraintdef(oid) LIKE '%user_request%';

  IF v_constraint IS NOT NULL THEN
    EXECUTE 'ALTER TABLE cases DROP CONSTRAINT ' || quote_ident(v_constraint);
  END IF;
END;
$$;

ALTER TABLE cases
  ADD CONSTRAINT cases_type_check
  CHECK (type IN ('user_request', 'bug_report', 'outage_report', 'user_feedback', 'sales_inquiry'));

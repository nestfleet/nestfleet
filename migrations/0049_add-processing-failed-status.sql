-- Migration: 0020_add-processing-failed-status
-- Feature: QE-05 — Dead-letter case recovery
--
-- When a pg-boss job exhausts all retries and is dead-lettered, the DLQ
-- handler marks the associated case with status "processing-failed" so
-- operators see a visible failure rather than a silently-stuck case.
--
-- Changes:
--   1. Add "processing-failed" to the cases.status CHECK constraint.
--   2. Add processing_error JSONB column to cases for storing failure context
--      (jobName, jobId, error message written by the DLQ handler).
--
-- Rollback:
--   1. Remove "processing-failed" from the CHECK constraint (after migrating
--      any rows in that state to a safe status, e.g. "closed").
--   2. DROP COLUMN processing_error;
--
-- NOTE: The constraint name "cases_status_check" is the PostgreSQL
-- auto-generated name for an inline CHECK on the status column. If your
-- database uses a different name, adjust accordingly.

-- Step 1: Replace the status CHECK constraint to include "processing-failed".
ALTER TABLE cases
  DROP CONSTRAINT IF EXISTS cases_status_check;

ALTER TABLE cases
  ADD CONSTRAINT cases_status_check CHECK (status IN (
    'new',
    'enriching',
    'triaged',
    'awaiting-user',
    'awaiting-lead',
    'in-resolution',
    'in-change',
    'pr-drafting',
    'resolved',
    'closed',
    'processing-failed'
  ));

-- Step 2: Add processing_error column for DLQ failure context.
-- Stores: { "jobName": "...", "jobId": "...", "error": "..." }
-- Null when the case is not in processing-failed state.
ALTER TABLE cases
  ADD COLUMN IF NOT EXISTS processing_error JSONB DEFAULT NULL;

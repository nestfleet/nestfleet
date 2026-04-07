-- Fix hetzner_server_id type: bigint → integer.
-- Hetzner server IDs are in the ~50 million range (well within int4 max 2.1B).
-- postgres.js returns bigint as string, integer as JS number — keeping the
-- ProvisioningRow type accurate without manual coercion in the repository.

ALTER TABLE provisionings
  ALTER COLUMN hetzner_server_id TYPE integer;

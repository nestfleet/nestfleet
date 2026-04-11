-- FEAT-017-G: Reactivation window for cancelled subscriptions.
-- Set to now() + 7 days at cancellation. If the customer re-subscribes before
-- this deadline, the provisioning is reactivated without re-provisioning.
-- After the deadline, normal deprovisioning proceeds.

ALTER TABLE provisionings
  ADD COLUMN IF NOT EXISTS reactivation_deadline TIMESTAMPTZ;

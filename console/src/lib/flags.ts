/**
 * Feature flags — compile-time constants.
 *
 * WAITLIST_MODE: set to false once:
 *   - Legal entity is registered
 *   - Stripe live keys are active (ORGA-01-S9)
 *   - FEAT-017 customer subscription lifecycle is live
 *   - FEAT-018 operator key gate is deployed
 *
 * To disable waitlist mode: set WAITLIST_MODE = false and redeploy.
 */
export const WAITLIST_MODE = true;

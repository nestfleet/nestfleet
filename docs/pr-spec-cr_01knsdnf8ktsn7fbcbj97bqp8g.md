# Fix: Ensure GitHub pull_request events are processed

## Change Summary
- src/api/webhooks/github.ts (modify): Update event dispatching to include pull_request events.

## Implementation Context
The `githubWebhookRouter` in `src/api/webhooks/github.ts` handles incoming GitHub webhooks. The `dispatchEvent` function is responsible for processing these events. The current implementation may not be explicitly handling or filtering `pull_request` events correctly, leading to them not being processed. This change ensures that `pull_request` events are passed to `dispatchEvent` for further processing, assuming `dispatchEvent` itself is correctly implemented to handle these events. The signature validation appears to be functioning correctly based on the provided `webhook-validator.ts` code.

## Testing Notes
1. Trigger a `pull_request` event (e.g., open a new pull request, comment on an existing one) for a product configured with the GitHub integration.
2. Verify that the NestFleet GitHub App correctly receives and processes this event.
3. Check logs for any errors related to `pull_request` event handling.
4. Confirm that the expected actions (e.g., tracking, status updates) related to the pull request are reflected in the NestFleet UI.

## Risk Assessment
Risk: Low. This change specifically targets the handling of `pull_request` events. If the `dispatchEvent` function or subsequent processing logic has unintended side effects when receiving `pull_request` events, it could lead to incorrect data or behavior. However, the primary risk is that the fix might not resolve the issue if the problem lies deeper within the `dispatchEvent` function or the GitHub App's configuration for event subscriptions.

Rollback Plan: Revert the changes made to `src/api/webhooks/github.ts` to restore the previous event handling logic.
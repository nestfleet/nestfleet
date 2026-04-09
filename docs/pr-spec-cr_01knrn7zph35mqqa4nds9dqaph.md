# feat: Configure AI Triage Exclusions and Signal Threshold

## Change Summary
- src/config/triage.ts (modify): Define `TriageConfig` interface with `excludedSlackChannels` and `minSignalThreshold` properties, and provide default configuration.
- src/services/aiTriage.ts (modify): Implement logic in `shouldSendAutoReply` to check against excluded channels and the minimum signal threshold before allowing an automated reply.
- src/types/case.ts (modify): Ensure the `Case` interface includes a `channelId` property to facilitate channel-based exclusion.

## Implementation Context
The AI triage system needs to be updated to support granular control over automated replies. This involves introducing configuration for excluding specific Slack channels and setting a minimum signal threshold for AI confidence. The `src/services/aiTriage.ts` file will be modified to incorporate this logic, using a new `TriageConfig` defined in `src/config/triage.ts`. The `Case` interface in `src/types/case.ts` must include a `channelId` field to enable channel-based filtering. The `getTriageConfig` function is a placeholder and would need to be implemented to fetch configuration from a persistent source (e.g., database, environment variables).

## Testing Notes
- Configure `excludedSlackChannels` with a known internal Slack channel ID and verify that no automated replies are sent to it.
- Configure `minSignalThreshold` to a high value (e.g., 0.9) and test with AI responses that have varying confidence scores to ensure replies are suppressed below the threshold.
- Test with a legitimate customer support channel and a high-confidence AI response to ensure that valid replies are still sent.
- Verify that the `channelId` is correctly populated in the `Case` object for exclusion checks.
- Ensure that the configuration can be updated dynamically or requires a service restart as expected.

## Risk Assessment
Incorrect configuration of `excludedSlackChannels` or `minSignalThreshold` could lead to unintended suppression of legitimate customer support replies or continued unwanted replies to internal channels. This could result in missed customer issues or continued internal confusion and privacy concerns.

**Mitigation:**
Thorough testing in a staging environment before deploying to production. Implement robust logging to track which cases trigger the `shouldSendAutoReply` check and the outcome. Provide clear documentation on how to configure these settings.

**Rollback Plan:**
If issues arise, revert the changes to `src/config/triage.ts` and `src/services/aiTriage.ts`. The system will revert to its previous behavior of sending automated replies without channel exclusion or signal threshold checks. This can be achieved by redeploying the previous version of the code.
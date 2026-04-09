import { TriageConfig, defaultTriageConfig } from '../config/triage';
import { Case } from '../types/case';

// Assume getTriageConfig() fetches the current configuration
// This might involve reading from a database, environment variables, or a config service.
async function getTriageConfig(): Promise<TriageConfig> {
  // Placeholder for actual config retrieval logic
  // In a real scenario, this would fetch from a persistent store or env vars.
  return Promise.resolve(defaultTriageConfig);
}

/**
 * Determines if an automated reply should be sent for a given case.
 * @param caseData The case data.
 * @param aiConfidenceScore The confidence score from the AI model.
 * @returns True if an automated reply should be sent, false otherwise.
 */
export async function shouldSendAutoReply(caseData: Case, aiConfidenceScore: number): Promise<boolean> {
  const config = await getTriageConfig();

  // 1. Check if the channel is excluded
  if (config.excludedSlackChannels && config.excludedSlackChannels.includes(caseData.channelId)) {
    return false;
  }

  // 2. Check if the signal threshold is met
  if (typeof config.minSignalThreshold === 'number' && aiConfidenceScore < config.minSignalThreshold) {
    return false;
  }

  // If not excluded and threshold is met, allow auto-reply
  return true;
}

// Example of how this function might be used within a larger triage process:
/*
async function processCaseForAutoReply(caseData: Case, aiResult: { confidence: number, response: string }) {
  const canSendReply = await shouldSendAutoReply(caseData, aiResult.confidence);

  if (canSendReply) {
    // Proceed with sending the automated reply
    console.log(`Sending automated reply for case ${caseData.id} to channel ${caseData.channelId}`);
    // ... send reply logic ...
  } else {
    console.log(`Skipping automated reply for case ${caseData.id} due to configuration.`);
  }
}
*/

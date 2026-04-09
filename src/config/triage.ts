/**
 * Configuration for the AI triage system.
 */
export interface TriageConfig {
  /**
   * List of Slack channel IDs to exclude from automated AI triage replies.
   * If this list is empty, no channels are explicitly excluded.
   */
  excludedSlackChannels?: string[];

  /**
   * The minimum confidence score required for the AI to send an automated reply.
   * Values should be between 0 and 1. If not set, a default threshold will be used.
   */
  minSignalThreshold?: number;
}

// Example default configuration (can be loaded from environment variables or a config file)
export const defaultTriageConfig: TriageConfig = {
  excludedSlackChannels: [],
  minSignalThreshold: 0.7, // Default to 70% confidence
};

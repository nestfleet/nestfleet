/**
 * Represents a case within the system.
 */
export interface Case {
  id: string;
  title: string;
  description: string;
  status: string; // e.g., 'open', 'closed', 'awaiting_user'
  priority: 'low' | 'normal' | 'high' | 'critical';
  createdAt: Date;
  updatedAt: Date;
  channelId: string; // Identifier for the communication channel (e.g., Slack channel ID)
  // ... other case properties
}

-- SLICE-11: Product-level settings for LLM provider, agent behavior, and notification policy.
-- Stored as JSONB columns on products — avoids a separate settings table.

ALTER TABLE products ADD COLUMN IF NOT EXISTS llm_config JSONB NOT NULL DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS agent_config JSONB NOT NULL DEFAULT '{}';

COMMENT ON COLUMN products.llm_config IS 'LLM provider config: { provider, model, apiKeyEncrypted, apiKeyLast4 }';
COMMENT ON COLUMN products.agent_config IS 'Agent behavior config: { tone, quietHoursStart, quietHoursEnd, weekendSuppression }';

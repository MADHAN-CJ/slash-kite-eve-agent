import { defineAgent } from 'eve';
import { anthropic } from '@ai-sdk/anthropic';

/**
 * Model: `claude-sonnet-5` by default; AGENT_MODEL switches it (e.g. an Opus
 * model). Direct LanguageModels carry no gateway catalog metadata, so eve's
 * compaction needs the context window stated explicitly.
 */
const MODEL = process.env.AGENT_MODEL?.trim() || 'claude-sonnet-5';
const CONTEXT_WINDOW: Record<string, number> = {
  'claude-sonnet-5': 1_000_000,
  'claude-opus-5-5': 1_000_000,
  'claude-opus-5': 200_000,
  'claude-haiku-5-5': 200_000,
  'claude-haiku-4-5': 200_000,
};

export default defineAgent({
  // Direct provider (uses ANTHROPIC_API_KEY; no AI Gateway credential needed).
  model: anthropic(MODEL),
  modelContextWindowTokens: CONTEXT_WINDOW[MODEL] ?? 200_000,
});

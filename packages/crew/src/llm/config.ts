// Which model the worker uses, from its environment. Bedrock or the Claude API when asked for; otherwise
// none, and the agents say a model is needed rather than inventing answers.
import { DEFAULT_LLM_TOKEN_BUDGET } from '@afterlife/db';
import { ANTHROPIC_EFFORTS, AnthropicLlmClient, type AnthropicEffort } from './anthropic';
import { BedrockLlmClient } from './bedrock';
import type { LlmClient } from './types';

/** Tokens (input plus output) one project may use, unless LLM_TOKEN_BUDGET says otherwise. */
export const DEFAULT_TOKEN_BUDGET = DEFAULT_LLM_TOKEN_BUDGET;

export type LlmEnv = {
  LLM_PROVIDER?: string;
  BEDROCK_MODEL_ID?: string;
  AWS_REGION?: string;
  /** Read by the Anthropic SDK itself; only checked here to say it is missing. */
  ANTHROPIC_API_KEY?: string;
  ANTHROPIC_MODEL_ID?: string;
  /** How hard Claude thinks: low (the default), medium, high, xhigh, max, or none. */
  ANTHROPIC_EFFORT?: string;
  LLM_TOKEN_BUDGET?: string;
};

/** ANTHROPIC_EFFORT: undefined for the client's default, null for `none` (the model's own). */
export function anthropicEffortFrom(env: LlmEnv): AnthropicEffort | null | undefined {
  const raw = env.ANTHROPIC_EFFORT?.trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'none') return null;
  if ((ANTHROPIC_EFFORTS as readonly string[]).includes(raw)) return raw as AnthropicEffort;
  throw new Error(
    `ANTHROPIC_EFFORT must be low, medium, high, xhigh, max or none, not "${env.ANTHROPIC_EFFORT}"`,
  );
}

export function tokenBudgetFrom(env: LlmEnv): number {
  const raw = env.LLM_TOKEN_BUDGET?.trim();
  if (!raw) return DEFAULT_TOKEN_BUDGET;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0)
    throw new Error(`LLM_TOKEN_BUDGET must be a whole number of tokens, not "${raw}"`);
  return n;
}

/** The configured model client, or null when there is none (LLM_PROVIDER unset or `none`). */
export function llmClientFrom(env: LlmEnv): LlmClient | null {
  const provider = (env.LLM_PROVIDER ?? 'none').trim().toLowerCase();
  if (provider === 'none' || provider === '') return null;
  if (provider === 'bedrock')
    return new BedrockLlmClient({
      ...(env.BEDROCK_MODEL_ID ? { model: env.BEDROCK_MODEL_ID } : {}),
      ...(env.AWS_REGION ? { region: env.AWS_REGION } : {}),
    });
  if (provider === 'anthropic') {
    if (!env.ANTHROPIC_API_KEY?.trim())
      throw new Error('LLM_PROVIDER=anthropic needs ANTHROPIC_API_KEY (the Claude API key)');
    const effort = anthropicEffortFrom(env);
    return new AnthropicLlmClient({
      apiKey: env.ANTHROPIC_API_KEY.trim(),
      ...(env.ANTHROPIC_MODEL_ID?.trim() ? { model: env.ANTHROPIC_MODEL_ID.trim() } : {}),
      ...(effort === undefined ? {} : { effort }),
    });
  }
  throw new Error(`LLM_PROVIDER must be bedrock, anthropic or none, not "${env.LLM_PROVIDER}"`);
}

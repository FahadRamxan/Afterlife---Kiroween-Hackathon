// Which model the worker uses, from its environment. Bedrock when it is asked for; otherwise
// none, and the agents say a model is needed rather than inventing answers.
import { DEFAULT_LLM_TOKEN_BUDGET } from '@afterlife/db';
import { BedrockLlmClient } from './bedrock';
import type { LlmClient } from './types';

/** Tokens (input plus output) one project may use, unless LLM_TOKEN_BUDGET says otherwise. */
export const DEFAULT_TOKEN_BUDGET = DEFAULT_LLM_TOKEN_BUDGET;

export type LlmEnv = {
  LLM_PROVIDER?: string;
  BEDROCK_MODEL_ID?: string;
  AWS_REGION?: string;
  LLM_TOKEN_BUDGET?: string;
};

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
  throw new Error(`LLM_PROVIDER must be bedrock or none, not "${env.LLM_PROVIDER}"`);
}

import { describe, expect, it } from 'vitest';
import { BedrockLlmClient } from './bedrock';
import { DEFAULT_TOKEN_BUDGET, llmClientFrom, tokenBudgetFrom } from './config';

describe('llmClientFrom', () => {
  it('has no model unless one is configured', () => {
    expect(llmClientFrom({})).toBeNull();
    expect(llmClientFrom({ LLM_PROVIDER: 'none' })).toBeNull();
  });
  it('builds the Bedrock client with the configured model', () => {
    const c = llmClientFrom({
      LLM_PROVIDER: 'bedrock',
      BEDROCK_MODEL_ID: 'eu.anthropic.claude-sonnet-x',
    });
    expect(c).toBeInstanceOf(BedrockLlmClient);
    expect(c?.model).toBe('eu.anthropic.claude-sonnet-x');
  });
  it('refuses a provider it does not know', () => {
    expect(() => llmClientFrom({ LLM_PROVIDER: 'openai' })).toThrow(/bedrock or none/);
  });
});

describe('tokenBudgetFrom', () => {
  it('defaults, reads a whole number, and refuses anything else', () => {
    expect(tokenBudgetFrom({})).toBe(DEFAULT_TOKEN_BUDGET);
    expect(tokenBudgetFrom({ LLM_TOKEN_BUDGET: '5000' })).toBe(5000);
    expect(() => tokenBudgetFrom({ LLM_TOKEN_BUDGET: '-1' })).toThrow();
    expect(() => tokenBudgetFrom({ LLM_TOKEN_BUDGET: '1.5' })).toThrow();
    expect(() => tokenBudgetFrom({ LLM_TOKEN_BUDGET: 'lots' })).toThrow();
  });
});

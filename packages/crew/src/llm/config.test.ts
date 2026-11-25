import { describe, expect, it } from 'vitest';
import { AnthropicLlmClient } from './anthropic';
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
  it('builds the Claude API client; the key stays in the environment, the model can be changed', () => {
    const c = llmClientFrom({ LLM_PROVIDER: 'Anthropic', ANTHROPIC_API_KEY: 'sk-test' });
    expect(c).toBeInstanceOf(AnthropicLlmClient);
    expect(c?.model).toBe('claude-sonnet-5-5');
    expect(JSON.stringify(c)).not.toContain('sk-test');
    expect(
      llmClientFrom({
        LLM_PROVIDER: 'anthropic',
        ANTHROPIC_API_KEY: 'k',
        ANTHROPIC_MODEL_ID: 'claude-opus-5',
      })?.model,
    ).toBe('claude-opus-5');
  });
  it('reads how hard Claude thinks (ANTHROPIC_EFFORT), and refuses a level it does not know', () => {
    const base = { LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'k' };
    const effort = (e?: string) =>
      (
        llmClientFrom({
          ...base,
          ...(e === undefined ? {} : { ANTHROPIC_EFFORT: e }),
        }) as AnthropicLlmClient | null
      )?.effort;
    expect(effort()).toBe('low');
    expect(effort('High')).toBe('high');
    expect(effort('none')).toBeNull();
    expect(() => effort('turbo')).toThrow(/low, medium, high, xhigh, max or none/);
  });
  it('says the key is missing instead of failing on the first call', () => {
    expect(() => llmClientFrom({ LLM_PROVIDER: 'anthropic' })).toThrow('ANTHROPIC_API_KEY');
  });
  it('refuses a provider it does not know', () => {
    expect(() => llmClientFrom({ LLM_PROVIDER: 'openai' })).toThrow(/bedrock, anthropic or none/);
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

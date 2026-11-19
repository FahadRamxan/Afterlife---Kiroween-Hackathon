export const packageName = '@afterlife/crew';

// The LLM runtime (Prompt 47).
export * from './llm/types';
export { FakeLlmClient, estimateTokens, fakeText, fakeToolUse, type FakeStep } from './llm/fake';
export {
  BedrockLlmClient,
  DEFAULT_BEDROCK_MODEL,
  fromBedrockOutput,
  toBedrockInput,
  toBedrockMessages,
} from './llm/bedrock';
export {
  AGENTS,
  MemoryLlmCallLog,
  type AgentName,
  type LlmCallLog,
  type LlmCallRecord,
  type LlmCallStatus,
} from './llm/log';
export { PgLlmCallLog } from './llm/pg-log';
export {
  CrewLlm,
  DEFAULT_RETRY,
  LlmBudgetError,
  LlmSchemaError,
  LlmToolLoopError,
  backoffMs,
  crewTool,
  toolInputSchema,
  type CallTag,
  type CrewLlmOptions,
  type CrewTool,
  type RetryPolicy,
  type ToolCall,
  type ToolRun,
} from './llm/runtime';
export { DEFAULT_TOKEN_BUDGET, llmClientFrom, tokenBudgetFrom, type LlmEnv } from './llm/config';

// Rules in Urdu (Prompt 46).
export {
  GLOSSARY_VERSION,
  SHOP_GLOSSARY,
  glossaryIssues,
  hasUrduScript,
  termsIn,
  type GlossaryEntry,
} from './urdu/glossary';
export {
  MemoryTranslationCache,
  ruleHash,
  translateSoul,
  translateText,
  type SoulTranslation,
  type TranslateDeps,
  type TranslationCache,
} from './urdu/translate';
export { PgTranslationCache } from './urdu/pg-cache';

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

// The Possessor (Prompt 48).
export {
  EXIT_WORDS,
  SAVE_WORDS,
  activeField,
  fieldLabel,
  hintKeys,
  screenActions,
  type FieldInfo,
  type PossessAction,
} from './possessor/actions';
export {
  ScreenGraph,
  type GraphEdge,
  type GraphNode,
  type ScreenGraphJson,
} from './possessor/graph';
export {
  possess,
  type PossessOptions,
  type PossessResult,
  type PossessorObservation,
  type StepKind,
  type StopReason,
} from './possessor/possessor';
export {
  VALUE_SYSTEM,
  dataValue,
  dataValueChooser,
  fitWidth,
  llmValueChooser,
  readSamples,
  valuePrompt,
  type DataSample,
  type ValueChooser,
  type ValueContext,
} from './possessor/values';

// The input strategy (Prompt 49).
export { strategyChooser } from './possessor/values';
export {
  fitsType,
  probes,
  screenDate,
  typeField,
  typicalValue,
  type DateFormat,
  type FieldType,
  type MonthFormat,
  type Probe,
  type ProbeReason,
  type TypedField,
} from './possessor/inputs';

// Guided possession and speech (Prompt 50).
export { attachHints, guideFromSeance, type GuideStep, type SeanceAction } from './possessor/guide';
export {
  FakeSpeechClient,
  SEANCE_LANGUAGES,
  type SpeechClient,
  type SpeechSegment,
  type Transcript,
} from './speech/types';
export { speechClientFrom, type SpeechEnv } from './speech/config';

// The screen graph, kept and replayed (Prompt 52).
export {
  ReplayError,
  edgeId,
  replayPath,
  shortestPath,
  type ReplayResult,
} from './possessor/replay';
export { loadGraph, mergeGraphs, saveGraph } from './possessor/graph-store';

// The Archaeologist: entities, keys, foreign keys and counters (Prompt 53).
export {
  counterPattern,
  detectCounters,
  detectDerived,
  detectEntities,
  detectForeignKeys,
  detectKeys,
  NUMBER_COUNTER,
  nextCounter,
  numberCounter,
  type Derived,
  type FileForeignKey,
  type TableInput,
} from './archaeologist/entities';

// Rule hypotheses (Prompt 54).
export {
  HYPOTHESES_TEMPLATE,
  MAX_CANDIDATES,
  MIN_CANDIDATES,
  effectsOf,
  hypothesesFor,
  promptFor,
  renderTemplate,
  type Effect,
  type EffectObservation,
  type Hypotheses,
} from './archaeologist/hypotheses';

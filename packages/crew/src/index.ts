export const packageName = '@afterlife/crew';

// The LLM runtime (Prompt 47).
export * from './llm/types';
export { FakeLlmClient, estimateTokens, fakeText, fakeToolUse, type FakeStep } from './llm/fake';
export {
  BEDROCK_MODEL_TABLE,
  BedrockLlmClient,
  DEFAULT_BEDROCK_MODEL,
  bedrockCapabilities,
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
  entityIdFor,
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
  ruleName,
  type Effect,
  type EffectObservation,
  type Hypotheses,
} from './archaeologist/hypotheses';

// Rule verification and selection (Prompt 55).
export {
  confidenceOf,
  countNodes,
  envFor,
  selectRule,
  targetOf,
  verifyCandidates,
  type CandidateCheck,
  type RuleProbe,
  type RuleProbeRunner,
  type Verification,
  type VerifyEntity,
} from './archaeologist/verify';
export { MAX_ENUMERATED, enumerateCandidates } from './archaeologist/enumerate';
export { PLANS_PER_VALUE, planProbe, probePlanner, type ProbePlan } from './archaeologist/probes';
export {
  EXPLORE_VALUES,
  MAX_RULE_TARGETS,
  chooseInLayers,
  inferRules,
  type ProbeRun,
  type InferOptions,
  type Inferred,
} from './archaeologist/infer';

// The Soul's actions, from the observations (review of 51-60).
export {
  inferActions,
  labelScore,
  macroOf,
  stepFromEvent,
  stepFromObservation,
  type ActionStep,
} from './archaeologist/actions';

// Archaeology scoring against a sample's hidden truth (Prompt 56).
export {
  normalizeExpression,
  scoreSentence,
  scoreSoul,
  type HiddenRule,
  type InferredSoul,
  type RuleScore,
  type Score,
  type ScoreEvidence,
  type Truth,
} from './archaeologist/scoring';
// The Surgeon: the Soul compiled into the reborn app (Prompt 63).
export {
  operate,
  type CompiledRule,
  type Operation,
  type SmokeTest,
  type VesselConfig,
} from './surgeon/surgeon';
// The Undertaker: the old app's data into the reborn app (Prompts 64 to 66).
export {
  calendarDay,
  exportRecord,
  importRecord,
  type Typed,
  type TypedValue,
  type Unconverted,
} from './undertaker/convert';
export { migrate, type MigratedTable, type Migration, type Rejected } from './undertaker/migrate';

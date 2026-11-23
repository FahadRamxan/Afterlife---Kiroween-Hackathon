// @afterlife/oracle: the proof that the reborn app does what the old app did (Prompts 67 to 70).
export {
  caseArbitrary,
  prepareCases,
  thresholdsOf,
  type CaseContext,
  type ProofCase,
  type Threshold,
} from './arbitraries';
export { effectDifferences, normalValue, sameEffects, type Difference } from './compare';
export { emulatorOldApp, type EmulatorOldAppOptions } from './old-app';
export {
  DEFAULT_RULE,
  readiness,
  type Readiness,
  type ReadinessRule,
  type TwinResult,
} from './readiness';
export {
  candidateActions,
  inputsFromDiff,
  replayTwin,
  type TwinInput,
  type TwinOutcome,
} from './twin';
export { explainDifference, type Explained } from './explain';
export { SHRINK_TIME_LIMIT_MS, shrinkFailure, type Counterexample } from './shrink';
export {
  NO_EFFECTS,
  RESTART_EVERY,
  freshVessel,
  proofCases,
  proofProperty,
  proveEquivalence,
  vesselOldApp,
  type CaseOutcome,
  type CaseResult,
  type OldApp,
  type OldRun,
  type ProofOptions,
  type ProofResult,
  type ProofTarget,
} from './runner';

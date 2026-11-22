// The Exorcist (Prompts 73 to 75): legacy bugs and flaws, with their evidence.
export {
  capacity,
  duplicateKeys,
  missingValidation,
  negativeAllowed,
  numericOverflow,
  passwords,
  roundingNoise,
  sinceYear,
  twoDigitYears,
} from './detectors';
export { exorcise } from './exorcise';
export {
  judgeLateFee,
  lateFeePlan,
  weeksBy,
  type LateFeePlan,
  type LateFeeResult,
  type WeekModel,
} from './late-fee';
export { scoreExorcism, type BugTruth, type ExorcismScore } from './score';
export {
  SEVERITY_ORDER,
  SMELLS,
  type Evidence,
  type ExorcistInput,
  type Finding,
  type ObservedStep,
  type Severity,
  type Smell,
} from './types';
export { applyEdits, remedyFor, undoFixes, type Remedy, type RuleEdit } from './remedies';
export {
  DecisionError,
  decideExorcism,
  findingOf,
  type Decision,
  type DecisionResult,
  type StoredFinding,
} from './decide';

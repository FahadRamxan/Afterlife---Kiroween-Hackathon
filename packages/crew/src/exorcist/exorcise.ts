// The Exorcist (Prompt 73): every detector on the Soul, the old app's records and its
// observations, and the late fee judged from the probes the worker typed into the old app.
import {
  duplicateKeys,
  missingValidation,
  negativeAllowed,
  numericOverflow,
  passwords,
  roundingNoise,
  twoDigitYears,
} from './detectors';
import { judgeLateFee, type LateFeePlan, type LateFeeResult } from './late-fee';
import { SEVERITY_ORDER, type ExorcistInput, type Finding } from './types';

const DETECTORS = [
  twoDigitYears,
  numericOverflow,
  negativeAllowed,
  missingValidation,
  duplicateKeys,
  roundingNoise,
  passwords,
];

/** Every finding, one per code (the most severe kept), most severe first. */
export function exorcise(
  input: ExorcistInput,
  lateFee?: { plan: LateFeePlan; results: LateFeeResult[] },
): Finding[] {
  const all = DETECTORS.flatMap((d) => d(input));
  if (lateFee) {
    const f = judgeLateFee(input, lateFee.plan, lateFee.results);
    if (f) all.push(f);
  }
  const rank = (f: Finding) => SEVERITY_ORDER.indexOf(f.severity);
  const by = new Map<string, Finding>();
  for (const f of all) {
    const had = by.get(f.code);
    if (!had || rank(f) < rank(had)) by.set(f.code, f);
  }
  return [...by.values()].sort((a, b) => rank(a) - rank(b) || a.code.localeCompare(b.code));
}

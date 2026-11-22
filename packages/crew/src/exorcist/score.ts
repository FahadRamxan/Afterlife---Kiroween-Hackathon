// The Exorcist's score (Prompt 73): its findings against the bugs our team wrote into each sample
// app (manifest.json `knownBugs`, with a `truth` the Crew never reads).
import type { Finding, Smell } from './types';

export type BugTruth = { id: string; truth: { smell: Smell; target?: string } };
export type ExorcismScore = { found: string[]; missed: string[]; extra: string[] };

/** A bug is found by a finding of its smell on its field (any field when the truth names none). */
export function scoreExorcism(findings: Finding[], bugs: BugTruth[]): ExorcismScore {
  const used = new Set<string>();
  const found: string[] = [];
  const missed: string[] = [];
  for (const b of bugs) {
    const f = findings.find(
      (x) => x.smell === b.truth.smell && (!b.truth.target || x.target === b.truth.target),
    );
    if (f) {
      found.push(b.id);
      used.add(f.code);
    } else missed.push(b.id);
  }
  return { found, missed, extra: findings.filter((f) => !used.has(f.code)).map((f) => f.code) };
}

// The proof run (Prompt 70): its progress from the prove step's live `proof_case` events, and its
// summary and counterexample from the steps API once the step is done.
import { z } from 'zod';
import type { LiveEvent } from './live';

const Values = z.record(z.string(), z.string());
const DifferenceSchema = z.object({
  table: z.string(),
  kind: z.enum(['inserted', 'deleted', 'updated']),
  record: z.string(),
  field: z.string().optional(),
  old: z.string().nullable(),
  vessel: z.string().nullable(),
  values: Values.optional(),
});
export type ProofDifference = z.infer<typeof DifferenceSchema>;
const Inputs = z.object({ values: Values.optional(), lines: z.array(Values).optional() });

export const ProofSchema = z.object({
  soulVersion: z.number(),
  seed: z.number(),
  numRuns: z.number(),
  lanes: z.number(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  /** Prompt 74: cases that differ as the owner's fixes say, and cases kept from the last proof. */
  accepted: z.number().default(0),
  reused: z.number().default(0),
  acceptedDivergences: z.array(z.object({ id: z.string(), text: z.string() })).default([]),
  counterexample: z
    .object({
      index: z.number(),
      actionId: z.string(),
      inputs: Inputs,
      seed: z.number(),
      path: z.string(),
      explanation: z.string(),
      differences: z.array(DifferenceSchema),
      shrinks: z.number(),
      tries: z.number(),
      reproduced: z.boolean(),
      old: Values.nullable(),
      vessel: Values.nullable(),
    })
    .nullable(),
  /** The Rebirth Certificate (Prompt 71): its id, or why none was issued. */
  certificate: z
    .object({ id: z.string().optional(), reason: z.string().optional() })
    .nullable()
    .default(null)
    .transform((c) => ({ id: c?.id ?? null, reason: c?.reason ?? null })),
});
export type Proof = z.infer<typeof ProofSchema>;

const CaseEvent = z.object({
  index: z.number().int().nonnegative(),
  of: z.number().int().positive(),
  done: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  accepted: z.number().int().nonnegative().default(0),
  reused: z.boolean().optional(),
  lane: z.number().int().nonnegative(),
  actionId: z.string(),
  inputs: Inputs,
  outcome: z.enum(['pass', 'fail', 'skip', 'accepted']),
  reason: z.string().optional(),
  differences: z.array(DifferenceSchema).optional(),
  screen: z.array(z.string()).optional(),
  old: Values.nullable(),
  vessel: Values.nullable(),
  ms: z.number(),
});
export type ProofCaseEvent = z.infer<typeof CaseEvent>;

/** The cases kept in the log on the page, newest first. */
export const LOG_CASES = 20;

export type ProofProgress = {
  done: number;
  of: number;
  failed: number;
  skipped: number;
  accepted: number;
  /** The case just run: the old app's screen after it, and what each side wrote. */
  latest: ProofCaseEvent;
  /** The newest cases first. */
  cases: ProofCaseEvent[];
};

/** Where the proof is, from the newest proof_case event; null before the first case. */
export function proofProgress(events: LiveEvent[]): ProofProgress | null {
  let cases: ProofCaseEvent[] = [];
  for (const e of events) {
    if (e.type === 'step') {
      // A new run of the step starts again.
      const p = e.payload as { step?: string; state?: string };
      if (p.step === 'prove' && p.state === 'started') cases = [];
      continue;
    }
    if (e.type !== 'proof_case') continue;
    const c = CaseEvent.safeParse(e.payload);
    if (c.success) cases.push(c.data);
  }
  const latest = cases.at(-1);
  if (!latest) return null;
  return {
    done: latest.done,
    of: latest.of,
    failed: latest.failed,
    skipped: latest.skipped,
    accepted: latest.accepted,
    latest,
    cases: cases.slice(-LOG_CASES).reverse(),
  };
}

const n = (x: number) => new Intl.NumberFormat('en-US').format(x);
/** "1,200 / 2,000 cases · 0 differences". */
export const proofCounter = (p: { done: number; of: number; failed: number }) =>
  `${n(p.done)} / ${n(p.of)} cases · ${n(p.failed)} ${p.failed === 1 ? 'difference' : 'differences'}`;

// The owner's choice for a finding (Prompt 74). Keep: the Soul copies the old behaviour (adding or
// rewriting the rule as the old app does it), so the proof stays strict. Fix: the Soul gets the
// corrected rule, and the Oracle accepts the difference it makes, listed on the certificate. Either
// one that changes a rule writes a new Soul version. Decided once: a choice is not silently undone.
import { and, eq, exorcisms, insertSoulVersion, latestSoulRow, type Db } from '@afterlife/db';
import { SoulSchema, numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import { applyEdits, remedyFor, type Remedy } from './remedies';
import type { Evidence, Finding, Severity, Smell } from './types';

export class DecisionError extends Error {
  constructor(
    readonly code: 'NOT_FOUND' | 'ALREADY_DECIDED' | 'NOT_FIXABLE' | 'NO_SOUL',
    message: string,
  ) {
    super(message);
    this.name = 'DecisionError';
  }
}

/** What an `exorcisms` row keeps in its `evidence` column. */
export type StoredFinding = {
  smell: Smell;
  target: string | null;
  en: string;
  ur: string;
  since: number | null;
  evidence: Evidence[];
  /** Set when decided: the remedy as it was worked out, and the Soul version it made. */
  remedy?: Remedy;
  soulVersion?: number;
};

type Row = typeof exorcisms.$inferSelect;

/** The finding an `exorcisms` row holds. */
export function findingOf(
  row: Pick<Row, 'code' | 'severity' | 'titleEn' | 'titleUr' | 'evidence'>,
): Finding {
  const s = row.evidence as StoredFinding;
  return {
    code: row.code,
    smell: s.smell,
    severity: row.severity as Severity,
    ...(s.target ? { target: s.target } : {}),
    titleEn: row.titleEn,
    titleUr: row.titleUr,
    en: s.en,
    ur: s.ur,
    since: s.since,
    evidence: s.evidence,
  };
}

export type Decision = 'keep' | 'fix';
export type DecisionResult = {
  decision: Decision;
  soulVersion: number;
  changed: boolean;
  remedy: Remedy;
};

export async function decideExorcism(
  db: Db,
  projectId: string,
  code: string,
  decision: Decision,
): Promise<DecisionResult> {
  const [row] = await db
    .select()
    .from(exorcisms)
    .where(and(eq(exorcisms.projectId, projectId), eq(exorcisms.code, code)));
  if (!row) throw new DecisionError('NOT_FOUND', 'No such finding');
  if (row.decision !== 'pending')
    throw new DecisionError('ALREADY_DECIDED', `This finding was already decided: ${row.decision}`);
  const latest = await latestSoulRow(db, projectId);
  if (!latest) throw new DecisionError('NO_SOUL', 'This project has no Soul yet');
  const soul = SoulSchema.parse(latest.ir);
  const remedy = remedyFor(findingOf(row), soul);
  const edits = decision === 'keep' ? remedy.keep : remedy.fix;
  if (!edits) throw new DecisionError('NOT_FIXABLE', remedy.why ?? 'This finding cannot be fixed');
  let soulVersion = latest.version;
  if (edits.length) {
    const next: Soul = applyEdits(soul, edits);
    soulVersion = await insertSoulVersion(db, projectId, (v, parent) => {
      const s = numberSoul(
        {
          ...next,
          provenance: {
            ...next.provenance,
            note: `${decision === 'keep' ? 'Kept' : 'Fixed'} ${row.titleEn.toLowerCase()} (Exorcist)`,
          },
        },
        projectId,
        v,
        parent,
      );
      return { ir: s, specMarkdown: specRequirements(s) };
    });
  }
  const stored: StoredFinding = { ...(row.evidence as StoredFinding), remedy, soulVersion };
  await db
    .update(exorcisms)
    .set({ decision, decidedAt: new Date(), evidence: stored })
    .where(eq(exorcisms.id, row.id));
  return { decision, soulVersion, changed: edits.length > 0, remedy };
}

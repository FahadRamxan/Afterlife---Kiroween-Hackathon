// The Exorcist's findings (Prompt 73): the legacy bugs and flaws of a dead app, each with what
// shows it. Deterministic code finds them; nothing here comes from a model.
import type { DbfRecord, SnapshotDiff } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';

export const SMELLS = [
  'two-digit-year',
  'numeric-overflow',
  'negative-allowed',
  'date-arithmetic',
  'rounding',
  'missing-validation',
  'duplicate-key',
  'hardcoded-password',
  'readable-password',
] as const;
export type Smell = (typeof SMELLS)[number];

export type Severity = 'low' | 'medium' | 'high' | 'critical';
export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];

export type Evidence = {
  kind: 'observation' | 'record' | 'rule' | 'probe';
  /** The observation id, `FILE.DBF#recno`, the rule id, or the probe's DOS date. */
  ref: string;
  /** What it shows, in the old app's own words where it has them. */
  text: string;
};

export type Finding = {
  /** `<smell>:<entity>.<field>` (or `<smell>:app`): one per project. */
  code: string;
  smell: Smell;
  severity: Severity;
  /** The field it is about, `entity.field` in lower case. */
  target?: string;
  titleEn: string;
  titleUr: string;
  en: string;
  ur: string;
  /** The year it has been happening since: the earliest year in the data the app wrote. */
  since: number | null;
  evidence: Evidence[];
};

/** A step the old app took, as the Possessor recorded it. */
export type ObservedStep = {
  id: string;
  keys: string;
  screenBefore: { text: string[] };
  screenAfter: { text: string[] };
  dbfDiff: SnapshotDiff;
};

export type ExorcistInput = {
  soul: Soul;
  /** The old app's records, by file (MEDICINE.DBF). */
  records: Record<string, DbfRecord[]>;
  observations: ObservedStep[];
  /** The old app's date, YYYY-MM-DD. */
  today: string;
};

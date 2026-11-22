// The late fee (Prompt 73): does the old app count weeks late by days, or by calendar weeks
// crossed? One recorded payment cannot tell (2 days late is 1 week both ways). The Exorcist plans
// payments on dates where the ways of counting give different fees, the worker types them into the
// old app booted at those dates, and only the old app's own fees decide.
import Decimal from 'decimal.js';
import type { DbfValue } from '@afterlife/dbf';
import { macroFields, type Entity } from '@afterlife/soul';
import type { Evidence, ExorcistInput, Finding } from './types';
import { sinceYear } from './detectors';

export type WeekModel = 'calendar-weeks' | 'days-up' | 'days-down';
const MODELS: WeekModel[] = ['calendar-weeks', 'days-up', 'days-down'];

const day = (iso: string) =>
  Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000;
const iso = (d: number) => new Date(d * 86_400_000).toISOString().slice(0, 10);
/** Weeks starting on Monday: 1970-01-01 was a Thursday. */
const mondayWeek = (d: number) => Math.floor((d + 3) / 7);
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekday = (s: string) => WEEKDAY[new Date(`${s}T00:00:00Z`).getUTCDay()]!;

/** The weeks late a payment on `paid` counts, for a fee due on `due`, by each way of counting. */
export function weeksBy(model: WeekModel, due: string, paid: string): number {
  const late = day(paid) - day(due);
  if (late <= 0) return 0;
  if (model === 'calendar-weeks') return mondayWeek(day(paid)) - mondayWeek(day(due));
  return model === 'days-up' ? Math.ceil(late / 7) : Math.floor(late / 7);
}

export type LateFeePlan = {
  entity: string;
  field: string;
  target: string;
  /** The day the fee was due, YYYY-MM-DD. */
  due: string;
  feePerWeek: string;
  /** The action and the inputs of the recorded payment: each probe types it again. */
  actionId: string;
  inputs: { values: Record<string, string> };
  observed: { date: string; lateFee: string; ref: string; line: string }[];
  /** The dates to pay on (the old app booted at each). */
  probes: string[];
};

export type LateFeeResult = { date: string; lateFee: string | null; ref: string };

const WEEKS_LABEL = /\b(LATE|FINE|PENALTY)\b[^\n]*\((\d+)\s*(WK|WKS|WEEK|WEEKS)\)/i;
const DUE = /\bdue (?:on )?the (\d{1,2})(?:st|nd|rd|th)\b/i;
const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const ymdIso = (d: string) => `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;

/**
 * The plan, or null: a fee the old app shows as "(n WK)", a record it wrote with that fee and a
 * date, the day the fee was due (as the app's own screen says it), and a month on the record.
 */
export function lateFeePlan(input: ExorcistInput): LateFeePlan | null {
  const dueDay = input.observations
    .flatMap((o) => o.screenAfter.text)
    .map((l) => DUE.exec(l)?.[1])
    .find(Boolean);
  if (!dueDay) return null;
  for (const [i, o] of input.observations.entries()) {
    for (const [file, t] of Object.entries(o.dbfDiff.tables))
      for (const r of t.inserted) {
        const e: Entity | undefined = input.soul.entities.find((x) => x.file === file);
        if (!e) continue;
        const fee = e.fields.find(
          (f) => (f.type === 'N' || f.type === 'F') && /^(LATE|FINE|PENALTY)/.test(f.name),
        );
        const paid = e.fields.find((f) => f.type === 'D' && /^\d{8}$/.test(str(r.values[f.name])));
        const month = e.fields.find(
          (f) => f.type === 'C' && /^(19|20)\d{2}(0[1-9]|1[0-2])$/.test(str(r.values[f.name])),
        );
        if (!fee || !paid || !month || !new Decimal(str(r.values[fee.name]) || '0').gt(0)) continue;
        // The weeks the screen said, on this step or the few before it.
        const shown = input.observations
          .slice(Math.max(0, i - 6), i + 1)
          .flatMap((x) =>
            [...x.screenBefore.text, ...x.screenAfter.text].map((line) => ({ x, line })),
          )
          .map((y) => ({ ...y, m: WEEKS_LABEL.exec(y.line) }))
          .find((y) => y.m);
        if (!shown) continue;
        const weeks = Number(shown.m![2]);
        if (!(weeks > 0)) continue;
        const action = input.soul.actions.find((a) =>
          a.effects.some((x) => x.kind === 'insert' && x.entity === e.id),
        );
        if (!action) continue;
        const ym = str(r.values[month.name]);
        const due = `${ym.slice(0, 4)}-${ym.slice(4, 6)}-${dueDay.padStart(2, '0')}`;
        const date = ymdIso(str(r.values[paid.name]));
        const lateFee = str(r.values[fee.name]);
        const typed = macroFields(action.keys).record;
        const inputs = {
          values: Object.fromEntries(
            typed.filter((f) => f in r.values).map((f) => [f, str(r.values[f])]),
          ),
        };
        const observed = [{ date, lateFee, ref: o.id, line: shown.line.trim() }];
        return {
          entity: e.id,
          field: fee.name,
          target: `${e.id.replace(/-/g, '_')}.${fee.name.toLowerCase()}`,
          due,
          feePerWeek: new Decimal(lateFee).div(weeks).toString(),
          actionId: action.id,
          inputs,
          observed,
          probes: chooseProbes(
            due,
            observed.map((x) => x.date),
          ),
        };
      }
  }
  return null;
}

/** Up to 3 dates in the due date's month, after it, that tell the ways of counting apart. */
function chooseProbes(due: string, known: string[]): string[] {
  const end = new Date(Date.UTC(+due.slice(0, 4), +due.slice(5, 7), 0)).toISOString().slice(0, 10);
  const candidates = Array.from({ length: 21 }, (_, k) => iso(day(due) + k + 1)).filter(
    (d) => d <= end && !known.includes(d),
  );
  const chosen: string[] = [];
  const apart = (dates: string[]) =>
    new Set(MODELS.map((m) => dates.map((d) => weeksBy(m, due, d)).join(','))).size;
  while (chosen.length < 3 && apart([...known, ...chosen]) < MODELS.length) {
    const best = candidates
      .filter((d) => !chosen.includes(d))
      .sort(
        (a, b) =>
          apart([...known, ...chosen, b]) - apart([...known, ...chosen, a]) || a.localeCompare(b),
      )[0];
    if (!best || apart([...known, ...chosen, best]) === apart([...known, ...chosen])) break;
    chosen.push(best);
  }
  // A second date where calendar weeks and days late differ, so no finding rests on one date.
  const second = candidates.find(
    (d) => !chosen.includes(d) && weeksBy('calendar-weeks', due, d) !== weeksBy('days-up', due, d),
  );
  if (chosen.length < 2 && second) chosen.push(second);
  return chosen.sort();
}

/** The finding, when only calendar weeks explain every fee the old app charged; else null. */
export function judgeLateFee(
  input: ExorcistInput,
  plan: LateFeePlan,
  results: LateFeeResult[],
): Finding | null {
  const answered = results.filter(
    (r): r is LateFeeResult & { lateFee: string } =>
      r.lateFee !== null && /^\d+(\.\d+)?$/.test(r.lateFee),
  );
  if (!answered.length) return null;
  const points = [...plan.observed.map((o) => ({ date: o.date, lateFee: o.lateFee })), ...answered];
  const fee = (m: WeekModel, date: string) =>
    new Decimal(plan.feePerWeek).times(weeksBy(m, plan.due, date));
  const fits = MODELS.filter((m) => points.every((p) => fee(m, p.date).eq(p.lateFee)));
  if (fits.length !== 1 || fits[0] !== 'calendar-weeks') return null;
  const late = (d: string) => day(d) - day(plan.due);
  const evidence: Evidence[] = [
    ...plan.observed.map((o) => ({
      kind: 'observation' as const,
      ref: o.ref,
      text: `Paid ${late(o.date)} days late (${weekday(o.date)} ${o.date}): "${o.line}"`,
    })),
    ...answered.map((r) => ({
      kind: 'probe' as const,
      ref: r.ref,
      text: `Paid ${late(r.date)} days late (${weekday(r.date)} ${r.date}): the old app charged Rs ${new Decimal(r.lateFee).toFixed(2)}; counted by days it would be Rs ${fee('days-up', r.date).toFixed(2)}`,
    })),
  ];
  return {
    code: `date-arithmetic:${plan.target}`,
    smell: 'date-arithmetic',
    severity: 'medium',
    target: plan.target,
    titleEn: `The ${plan.field.toLowerCase().replace(/_/g, ' ')} counts calendar weeks, not days late`,
    titleUr: `${plan.field} دیر کے دن نہیں، کیلنڈر کے ہفتے گنتا ہے`,
    en: `The old app counts calendar weeks (Monday to Sunday) crossed after the due date (${plan.due}), not 7 days late to a week, and charges Rs ${new Decimal(plan.feePerWeek).toFixed(2)} for each: paying 1 day late can cost nothing, and 8 days late costs one week instead of two.`,
    ur: `پرانی ایپ مقررہ تاریخ (${plan.due}) کے بعد ہر 7 دن کی دیر پر نہیں، ہر گزرے کیلنڈر ہفتے (پیر سے اتوار) پر Rs ${new Decimal(plan.feePerWeek).toFixed(2)} لیتی ہے: 1 دن کی دیر پر کچھ نہیں لگتا، اور 8 دن کی دیر پر دو کی بجائے ایک ہفتہ لگتا ہے۔`,
    since: sinceYear(input),
    evidence,
  };
}

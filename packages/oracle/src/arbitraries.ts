// Arbitraries from the Soul (Prompt 67): cases the owner could type, made up by fast-check. For
// each action, a value for every field it asks for, valid for the field's type and width; a
// field that points at another record takes the key of one that exists (the shop's own
// medicines and customers). Cases are biased to the rules' thresholds (bills one price step
// under, at and over Rs 5,000, worked out by the Archaeologist's probe planner) and to the records
// whose dates are nearest the app's date. Lines the Soul's rules refuse on their own at the start
// (an expired batch) are left out, so a case is one the owner can finish in both apps.
import Decimal from 'decimal.js';
import type { DbfField, DbfRecord, DbfValue } from '@afterlife/dbf';
import { isMacro, macroFields, parseExpr, type Expr, type Soul } from '@afterlife/soul';
import {
  MemoryEntityStore,
  actionForm,
  createVessel,
  type ActionForm,
  type ActionInputs,
  type FormPart,
  ruleName,
} from '@afterlife/vessel';
import { probePlanner } from '@afterlife/crew';
import fc from 'fast-check';

export type ProofCase = {
  actionId: string;
  inputs: ActionInputs;
  /** fast-check's run that made it, from the seed: it replays alone with this path. */
  run?: number;
};
export type Threshold = { ref: string; value: string };

const COMPARE = new Set(['<', '<=', '>', '>=', '=']);
const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());

/** The thresholds the rules compare a value with (bill.subtotal > 5000 gives bill.subtotal 5000). */
export function thresholdsOf(soul: Soul): Threshold[] {
  const out = new Map<string, Threshold>();
  const walk = (e: Expr): void => {
    switch (e.type) {
      case 'binary': {
        if (COMPARE.has(e.op)) {
          const [ref, num] =
            e.left.type === 'ref' && e.right.type === 'num'
              ? [e.left, e.right]
              : e.right.type === 'ref' && e.left.type === 'num'
                ? [e.right, e.left]
                : [null, null];
          if (ref && num) {
            const t = { ref: ref.path.join('.'), value: num.value };
            out.set(`${t.ref} ${t.value}`, t);
          }
        }
        walk(e.left);
        walk(e.right);
        return;
      }
      case 'unary':
        return walk(e.arg);
      case 'if':
        walk(e.cond);
        walk(e.then);
        return walk(e.else);
      case 'call':
        return e.args.forEach(walk);
      case 'lambda':
        return walk(e.body);
      default:
    }
  };
  for (const r of soul.rules) {
    try {
      walk(parseExpr(r.expression));
    } catch {
      // A rule the language cannot read has no threshold to aim at.
    }
  }
  return [...out.values()];
}

type ActionContext = {
  actionId: string;
  form: ActionForm;
  /** Keys a link on the record may take; '' when the record may go without (a walk-in). */
  headerKeys: Record<string, string[]>;
  /** The records a line may name, each with the most of it a line may ask for. */
  lineRecords: { key: string; most: number; near: boolean }[];
  /** Cases at the thresholds, worked out beforehand. */
  plans: ProofCase[];
};

export type CaseContext = { soul: Soul; today: string; actions: ActionContext[] };

/** How many of a line's record the old app has: the field the action takes away from. */
function stockField(form: ActionForm): string | null {
  const pick = form.line?.links[0];
  if (!pick) return null;
  const upd = form.action.effects.find((e) => e.kind === 'update' && e.entity === pick.entity.id);
  return (
    pick.entity.fields.find(
      (f) => f.type === 'N' && f.decimals === 0 && (upd?.fields.includes(f.name) ?? false),
    )?.name ?? null
  );
}

/** Days between two days, YYYYMMDD or YYYY-MM-DD. */
const daysApart = (a: string, b: string) => {
  const t = (x: string) =>
    Date.parse(`${x.replace(/-/g, '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3')}T00:00:00Z`);
  return Math.abs(t(a) - t(b)) / 86_400_000;
};
/** The records with the dates nearest the app's date: this many of them are "near". */
const NEAREST = 5;
/** The greatest common divisor, for the smallest step the shop's prices can make. */
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** At most this many of one record on a line: a proof of many cases keeps its stock. */
const MAX_LINE_QTY = 3;
/** Lines on a bill. */
const MAX_LINES = 3;

/**
 * What the arbitraries need, worked out once from the Soul and the old app's records: each
 * action's form, the records its fields may name (tried one by one in the Vessel, so lines the
 * rules refuse on their own are left out), and the cases at its thresholds.
 */
export async function prepareCases(
  soul: Soul,
  records: Record<string, DbfRecord[]>,
  opts: { today: string },
): Promise<CaseContext> {
  const store = async () => {
    const s = new MemoryEntityStore();
    for (const [f, r] of Object.entries(records)) await s.load(f, r);
    return s;
  };
  const vessel = createVessel(soul, await store(), { today: () => opts.today });
  const byFile = (file: string) =>
    (records[file.toUpperCase()] ?? records[file] ?? []).filter((r) => !r.deleted);
  const thresholds = thresholdsOf(soul);
  const planner = await probePlanner(soul, await store(), opts.today);
  const actions: ActionContext[] = [];
  for (const a of soul.actions) {
    let form: ActionForm;
    try {
      form = actionForm(soul, a.id);
    } catch {
      continue; // An action the runtime cannot lay out has no cases (the Surgeon says why).
    }
    // Only what the action's keys type reaches the old app: a field it fills in itself (a fee, a
    // kind) or one the keys type as a fixed value gets no value here, or the Vessel would be
    // given what the old app never was.
    const typed = isMacro(a.keys) ? macroFields(a.keys) : { record: [], line: [] };
    form = {
      ...form,
      header: {
        ...form.header,
        inputs: form.header.inputs.filter((f) => typed.record.includes(f.name)),
        links: form.header.links.filter((l) => typed.record.includes(l.field)),
      },
      line: form.line
        ? {
            ...form.line,
            inputs: form.line.inputs.filter((f) => typed.line.includes(f.name)),
            links: form.line.links.filter((l) => typed.line.includes(l.field)),
          }
        : null,
    };
    const sample = (f: DbfField) =>
      f.type === 'N' ? '1' : f.type === 'D' ? opts.today.replace(/-/g, '') : 'A';
    const base = Object.fromEntries(
      form.header.inputs
        .filter((f) => !form.header.links.some((l) => l.field === f.name))
        .map((f) => [f.name, sample(f)]),
    );
    const pick = form.line?.links[0];
    const qty = form.line?.inputs.find((f) => f.name !== pick?.field && f.type === 'N');
    const firstLine = (code: string) =>
      form.line
        ? [
            Object.fromEntries(
              form.line.inputs.map((f) => [
                f.name,
                f.name === pick?.field ? code : f === qty ? '1' : sample(f),
              ]),
            ),
          ]
        : [];
    // Lines: each record the line may name, alone, must go through.
    const lineRecords: ActionContext['lineRecords'] = [];
    const distance = new Map<string, number>();
    // What one of each record adds to each total: the smallest step a total can move by.
    const steps = new Map<string, number>();
    const stock = stockField(form);
    if (pick)
      for (const r of byFile(pick.entity.file)) {
        const key = str(r.values[pick.refField]);
        if (!key) continue;
        const one = await vessel.previewAction(a.id, { values: base, lines: firstLine(key) });
        if (!one.ok) continue;
        for (const f of form.header.computed.filter((x) => x.type === 'N' && x.decimals > 0)) {
          const v = str(one.record[f.name]);
          if (!/^\d+(\.\d+)?$/.test(v)) continue;
          const units = new Decimal(v).times(new Decimal(10).pow(f.decimals)).toNumber();
          if (Number.isInteger(units) && units > 0)
            steps.set(f.name, gcd(steps.get(f.name) ?? 0, units));
        }
        const most = stock
          ? Math.min(MAX_LINE_QTY, Math.floor(Number(str(r.values[stock])) || 0))
          : MAX_LINE_QTY;
        if (most < 1) continue;
        const dates = pick.entity.fields
          .filter((f) => f.type === 'D')
          .map((f) => str(r.values[f.name]))
          .filter((d) => /^\d{8}$/.test(d));
        if (dates.length)
          distance.set(key, Math.min(...dates.map((d) => daysApart(d, opts.today))));
        lineRecords.push({ key, most, near: false });
      }
    // The records whose dates are nearest the app's date: the next batches to expire.
    const nearest = new Set(
      [...distance]
        .sort((x, y) => x[1] - y[1])
        .slice(0, NEAREST)
        .map(([k]) => k),
    );
    for (const r of lineRecords) r.near = nearest.has(r.key);
    const someLine = lineRecords[0] ? firstLine(lineRecords[0].key) : [];
    // A link on the record: the keys that exist, and a blank when the record may go without.
    const headerKeys: Record<string, string[]> = {};
    for (const l of form.header.links) {
      const keys = byFile(l.entity.file)
        .map((r) => str(r.values[l.refField]))
        .filter(Boolean);
      const blankOk = (
        await vessel.previewAction(a.id, { values: { ...base, [l.field]: '' }, lines: someLine })
      ).ok;
      headerKeys[l.field] = [...(blankOk ? [''] : []), ...keys];
    }
    // The thresholds the record's totals are compared with: one step under, at and over, the
    // step being the smallest the shop's prices make (5 paisa for Shifa: no bill is 4999.99).
    const plans: ProofCase[] = [];
    for (const t of thresholds) {
      const [entity, field] = t.ref.split('.') as [string, string];
      const f = form.header.computed.find((x) => x.name.toLowerCase() === field);
      if (!f || ruleName(form.header.entity.id) !== entity) continue;
      const unit = new Decimal(steps.get(f.name) ?? 1).div(new Decimal(10).pow(f.decimals));
      const values = [
        new Decimal(t.value).minus(unit),
        new Decimal(t.value),
        new Decimal(t.value).plus(unit),
      ]
        .filter((v) => v.gt(0))
        .map((v) => v.toString());
      for (const p of await planner({ target: t.ref, field: t.ref, values, text: '' }))
        if (p.inputs[0] && p.actionId === a.id)
          plans.push({ actionId: a.id, inputs: { values: {}, ...p.inputs[0] } });
    }
    actions.push({ actionId: a.id, form, headerKeys, lineRecords, plans });
  }
  return { soul, today: opts.today, actions };
}

/** A value for a field nothing points with, valid for its type and width. */
function plain(f: DbfField, today: string): fc.Arbitrary<string> {
  switch (f.type) {
    case 'N':
    case 'F': {
      const whole = Math.max(1, Math.min(f.length - (f.decimals ? f.decimals + 1 : 0), 4));
      const max = 10 ** whole - 1;
      return f.decimals
        ? fc
            .integer({ min: 1, max: max * 10 ** f.decimals })
            .map((n) => new Decimal(n).div(10 ** f.decimals).toFixed(f.decimals))
        : fc.integer({ min: 1, max: Math.min(max, 99) }).map(String);
    }
    case 'D':
      return fc.integer({ min: -30, max: 30 }).map((d) => {
        const t = new Date(`${today}T00:00:00Z`);
        t.setUTCDate(t.getUTCDate() + d);
        return t.toISOString().slice(0, 10);
      });
    case 'L':
      return fc.constantFrom('T', 'F');
    default:
      // Upper-case words, as a 1998 app took them: never blank (a name is required).
      return fc
        .string({
          unit: fc.constantFrom(...'ABCDEFGHIJKLMNOPRSTUWYZ'),
          minLength: 1,
          maxLength: Math.min(f.length, 12),
        })
        .map((s) => s.slice(0, f.length));
  }
}

function valuesOf(part: FormPart, keys: Record<string, string[]>, today: string) {
  return fc.record(
    Object.fromEntries(
      part.inputs.map((f) => {
        const k = keys[f.name];
        return [f.name, k ? (k.length ? fc.constantFrom(...k) : fc.constant('')) : plain(f, today)];
      }),
    ),
  );
}

function linesOf(a: ActionContext, today: string): fc.Arbitrary<Record<string, string>[]> {
  const line = a.form.line!;
  const pick = line.links[0]!;
  const qty = line.inputs.find((f) => f.name !== pick.field && f.type === 'N');
  const others = line.inputs.filter((f) => f.name !== pick.field && f !== qty);
  // Records near the app's date a quarter of the time (expiry cutoffs), any of them otherwise.
  const nearOnes = a.lineRecords.filter((r) => r.near);
  const record = nearOnes.length
    ? fc.oneof(
        { arbitrary: fc.constantFrom(...nearOnes), weight: 1 },
        { arbitrary: fc.constantFrom(...a.lineRecords), weight: 3 },
      )
    : fc.constantFrom(...a.lineRecords);
  const one = record.chain((r) =>
    fc.record({
      [pick.field]: fc.constant(r.key),
      ...(qty ? { [qty.name]: fc.integer({ min: 1, max: r.most }).map(String) } : {}),
      ...Object.fromEntries(others.map((f) => [f.name, plain(f, today)])),
    }),
  );
  // One line per record: the Soul's own rule (ALREADY IN BILL) refuses a record twice.
  return fc.uniqueArray(one, {
    minLength: 1,
    maxLength: Math.min(MAX_LINES, a.lineRecords.length),
    selector: (l) => l[pick.field],
  });
}

/** Cases for one action, or for any of them. Threshold cases a quarter of the time. */
export function caseArbitrary(ctx: CaseContext, actionId?: string): fc.Arbitrary<ProofCase> {
  const of = ctx.actions.filter(
    (a) => (actionId ? a.actionId === actionId : true) && (!a.form.line || a.lineRecords.length),
  );
  if (!of.length)
    throw new Error(actionId ? `No cases can be made for ${actionId}` : 'No action has cases');
  const forAction = (a: ActionContext): fc.Arbitrary<ProofCase> => {
    const made = fc
      .record({
        values: valuesOf(a.form.header, a.headerKeys, ctx.today),
        ...(a.form.line ? { lines: linesOf(a, ctx.today) } : {}),
      })
      .map((inputs) => ({ actionId: a.actionId, inputs }));
    return a.plans.length
      ? fc.oneof(
          { arbitrary: made, weight: 3 },
          { arbitrary: fc.constantFrom(...a.plans), weight: 1 },
        )
      : made;
  };
  // Most cases where the rules are (Prompt 81): an action gets a share by how many rules read or
  // write its records, so "add a customer" (one rule) does not take half the proof.
  const weight = (a: ActionContext) => {
    const names = new Set(
      [a.form.header.entity.id, a.form.line?.entity.id]
        .filter((x): x is string => !!x)
        .map((id) => id.replace(/-/g, '_')),
    );
    if (a.form.line) names.add('item');
    const n = ctx.soul.rules.filter((r) =>
      [r.target ?? '', r.expression].some((s) =>
        [...names].some((nm) => new RegExp(`\\b${nm}\\.`).test(s)),
      ),
    ).length;
    return 1 + n;
  };
  return of.length === 1
    ? forAction(of[0]!)
    : fc.oneof(...of.map((a) => ({ arbitrary: forAction(a), weight: weight(a) })));
}

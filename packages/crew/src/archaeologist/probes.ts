// Probes (review of 51-60, finding 3): the bills the verifier asks to see ("a bill subtotal of
// exactly 5000 and of 5001"), planned from the old app's own records. A probe on a total that is
// a sum over the lines is a bill of one or two medicines whose quantities times prices give it
// exactly; the Vessel runtime, running the rules found so far, previews each plan to check it.
// The Possessor then types the plan into the old app (apps/worker), and the new observation is
// checked like the others: if the rules found so far were wrong, the old app's numbers say so.
import Decimal from 'decimal.js';
import type { DbfRecord } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { actionForm, createVessel, type ActionInputs, type EntityStore } from '@afterlife/vessel';
import { ruleName } from './hypotheses';
import type { RuleProbe } from './verify';

export type ProbePlan = {
  probe: RuleProbe;
  /** The value asked for ("5000"). */
  value: string;
  actionId: string;
  /** Plans in order of preference, each previewed to give exactly `value`. */
  inputs: ActionInputs[];
};

/** At most this many plans per value (the old app may refuse one: an expired batch). */
export const PLANS_PER_VALUE = 3;
/** A plan has at most this many lines (a bill of 10000 may need three medicines in stock). */
export const MAX_PLAN_LINES = 3;
const MAX_QTY = 999;
/** Search steps per value: the planner gives up on a value rather than stall the pipeline. */
const SEARCH_BUDGET = 200_000;

const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/**
 * The bills that would give each value of a probe. Empty when the probe is not on a total the
 * lines make up (or no action writes it), or when no plan gives the value exactly.
 */
export async function planProbe(
  probe: RuleProbe,
  soul: Soul,
  store: EntityStore,
  today: string,
): Promise<ProbePlan[]> {
  return (await probePlanner(soul, store, today))(probe);
}

type Planner = (probe: RuleProbe) => Promise<ProbePlan[]>;

/**
 * A planner for one Soul on one set of records: what each record adds to a total is worked out
 * once per total, for every probe after it.
 */
export async function probePlanner(
  soul: Soul,
  store: EntityStore,
  today: string,
): Promise<Planner> {
  const cache = new Map<string, Awaited<ReturnType<typeof unitsFor>>>();
  const unitsFor = async (probe: RuleProbe) => {
    const [entityName, field] = probe.field.split('.') as [string, string];
    const action = soul.actions.find((a) => {
      const header = a.effects.find((e) => e.kind === 'insert');
      return (
        header &&
        ruleName(header.entity) === entityName &&
        a.effects.filter((e) => e.kind === 'insert').length > 1
      );
    });
    if (!action) return null;
    // Previewed without what it changes elsewhere (the stock it takes away): a total does not
    // need it, and the rule for it may not be found yet.
    const previewed: Soul = {
      ...soul,
      actions: soul.actions.map((a) =>
        a.id === action.id ? { ...a, effects: a.effects.filter((e) => e.kind !== 'update') } : a,
      ),
    };
    let form;
    try {
      form = actionForm(previewed, action.id);
    } catch {
      return null;
    }
    const pick = form.line?.links[0];
    const qty = form.line?.inputs.find(
      (f) => f.name !== pick?.field && f.type === 'N' && f.decimals === 0,
    );
    const total = form.header.entity.fields.find((f) => f.name.toLowerCase() === field);
    if (!pick || !qty || !total) return null;
    const vessel = createVessel(previewed, store, { today: () => today });
    const catalogue = (await store.records(pick.entity.file)).filter((r) => !r.deleted);
    const scale = new Decimal(10).pow(total.decimals);
    const valueOf = async (lines: Record<string, string>[]) => {
      const r = await vessel.previewAction(action.id, { lines });
      if (!r.ok) return null;
      const v = text(r.record[total.name]);
      return /^-?\d+(\.\d+)?$/.test(v) ? new Decimal(v) : null;
    };
    // How many of a record the old app has: the field the action takes away from (the stock), or
    // one named like the quantity typed. A line asks for at most that many, or the old app refuses.
    const updated = action.effects.find(
      (e) => e.kind === 'update' && e.entity === pick.entity.id,
    )?.fields;
    const stock = pick.entity.fields.find(
      (f) =>
        f.type === 'N' &&
        f.decimals === 0 &&
        (updated ? updated.includes(f.name) : f.name === qty.name),
    );
    // What one of each record adds to the total, in its smallest unit (paisa).
    const units: { code: string; unit: number; late: boolean; most: number }[] = [];
    const dateFields = pick.entity.fields.filter((f) => f.type === 'D').map((f) => f.name);
    const day = today.slice(0, 10).replace(/-/g, '');
    for (const r of catalogue.slice(0, 80)) {
      const code = text(r.values[pick.refField]);
      if (!code) continue;
      const v = await valueOf([{ [pick.field]: code, [qty.name]: '1' }]);
      if (!v || !v.gt(0)) continue;
      const most = stock ? Number(text(r.values[stock.name]) || '0') : MAX_QTY;
      if (!(most >= 1)) continue;
      units.push({
        code,
        unit: v.times(scale).toNumber(),
        most: Math.min(MAX_QTY, Math.floor(most)),
        // A batch that has expired is likely refused by the old app: tried last.
        late: dateFields.some((f) => /^\d{8}$/.test(text(r.values[f])) && text(r.values[f]) < day),
      });
    }
    return { probe, action, pick, qty, total, scale, units, valueOf };
  };
  return async (probe) => {
    if (!cache.has(probe.field)) cache.set(probe.field, await unitsFor(probe));
    const u = cache.get(probe.field);
    if (!u) return [];
    const { action, pick, qty, scale, units, valueOf } = u;
    const out: ProbePlan[] = [];
    for (const value of probe.values) {
      const want = new Decimal(value).times(scale);
      if (!want.isInteger() || want.lte(0)) continue;
      const target = want.toNumber();
      type Line = { code: string; q: number };
      type Plan = { lines: Line[]; score: number };
      const plans: Plan[] = [];
      const score = (lines: Line[], late: boolean) =>
        (late ? 10_000 : 0) + lines.length * 1000 + Math.max(...lines.map((l) => l.q));
      // Fewest lines first: every one-line plan, then two, then three, each record at most once and
      // never more of it than the old app has.
      let steps = 0;
      const search = (rest: number, from: number, left: number, lines: Line[], late: boolean) => {
        if (plans.length >= 60 || steps > SEARCH_BUDGET) return;
        for (let i = from; i < units.length; i++) {
          const a = units[i]!;
          if (left === 1) {
            steps++;
            if (rest % a.unit === 0 && rest / a.unit >= 1 && rest / a.unit <= a.most) {
              const all = [...lines, { code: a.code, q: rest / a.unit }];
              plans.push({ lines: all, score: score(all, late || a.late) });
              if (plans.length >= 60) return;
            }
            continue;
          }
          // The most of this record first: what is left is then small enough for the others.
          for (let q = Math.min(a.most, Math.floor((rest - 1) / a.unit)); q >= 1; q--) {
            if (++steps > SEARCH_BUDGET) return;
            const before = plans.length;
            search(
              rest - q * a.unit,
              i + 1,
              left - 1,
              [...lines, { code: a.code, q }],
              late || a.late,
            );
            if (plans.length > before) break;
          }
        }
      };
      for (let n = 1; n <= MAX_PLAN_LINES && plans.length < PLANS_PER_VALUE * 4; n++) {
        steps = 0;
        search(target, 0, n, [], false);
      }
      plans.sort((x, y) => x.score - y.score);
      const inputs: ActionInputs[] = [];
      for (const p of plans) {
        if (inputs.length >= PLANS_PER_VALUE) break;
        const lines = p.lines.map((l) => ({ [pick.field]: l.code, [qty.name]: String(l.q) }));
        const got = await valueOf(lines);
        if (got && got.times(scale).eq(want)) inputs.push({ lines });
      }
      if (inputs.length) out.push({ probe, value, actionId: action.id, inputs });
    }
    return out;
  };
}

/** The records an action reads, for a store the planner can preview on (the old app's data). */
export type ProbeData = Record<string, DbfRecord[]>;

// The Surgeon (crew.md, Prompt 63): compiles a Soul into the reborn app. It validates the Soul,
// compiles every rule expression, lays out every action for the Vessel, and smoke-tests each one
// on a copy of the old app's records: a sample filled from those records (the first medicine in
// stock, one of it) must go through the rules. The actions that pass are published at the
// project's Vessel URL. Deterministic: no model. It never changes the records it is given.
import type { DbfRecord, DbfValue } from '@afterlife/dbf';
import { SoulSchema, parseExpr, printExpr, type Expr, type Soul } from '@afterlife/soul';
import {
  MemoryEntityStore,
  actionForm,
  createVessel,
  type ActionInputs,
  type EntityStore,
  type FormPart,
} from '@afterlife/vessel';

export type CompiledRule = {
  id: string;
  kind: string;
  target?: string;
  ok: boolean;
  /** The expression as the rule language prints it. */
  canonical?: string;
  /** The values it reads (bill.subtotal), sorted. */
  uses?: string[];
  error?: string;
};

export type SmokeTest = {
  actionId: string;
  name: string;
  ok: boolean;
  /** What was typed in. */
  inputs?: ActionInputs;
  /** Records written per data file. */
  wrote?: Record<string, number>;
  /** The rules' words when it was refused. */
  refused?: string[];
  /** Why it could not be run at all (no rule for what it changes). */
  error?: string;
};

export type VesselConfig = {
  app: { id: string; name: string };
  soulVersion: number;
  url: string;
  actions: {
    id: string;
    name: string;
    /** What the owner types for the record, and for each line. */
    inputs: string[];
    lineInputs: string[];
    /** What the rules work out. */
    worksOut: string[];
    receipt: boolean;
  }[];
};

export type Operation = {
  published: boolean;
  /** Why it could not be published, or what was left out. */
  problems: string[];
  compiled: CompiledRule[];
  smoke: SmokeTest[];
  config: VesselConfig | null;
};

/** The values an expression reads, lambda parameters left out. */
function uses(e: Expr, bound: Set<string> = new Set()): string[] {
  switch (e.type) {
    case 'ref':
      return bound.has(e.path[0]!) ? [] : [e.path.join('.')];
    case 'unary':
      return uses(e.arg, bound);
    case 'binary':
      return [...uses(e.left, bound), ...uses(e.right, bound)];
    case 'if':
      return [...uses(e.cond, bound), ...uses(e.then, bound), ...uses(e.else, bound)];
    case 'call':
      return e.args.flatMap((a) => uses(a, bound));
    case 'lambda':
      return uses(e.body, new Set([...bound, e.param]));
    default:
      return [];
  }
}

function compile(rules: { id: string; kind: string; target?: string; expression: string }[]) {
  return rules.map((r): CompiledRule => {
    const base = { id: r.id, kind: r.kind, ...(r.target ? { target: r.target } : {}) };
    try {
      const ast = parseExpr(r.expression);
      return {
        ...base,
        ok: true,
        canonical: printExpr(ast),
        uses: [...new Set(uses(ast))].sort(),
      };
    } catch (e) {
      return { ...base, ok: false, error: (e as Error).message };
    }
  });
}

const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());

/** A sample value for a field nothing points with: a number, a date, a word. */
function sample(f: FormPart['inputs'][number], today: string): string {
  if (f.type === 'N') return '1';
  if (f.type === 'D') return today.replace(/-/g, '');
  if (f.type === 'L') return 'T';
  return (/PHONE|TEL/.test(f.name) ? '0510000000' : 'SMOKE TEST').slice(0, f.length);
}

/** At most this many records are tried for a line before the smoke test gives up. */
const MAX_TRIES = 25;

async function smokeTest(
  soul: Soul,
  actionId: string,
  records: Record<string, DbfRecord[]>,
  today: string,
): Promise<SmokeTest> {
  const action = soul.actions.find((a) => a.id === actionId)!;
  const head = { actionId, name: action.name };
  let form;
  try {
    form = actionForm(soul, actionId);
  } catch (e) {
    return { ...head, ok: false, error: (e as Error).message };
  }
  const keysOf = (l: FormPart['links'][number]) =>
    (records[l.entity.file.toUpperCase()] ?? [])
      .filter((r) => !r.deleted)
      .map((r) => str(r.values[l.refField]))
      .filter(Boolean);
  // The record's own inputs: a link is left blank when the record may go without it (a walk-in).
  const values: Record<string, string> = {};
  for (const f of form.header.inputs)
    if (!form.header.links.some((l) => l.field === f.name)) values[f.name] = sample(f, today);
  const lineWith = (code: string | null): Record<string, string> => {
    const line: Record<string, string> = {};
    for (const f of form.line?.inputs ?? []) {
      const link = form.line!.links.find((l) => l.field === f.name);
      line[f.name] = link ? (code ?? '') : sample(f, today);
    }
    return line;
  };
  const pick = form.line?.links[0];
  const candidates = pick ? keysOf(pick).slice(0, MAX_TRIES) : [null];
  let last: SmokeTest | null = null;
  for (const code of candidates.length ? candidates : [null]) {
    const inputs: ActionInputs = { values, ...(form.line ? { lines: [lineWith(code)] } : {}) };
    // A fresh copy for each try: the records the Surgeon was given are never changed.
    const store = new MemoryEntityStore();
    for (const [file, rs] of Object.entries(records)) await store.load(file, rs);
    const vessel = createVessel(soul, store, { today: () => today });
    let r;
    try {
      r = await vessel.performAction(actionId, inputs);
    } catch (e) {
      return { ...head, ok: false, inputs, error: (e as Error).message };
    }
    if (r.ok) {
      const wrote = Object.fromEntries(
        Object.entries(r.effects.tables)
          .map(([file, t]) => [file, t.inserted.length + t.updated.length + t.deleted.length])
          .filter(([, n]) => Number(n) > 0),
      );
      return { ...head, ok: true, inputs, wrote };
    }
    last = { ...head, ok: false, inputs, refused: [...new Set(r.refused.map((x) => x.message))] };
  }
  return last ?? { ...head, ok: false, error: 'There was nothing to try it with' };
}

/**
 * Compiles the Soul into the reborn app: what passes is published at `url`. `soul` may be anything
 * (a stored version): it is validated first. `store` has the old app's records.
 */
export async function operate(
  soul: unknown,
  store: EntityStore,
  opts: { today: string; url: string },
): Promise<Operation> {
  const raw = (soul ?? {}) as { rules?: unknown };
  const parsed = SoulSchema.safeParse(soul);
  const compiled = Array.isArray(raw.rules)
    ? compile(
        (
          raw.rules as { id?: unknown; kind?: unknown; target?: unknown; expression?: unknown }[]
        ).map((r) => ({
          id: String(r.id ?? ''),
          kind: String(r.kind ?? ''),
          ...(typeof r.target === 'string' ? { target: r.target } : {}),
          expression: String(r.expression ?? ''),
        })),
      )
    : [];
  if (!parsed.success)
    return {
      published: false,
      problems: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      compiled,
      smoke: [],
      config: null,
    };
  const s = parsed.data;
  if (!s.actions.length)
    return {
      published: false,
      problems: ['The Soul has no actions yet, so there is no app to publish'],
      compiled,
      smoke: [],
      config: null,
    };
  const records: Record<string, DbfRecord[]> = {};
  for (const e of s.entities) records[e.file.toUpperCase()] = await store.records(e.file);
  const smoke: SmokeTest[] = [];
  for (const a of s.actions) smoke.push(await smokeTest(s, a.id, records, opts.today));
  const passed = s.actions.filter((a) => smoke.find((x) => x.actionId === a.id)!.ok);
  const problems = smoke
    .filter((x) => !x.ok)
    .map(
      (x) =>
        `${x.name} is left out: ${x.error ?? `its smoke test was refused (${(x.refused ?? []).join('; ')})`}`,
    );
  if (!passed.length) return { published: false, problems, compiled, smoke, config: null };
  return {
    published: true,
    problems,
    compiled,
    smoke,
    config: {
      app: s.app,
      soulVersion: s.version,
      url: opts.url,
      actions: passed.map((a) => {
        const f = actionForm(s, a.id);
        return {
          id: a.id,
          name: a.name,
          inputs: f.header.inputs.map((x) => x.name),
          lineInputs: f.line?.inputs.map((x) => x.name) ?? [],
          worksOut: f.header.computed.map((x) => x.name),
          receipt: !!a.receipt,
        };
      }),
    },
  };
}

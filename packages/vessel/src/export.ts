// The export (Prompt 62): a project's reborn app as code, for a developer to keep working on in
// Kiro. A standalone Next.js app that runs the Soul in a copy of this runtime (no package of ours
// is needed), the old app's records as its seed, the Kiro spec and steering the Soul writes, and a
// property test suite of the Soul in the runtime. Pure: the caller reads the runtime's source.
import type { DbfRecord } from '@afterlife/dbf';
import { writeKiroSpec, type Soul } from '@afterlife/soul';
import { strToU8, zipSync } from 'fflate';

/** The packages copied into the export, in lib/afterlife/<name>. */
export const RUNTIME_PACKAGES = ['soul', 'dbf', 'vessel'] as const;

/**
 * The versions the export depends on: the ones this repo is tested with
 * (tests/export-versions.test.ts keeps them in step with what is installed).
 */
export const EXPORT_VERSIONS = {
  dependencies: {
    'decimal.js': '10.6.0',
    fflate: '0.8.3',
    next: '15.5.29',
    react: '19.3.1',
    'react-dom': '19.3.1',
    zod: '4.6.7',
  },
  devDependencies: {
    '@types/node': '22.20.5',
    '@types/react': '19.3.0',
    '@types/react-dom': '19.3.0',
    'fast-check': '4.10.2',
    typescript: '5.9.3',
    vitest: '5.1.0',
  },
} as const;

/** Source files that stay behind: tests, the Postgres and IndexedDB stores, the CLI, this. */
const LEFT_OUT = /\.test\.ts$|^(postgres|indexeddb|cli|node|arbitrary|dsl-arbitrary|export)\.ts$/;

/**
 * The runtime's source, as the export has it: each package's top-level source files under
 * lib/afterlife/<package>/, its imports of our other packages made relative, and of the screen
 * package only the code page table the data files are read with.
 */
export function vendorRuntime(
  sources: Partial<Record<(typeof RUNTIME_PACKAGES)[number] | 'screen', Record<string, string>>>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const rewrite = (text: string) =>
    text.replace(/from '@afterlife\/([a-z-]+)'/g, (_, pkg: string) => `from '../${pkg}'`);
  // What a package's index takes from a file left behind goes too.
  const leftOut = (text: string) =>
    text.replace(/export (type )?\{[^}]*\} from '\.\/([a-z0-9-]+)';\n?/g, (all, _t, f: string) =>
      LEFT_OUT.test(`${f}.ts`) ? '' : all,
    );
  for (const pkg of RUNTIME_PACKAGES)
    for (const [file, text] of Object.entries(sources[pkg] ?? {}))
      if (file.endsWith('.ts') && !LEFT_OUT.test(file))
        out[`lib/afterlife/${pkg}/${file}`] = rewrite(leftOut(text));
  const cp437 = sources.screen?.['cp437.ts'];
  if (cp437) out['lib/afterlife/screen/index.ts'] = rewrite(cp437);
  return out;
}

/** A data file's name as a TypeScript identifier (MEDICINE.DBF is MEDICINE). */
const ident = (file: string) => {
  const s = file.replace(/\.DBF$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
  return /^[A-Za-z_]/.test(s) ? s : `T_${s}`;
};
const base = (file: string) => file.replace(/\.DBF$/i, '');

export type ExportInput = {
  soul: Soul;
  /** The old app's records, by data file (MEDICINE.DBF): the reborn app starts from them. */
  records: Record<string, DbfRecord[]>;
  /** vendorRuntime's files. */
  runtime: Record<string, string>;
  /** The old app's date (YYYY-MM-DD), for the tests; the app itself uses today's. */
  oldAppDate?: string;
};

/** The export's files, by path. */
export function buildExport(o: ExportInput): Record<string, string> {
  const { soul } = o;
  const name = `${soul.app.id}-reborn`;
  const files: Record<string, string> = { ...o.runtime };
  const json = (v: unknown) => `${JSON.stringify(v, null, 2)}\n`;
  const date = o.oldAppDate ?? soul.provenance.createdAt.slice(0, 10);

  files['package.json'] = json({
    name,
    version: '0.1.0',
    private: true,
    type: 'module',
    description: `${soul.app.name}, reborn: its Soul (soul.json) run by the Afterlife Vessel runtime.`,
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start',
      test: 'tsc --noEmit && vitest run',
    },
    dependencies: EXPORT_VERSIONS.dependencies,
    devDependencies: EXPORT_VERSIONS.devDependencies,
  });
  files['tsconfig.json'] = json({
    compilerOptions: {
      target: 'ES2022',
      lib: ['ES2022', 'DOM', 'DOM.Iterable'],
      module: 'ESNext',
      moduleResolution: 'Bundler',
      strict: true,
      noUncheckedIndexedAccess: true,
      esModuleInterop: true,
      skipLibCheck: true,
      isolatedModules: true,
      resolveJsonModule: true,
      forceConsistentCasingInFileNames: true,
      noEmit: true,
      jsx: 'preserve',
      allowJs: true,
      incremental: true,
      plugins: [{ name: 'next' }],
    },
    include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '**/*.mts', '.next/types/**/*.ts'],
    exclude: ['node_modules'],
  });
  files['next.config.mjs'] =
    "/** @type {import('next').NextConfig} */\nexport default { reactStrictMode: true };\n";
  files['next-env.d.ts'] =
    '/// <reference types="next" />\n/// <reference types="next/image-types/global" />\n';
  files['vitest.config.mts'] = `import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['tests/**/*.test.ts'], testTimeout: 120_000 } });
`;
  files['.gitignore'] = 'node_modules\n.next\n*.tsbuildinfo\n';

  files['soul.json'] = json(soul);
  for (const [file, records] of Object.entries(o.records))
    files[`data/${base(file)}.json`] = json(records);
  const data = Object.keys(o.records).sort();
  files['lib/seed.ts'] =
    `// The old app's records, the ones the reborn app starts from (one JSON file per data file).
import type { DbfRecord } from './afterlife/dbf';
${data.map((f) => `import ${ident(f)} from '../data/${base(f)}.json';`).join('\n')}

export const SEED: Record<string, DbfRecord[]> = {
${data.map((f) => `  '${f.toUpperCase()}': ${ident(f)} as unknown as DbfRecord[],`).join('\n')}
};
`;
  files['lib/reborn.ts'] =
    `// The reborn app: the Soul (soul.json) in the Vessel runtime, on the old app's records.
import soulJson from '../soul.json';
import { SoulSchema, type Soul } from './afterlife/soul';
import { MemoryEntityStore, createVessel, type Vessel } from './afterlife/vessel';
import { SEED } from './seed';

export const SOUL: Soul = SoulSchema.parse(soulJson);

/** The day the old app's records are from: the tests run on it. */
export const OLD_APP_DATE = '${date}';

/** Today, as the reborn app's date (YYYY-MM-DD). */
export const today = () => new Date().toISOString().slice(0, 10);

/** A fresh copy of the old app's records, in memory. */
export async function seededStore(): Promise<MemoryEntityStore> {
  const store = new MemoryEntityStore();
  for (const [file, records] of Object.entries(SEED)) await store.load(file, records);
  return store;
}

/** The reborn app on a fresh copy of the records. */
export async function openReborn(date: () => string = today): Promise<Vessel> {
  return createVessel(SOUL, await seededStore(), { today: date });
}
`;

  files['app/layout.tsx'] = `import type { ReactNode } from 'react';

export const metadata = { title: ${JSON.stringify(soul.app.name)} };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', background: '#0B0F0C', color: '#EDE6D6' }}>
        {children}
      </body>
    </html>
  );
}
`;
  files['app/page.tsx'] = `import { RebornApp } from './reborn-app';

export default function Page() {
  return <RebornApp />;
}
`;
  files['app/reborn-app.tsx'] = REBORN_APP;
  files['tests/soul.test.ts'] = SOUL_TEST;
  files['tests/runtime.prop.test.ts'] = RUNTIME_TEST;

  for (const [path, text] of Object.entries(writeKiroSpec(soul))) files[path] = text;

  files['README.md'] = `# ${soul.app.name}, reborn

Exported by [Afterlife](https://github.com/FahadRamxan/Afterlife---Kiroween-Hackathon) from Soul version ${soul.version} (${soul.provenance.createdBy}, ${soul.provenance.observationCount} observations).

The app is the Soul (\`soul.json\`: entities, screens, actions and rules) run by the Afterlife Vessel runtime, copied into \`lib/afterlife\`. It starts from the old app's own records (\`data/\`).

\`\`\`
pnpm install
pnpm dev      # the reborn app at http://localhost:3000
pnpm test     # TypeScript, then the property suite in tests/
\`\`\`

- \`.kiro/specs/${soul.app.id}-rebirth/\` and \`.kiro/steering/legacy-behaviour.md\`: what the old app did, for Kiro. \`tests/soul.test.ts\` checks they are the ones this Soul writes, so change the Soul and regenerate them together.
- \`tests/runtime.prop.test.ts\`: properties of every action, on any inputs (fast-check): the same inputs give the same effects, what is saved is what the effects say, a refused action changes nothing, and money keeps its field's places.
- Money is decimal (decimal.js), never floating point. The rules are expressions in the Soul's rule language (\`lib/afterlife/soul/dsl.ts\`): no \`eval\`.
`;
  return Object.fromEntries(Object.entries(files).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
}

/** The export as a zip, every file under one folder (`shifa-reborn/`). */
export function exportZip(files: Record<string, string>, root: string): Uint8Array {
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([p, text]) => [`${root}/${p}`, strToU8(text)])),
    { mtime: new Date('2026-01-01T00:00:00Z') },
  );
}

const REBORN_APP = `'use client';
// The reborn app's screen: each action of the Soul as a form. The Vessel works out the rest from
// the rules as the owner types, and Save does it for real, with the receipt the old app showed.
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import {
  actionForm,
  receiptOf,
  receiptText,
  type ActionResult,
  type Vessel,
} from '../lib/afterlife/vessel';
import { SOUL, openReborn } from '../lib/reborn';

type Line = Record<string, string>;

const page: CSSProperties = { maxWidth: 760, margin: '0 auto', padding: 16 };
const button: CSSProperties = { minHeight: 44, padding: '0 14px', borderRadius: 8, cursor: 'pointer' };
const input: CSSProperties = { minHeight: 40, padding: '0 8px', borderRadius: 6, width: '100%' };

export function RebornApp() {
  const [vessel, setVessel] = useState<Vessel | null>(null);
  const [actionId, setActionId] = useState(SOUL.actions[0]?.id ?? '');
  useEffect(() => {
    void openReborn().then(setVessel);
  }, []);
  return (
    <main style={page}>
      <h1>{SOUL.app.name}</h1>
      {!vessel ? (
        <p>Opening the records…</p>
      ) : (
        <>
          <nav aria-label="Actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {SOUL.actions.map((a) => (
              <button
                key={a.id}
                type="button"
                aria-pressed={a.id === actionId}
                onClick={() => setActionId(a.id)}
                style={button}
              >
                {a.name}
              </button>
            ))}
          </nav>
          {actionId ? (
            <ActionView key={actionId} vessel={vessel} actionId={actionId} />
          ) : (
            <p>This Soul has no actions yet.</p>
          )}
        </>
      )}
    </main>
  );
}

function ActionView({ vessel, actionId }: { vessel: Vessel; actionId: string }) {
  const form = useMemo(() => actionForm(vessel.soul, actionId), [vessel, actionId]);
  const [values, setValues] = useState<Line>({});
  const [lines, setLines] = useState<Line[]>(form.line ? [{}] : []);
  const [preview, setPreview] = useState<ActionResult | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const inputs = useMemo(
    () => ({ values, ...(form.line ? { lines } : {}) }),
    [values, lines, form.line],
  );
  useEffect(() => {
    let alive = true;
    void vessel.previewAction(actionId, inputs).then((r) => {
      if (alive) setPreview(r);
    });
    return () => {
      alive = false;
    };
  }, [vessel, actionId, inputs]);

  async function save() {
    const r = await vessel.performAction(actionId, inputs);
    if (!r.ok) return setPreview(r);
    setReceipt(receiptText(await receiptOf(vessel.soul, actionId, r, vessel.store)));
    setValues({});
    setLines(form.line ? [{}] : []);
  }

  const setLine = (i: number, field: string, v: string) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, [field]: v } : l)));

  return (
    <section aria-label={form.action.name} style={{ marginTop: 16, display: 'grid', gap: 12 }}>
      <h2>{form.action.name}</h2>
      {form.header.inputs.map((f) => (
        <label key={f.name} style={{ display: 'grid', gap: 4 }}>
          {f.name}
          <input
            style={input}
            value={values[f.name] ?? ''}
            maxLength={f.length}
            onChange={(e) => setValues({ ...values, [f.name]: e.target.value.toUpperCase() })}
          />
        </label>
      ))}
      {form.line ? (
        <fieldset style={{ display: 'grid', gap: 8 }}>
          <legend>{form.line.entity.name}</legend>
          {lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'end' }}>
              {form.line!.inputs.map((f) => (
                <label key={f.name} style={{ display: 'grid', gap: 4, flex: 1 }}>
                  {f.name} (line {i + 1})
                  <input
                    style={input}
                    value={l[f.name] ?? ''}
                    maxLength={f.length}
                    onChange={(e) => setLine(i, f.name, e.target.value.toUpperCase())}
                  />
                </label>
              ))}
              <button type="button" style={button} onClick={() => setLines(lines.filter((_, j) => j !== i))}>
                Remove
              </button>
            </div>
          ))}
          <button type="button" style={button} onClick={() => setLines([...lines, {}])}>
            Add a line
          </button>
        </fieldset>
      ) : null}
      {preview?.ok ? (
        <dl aria-label="Worked out by the Soul">
          {form.header.computed.map((f) => (
            <div key={f.name} style={{ display: 'flex', justifyContent: 'space-between' }}>
              <dt>{f.name}</dt>
              <dd>{String(preview.record[f.name] ?? '')}</dd>
            </div>
          ))}
        </dl>
      ) : preview ? (
        <ul>
          {preview.refused.map((r, i) => (
            <li key={i} role="alert">
              {r.line ? \`Line \${r.line}: \` : ''}
              {r.message}
            </li>
          ))}
        </ul>
      ) : null}
      <button type="button" style={button} disabled={!preview?.ok} onClick={() => void save()}>
        Save
      </button>
      {receipt ? <pre aria-label="Receipt">{receipt}</pre> : null}
    </section>
  );
}
`;

const SOUL_TEST = `// The Soul and what it writes: valid, every rule readable, every action laid out, and the Kiro
// files in .kiro the ones this Soul writes (change the Soul and regenerate them together).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SoulSchema, parseExpr, writeKiroSpec } from '../lib/afterlife/soul';
import { actionForm } from '../lib/afterlife/vessel';
import { SOUL } from '../lib/reborn';
import { SEED } from '../lib/seed';
import soulJson from '../soul.json';

describe('the Soul', () => {
  it('is a valid Soul', () => {
    expect(SoulSchema.safeParse(soulJson).success).toBe(true);
  });

  it('every rule is an expression of the rule language', () => {
    for (const r of SOUL.rules) expect(() => parseExpr(r.expression), r.id).not.toThrow();
  });

  it('every action can be laid out as a form', () => {
    for (const a of SOUL.actions) expect(actionForm(SOUL, a.id).action.id).toBe(a.id);
  });

  it('the seed has the records of every entity', () => {
    for (const e of SOUL.entities) expect(SEED, e.file).toHaveProperty([e.file.toUpperCase()]);
  });

  it('the Kiro spec and steering in .kiro are the ones this Soul writes', () => {
    for (const [path, text] of Object.entries(writeKiroSpec(SOUL)))
      expect(readFileSync(resolve(__dirname, '..', path), 'utf8'), path).toBe(text);
  });
});
`;

const RUNTIME_TEST = `// Properties of every action of the Soul in the runtime, on inputs fast-check makes up: values
// for each field the action asks for, and records it points at taken from the seed.
import Decimal from 'decimal.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { DbfField, DbfRecord } from '../lib/afterlife/dbf';
import { actionForm, type ActionInputs, type FormPart } from '../lib/afterlife/vessel';
import { OLD_APP_DATE, SOUL, openReborn } from '../lib/reborn';
import { SEED } from '../lib/seed';

const RUNS = Number(process.env.FC_NUM_RUNS ?? 50);
const day = () => OLD_APP_DATE;
const text = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());

/** The values a field may get: a record the field points at, or a plain value of its type. */
function valueOf(f: DbfField, part: FormPart): fc.Arbitrary<string> {
  const link = part.links.find((l) => l.field === f.name);
  if (link) {
    const keys = (SEED[link.entity.file.toUpperCase()] ?? [])
      .filter((r) => !r.deleted)
      .map((r) => text(r.values[link.refField]))
      .filter(Boolean);
    return keys.length ? fc.constantFrom(...keys) : fc.constant('');
  }
  if (f.type === 'N') return fc.integer({ min: 1, max: 20 }).map(String);
  if (f.type === 'D') return fc.constant(OLD_APP_DATE.replace(/-/g, ''));
  if (f.type === 'L') return fc.constantFrom('T', 'F');
  return fc
    .string({ unit: fc.constantFrom(...'ABCDEFGHIJ0123456789 '), minLength: 1, maxLength: 10 })
    .map((s) => s.slice(0, f.length));
}

const valuesOf = (part: FormPart) =>
  fc.record(Object.fromEntries(part.inputs.map((f) => [f.name, valueOf(f, part)])));

function inputsFor(actionId: string): fc.Arbitrary<ActionInputs> {
  const form = actionForm(SOUL, actionId);
  return fc.record({
    values: valuesOf(form.header),
    ...(form.line ? { lines: fc.array(valuesOf(form.line), { minLength: 1, maxLength: 3 }) } : {}),
  });
}

async function everything(v: Awaited<ReturnType<typeof openReborn>>) {
  const out: Record<string, DbfRecord[]> = {};
  for (const e of SOUL.entities) out[e.file] = await v.store.records(e.file);
  return out;
}

/** Every number it wrote has no more decimal places than its field. */
function placesOk(file: string, values: Record<string, unknown>) {
  const e = SOUL.entities.find((x) => x.file.toUpperCase() === file.toUpperCase());
  for (const f of e?.fields ?? []) {
    const v = text(values[f.name]);
    if (f.type !== 'N' || !/^-?\\d+(\\.\\d+)?$/.test(v)) continue;
    expect(new Decimal(v).decimalPlaces(), \`\${file} \${f.name} = \${v}\`).toBeLessThanOrEqual(f.decimals);
  }
}

for (const action of SOUL.actions)
  describe(action.name, () => {
    it('the same inputs on the same records give the same result (deterministic)', async () => {
      await fc.assert(
        fc.asyncProperty(inputsFor(action.id), async (inputs) => {
          const [a, b] = [await openReborn(day), await openReborn(day)];
          expect(await a.performAction(action.id, inputs)).toEqual(
            await b.performAction(action.id, inputs),
          );
        }),
        { numRuns: RUNS },
      );
    });

    it('what it saves is what its effects say, with money to its field’s places', async () => {
      await fc.assert(
        fc.asyncProperty(inputsFor(action.id), async (inputs) => {
          const v = await openReborn(day);
          const before = await everything(v);
          const r = await v.performAction(action.id, inputs);
          const after = await everything(v);
          if (!r.ok) {
            // A refused action changes nothing.
            expect(after).toEqual(before);
            return;
          }
          for (const [file, t] of Object.entries(r.effects.tables)) {
            const stored = after[SOUL.entities.find((e) => e.file.toUpperCase() === file.toUpperCase())!.file]!;
            for (const ins of t.inserted) {
              expect(stored.map((x) => x.values)).toContainEqual(ins.values);
              placesOk(file, ins.values);
            }
            expect(stored.length).toBe(
              before[SOUL.entities.find((e) => e.file.toUpperCase() === file.toUpperCase())!.file]!
                .length + t.inserted.length,
            );
          }
        }),
        { numRuns: RUNS },
      );
    });
  });
`;

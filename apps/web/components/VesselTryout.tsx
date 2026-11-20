'use client';
import type { DbfFile, DbfRecord, DbfValue, TableDiff } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { Button, Card, DbfDiffView } from '@afterlife/ui';
import {
  actionForm,
  createVessel,
  type ActionForm,
  type ActionResult,
  type MemoryEntityStore,
} from '@afterlife/vessel';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { seededStore } from '../lib/vessel-seed';

type Line = Record<string, string>;
type Ran = {
  result: ActionResult;
  before: Record<string, DbfRecord[]>;
  after: Record<string, DbfRecord[]>;
};

/**
 * Run one of the Soul's actions in the Vessel runtime (Prompt 58), on the old app's own data files,
 * and see its effects in the same diff view as the old app's. A developer's view: the owner's app
 * is the Vessel page (Prompt 59).
 */
export function VesselTryout({
  soul,
  bundle,
  dosTime,
}: {
  soul: Soul;
  /** The old app's js-dos bundle (its data files are read out of it); null for an upload. */
  bundle: string | null;
  /** The old PC's clock ("1998-07-15 10:00:00"). */
  dosTime: string | null;
}) {
  const t = useTranslations('raise.soul.vessel');
  const store = useRef<MemoryEntityStore | null>(null);
  const [tables, setTables] = useState<Record<string, DbfFile> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState(soul.actions[0]?.id ?? '');
  const [values, setValues] = useState<Line>({});
  const [lines, setLines] = useState<Line[]>([{}]);
  const [ran, setRan] = useState<Ran | null>(null);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);
  const actionSelect = useId();

  const form = useMemo((): ActionForm | string | null => {
    if (!actionId) return null;
    try {
      return actionForm(soul, actionId);
    } catch (e) {
      return (e as Error).message;
    }
  }, [soul, actionId]);

  useEffect(() => {
    if (!bundle) return;
    let alive = true;
    setTables(null);
    fetch(bundle)
      .then((r) => {
        if (!r.ok) throw new Error(t('bundleFailed', { status: r.status }));
        return r.arrayBuffer();
      })
      .then((b) => seededStore(new Uint8Array(b), soul))
      .then((s) => {
        if (!alive) return;
        store.current = s.store;
        setTables(s.tables);
      })
      .catch((e: unknown) => alive && setError((e as Error).message));
    return () => {
      alive = false;
    };
  }, [bundle, soul, generation, t]);

  const heading = (
    <>
      <h2 id="vessel-tryout-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-bone/75">{t('body')}</p>
    </>
  );
  const shell = (children: React.ReactNode) => (
    <section
      aria-labelledby="vessel-tryout-heading"
      data-testid="vessel-tryout"
      data-ready={tables && typeof form === 'object' && form ? 'true' : 'false'}
      className="space-y-3"
    >
      {heading}
      {children}
    </section>
  );
  if (!soul.actions.length) return shell(<p className="text-sm text-bone/70">{t('noActions')}</p>);
  if (!bundle) return shell(<p className="text-sm text-bone/70">{t('noData')}</p>);
  if (error)
    return shell(
      <p role="alert" className="text-sm">
        {error}
      </p>,
    );
  if (typeof form === 'string')
    return shell(
      <p role="alert" className="text-sm">
        {t('cannotRun', { message: form })}
      </p>,
    );
  if (!tables || !form) return shell(<p className="text-sm text-bone/70">{t('loading')}</p>);

  async function run() {
    if (!store.current || !form || typeof form === 'string') return;
    setBusy(true);
    const files = soul.entities.map((e) => e.file);
    const read = async () =>
      Object.fromEntries(
        await Promise.all(files.map(async (f) => [f, await store.current!.records(f)] as const)),
      );
    const before = await read();
    const v = createVessel(soul, store.current, { today: () => (dosTime ?? '').slice(0, 10) });
    const filled = (l: Line) =>
      Object.fromEntries(Object.entries(l).filter(([, x]) => x.trim() !== ''));
    const result = await v.performAction(actionId, {
      values: filled(values),
      ...(form.line ? { lines: lines.map(filled).filter((l) => Object.keys(l).length) } : {}),
    });
    setRan({ result, before, after: await read() });
    setBusy(false);
  }

  const input = (name: string, label: string, value: string, set: (v: string) => void) => (
    <label key={name} className="flex flex-col gap-1 text-sm">
      <span className="font-mono">{label}</span>
      <input
        value={value}
        onChange={(e) => set(e.target.value)}
        dir="ltr"
        lang="en"
        spellCheck={false}
        className="min-h-11 rounded-md border border-bone/30 bg-graveyard px-2 font-mono text-sm"
      />
    </label>
  );
  const entityOf = (file: string) => soul.entities.find((e) => e.file === file)!;
  return shell(
    <>
      <Card className="flex flex-col gap-3">
        {soul.actions.length > 1 ? (
          <label htmlFor={actionSelect} className="flex flex-col gap-1 text-sm">
            {t('action')}
            <select
              id={actionSelect}
              value={actionId}
              onChange={(e) => {
                setActionId(e.target.value);
                setRan(null);
              }}
              className="min-h-11 rounded-md bg-graveyard p-2 text-sm"
            >
              {soul.actions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        {form.header.inputs.length ? (
          <fieldset className="grid gap-2 sm:grid-cols-3">
            <legend className="text-sm font-semibold">{form.header.entity.name}</legend>
            {form.header.inputs.map((f) =>
              input(f.name, f.name, values[f.name] ?? '', (x) =>
                setValues({ ...values, [f.name]: x }),
              ),
            )}
          </fieldset>
        ) : null}
        {form.line ? (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">
              {t('lines', { name: form.line.entity.name })}
            </legend>
            {lines.map((l, i) => (
              <div key={i} data-testid="vessel-line" className="flex flex-wrap items-end gap-2">
                <span className="pb-3 font-mono text-sm">{i + 1}.</span>
                {form.line!.inputs.map((f) =>
                  input(`${i}-${f.name}`, f.name, l[f.name] ?? '', (x) =>
                    setLines(lines.map((y, j) => (j === i ? { ...y, [f.name]: x } : y))),
                  ),
                )}
                {lines.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    aria-label={t('removeLine', { n: i + 1 })}
                  >
                    {t('remove')}
                  </Button>
                ) : null}
              </div>
            ))}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLines([...lines, {}])}
            >
              {t('addLine')}
            </Button>
          </fieldset>
        ) : null}
        <p className="text-xs text-bone/70">
          {t('computed', {
            fields: [...form.header.computed, ...(form.line?.computed ?? [])]
              .map((f) => f.name)
              .join(', '),
          })}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={run} disabled={busy}>
            {t('run', { name: form.action.name })}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setRan(null);
              setGeneration((g) => g + 1);
            }}
          >
            {t('reset')}
          </Button>
        </div>
      </Card>
      {ran ? <Outcome ran={ran} entityOf={entityOf} /> : null}
    </>,
  );
}

function Outcome({
  ran,
  entityOf,
}: {
  ran: Ran;
  entityOf: (file: string) => { name: string; fields: DbfFile['fields'] };
}) {
  const t = useTranslations('raise.soul.vessel');
  if (!ran.result.ok)
    return (
      <div role="alert" data-testid="vessel-refused" className="space-y-1 text-sm">
        <p className="font-semibold">{t('refused')}</p>
        <ul className="list-disc ps-5">
          {ran.result.refused.map((r, i) => (
            <li key={i}>
              {r.line ? `${t('line', { n: r.line })}: ` : ''}
              {r.message}
            </li>
          ))}
        </ul>
      </div>
    );
  const { record, effects } = ran.result;
  const shown = (v: DbfValue) => (v === null ? '' : String(v));
  return (
    <div data-testid="vessel-result" aria-live="polite" className="space-y-3">
      <dl
        className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm"
        lang="en"
        dir="ltr"
      >
        {Object.entries(record).map(([k, v]) => (
          <div key={k} className="contents" data-testid={`vessel-value-${k}`}>
            <dt className="text-bone/70">{k}</dt>
            <dd>{shown(v)}</dd>
          </div>
        ))}
      </dl>
      {Object.entries(effects.tables).map(([file, diff]: [string, TableDiff]) => {
        const e = entityOf(file);
        return (
          <DbfDiffView
            key={file}
            caption={t('effects', { file, name: e.name })}
            before={{ fields: e.fields, records: ran.before[file] ?? [] }}
            after={{ fields: e.fields, records: ran.after[file] ?? [] }}
            diff={diff}
            height={220}
          />
        );
      })}
    </div>
  );
}

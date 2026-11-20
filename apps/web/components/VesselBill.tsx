'use client';
import type { DbfField, DbfRecord, DbfValue } from '@afterlife/dbf';
import { Button, Card, cn } from '@afterlife/ui';
import { actionForm, type ActionResult, type Vessel } from '@afterlife/vessel';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';
import { useWord } from '../lib/use-word';
import { displayValue, money, searchRecords } from '../lib/vessel-views';

type Line = Record<string, string>;

/**
 * An action as a fast form (Prompt 59), for saving a bill: search the medicine as you type, tap it
 * to add a line, set the quantity with big buttons, and watch the total the Soul's own rules work
 * out (the Vessel previews the action on every change). Save does the action for real.
 */
export function VesselBill({
  vessel,
  actionId,
  dataVersion = 0,
  onSaved,
}: {
  vessel: Vessel;
  actionId: string;
  /** Changes when the records changed under the form (the server's came back). */
  dataVersion?: number;
  onSaved: () => void | Promise<void>;
}) {
  const t = useTranslations('vessel.bill');
  const word = useWord();
  const form = useMemo(() => actionForm(vessel.soul, actionId), [vessel, actionId]);
  const pick = form.line?.links[0] ?? null;
  const headerLink = form.header.links[0] ?? null;
  const qtyField = form.line?.inputs.find((f) => f.name !== pick?.field && f.type === 'N') ?? null;
  const otherLineInputs =
    form.line?.inputs.filter((f) => f !== qtyField && f.name !== pick?.field) ?? [];
  const pickId = useId();
  const custId = useId();

  const [catalogue, setCatalogue] = useState<DbfRecord[]>([]);
  const [people, setPeople] = useState<DbfRecord[]>([]);
  const [values, setValues] = useState<Line>({});
  const [lines, setLines] = useState<Line[]>([]);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState<ActionResult | null>(null);
  const [done, setDone] = useState<{ key: string; total: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [generation, setGeneration] = useState(0);

  useEffect(() => {
    let alive = true;
    if (pick) vessel.store.records(pick.entity.file).then((r) => alive && setCatalogue(r));
    if (headerLink) vessel.store.records(headerLink.entity.file).then((r) => alive && setPeople(r));
    return () => {
      alive = false;
    };
  }, [vessel, pick, headerLink, generation, dataVersion]);

  const inputs = useMemo(
    () => ({
      values: Object.fromEntries(Object.entries(values).filter(([, v]) => v.trim())),
      ...(form.line ? { lines } : {}),
    }),
    [values, lines, form.line],
  );
  useEffect(() => {
    let alive = true;
    if (form.line && !lines.length) {
      setPreview(null);
      return;
    }
    vessel.previewAction(actionId, inputs).then((r) => alive && setPreview(r));
    return () => {
      alive = false;
    };
  }, [vessel, actionId, inputs, form.line, lines.length]);

  // What a picked record is called, and its numbers (price, stock).
  const pickEntity = pick?.entity;
  const nameField = pickEntity?.fields.find((f) => f.type === 'C' && f.name !== pick?.refField);
  const pickNumbers = pickEntity?.fields.filter((f) => f.type === 'N') ?? [];
  const byKey = (code: string) =>
    catalogue.find((r) => !r.deleted && String(r.values[pick!.refField] ?? '') === code);
  const results = pick
    ? searchRecords(catalogue, query, [pick.refField, ...(nameField ? [nameField.name] : [])], 6)
    : [];

  function add(r: DbfRecord) {
    const code = String(r.values[pick!.refField] ?? '');
    const at = lines.findIndex((l) => l[pick!.field] === code);
    if (at >= 0 && qtyField) {
      setLines(
        lines.map((l, i) =>
          i === at ? { ...l, [qtyField.name]: String(Number(l[qtyField.name] ?? '0') + 1) } : l,
        ),
      );
    } else
      setLines([...lines, { [pick!.field]: code, ...(qtyField ? { [qtyField.name]: '1' } : {}) }]);
    setQuery('');
    setDone(null);
  }
  const setLine = (i: number, patch: Line) =>
    setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save() {
    setBusy(true);
    const r = await vessel.performAction(actionId, inputs);
    setBusy(false);
    if (!r.ok) return setPreview(r);
    const key = form.header.entity.key[0];
    const total = [...form.header.computed].reverse().find((f) => f.type === 'N');
    setDone({
      key: key ? String(r.record[key] ?? '') : '',
      total: total ? money(r.record[total.name]) : '',
    });
    setLines([]);
    setValues({});
    setPreview(null);
    setGeneration((g) => g + 1);
    await onSaved();
  }

  const refusedFor = (line?: number) =>
    preview && !preview.ok
      ? preview.refused.filter((r) => (line === undefined ? !r.line : r.line === line))
      : [];
  const totals = form.header.computed.filter((f) => f.type === 'N');
  const record = preview?.ok ? preview.record : null;
  const show = (f: DbfField, v: DbfValue | undefined) => displayValue(f, v);

  return (
    <div className="space-y-4" data-testid="vessel-bill">
      {done ? (
        <p
          role="status"
          data-testid="vessel-saved"
          className="rounded-lg border border-ectoplasm/50 bg-ectoplasm/10 p-3"
        >
          {t('saved', { key: done.key, total: done.total })}
        </p>
      ) : null}

      {headerLink ? (
        <div className="space-y-1">
          <label htmlFor={custId} className="text-sm font-medium">
            {t('who', { name: word(headerLink.entity.name) })}
          </label>
          <input
            id={custId}
            list={`${custId}-list`}
            value={values[headerLink.field] ?? ''}
            onChange={(e) =>
              setValues({ ...values, [headerLink.field]: e.target.value.toUpperCase() })
            }
            placeholder={t('walkIn')}
            dir="ltr"
            lang="en"
            className="min-h-12 w-full rounded-lg border border-bone/25 bg-graveyard px-3 text-base"
          />
          <datalist id={`${custId}-list`}>
            {people
              .filter((r) => !r.deleted)
              .map((r) => {
                const id = String(r.values[headerLink.refField] ?? '');
                const nm = headerLink.entity.fields.find(
                  (f) => f.type === 'C' && f.name !== headerLink.refField,
                );
                return (
                  <option key={id} value={id}>
                    {nm ? String(r.values[nm.name] ?? '') : id}
                  </option>
                );
              })}
          </datalist>
        </div>
      ) : null}

      {pick ? (
        <div className="relative space-y-1">
          <label htmlFor={pickId} className="text-sm font-medium">
            {t('find', { name: word(pick.entity.name) })}
          </label>
          <input
            id={pickId}
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={`${pickId}-results`}
            autoComplete="off"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && results[0]) {
                e.preventDefault();
                add(results[0]);
              }
            }}
            placeholder={t('findHint')}
            className="min-h-12 w-full rounded-lg border border-bone/25 bg-graveyard px-3 text-base"
          />
          {results.length ? (
            <ul
              id={`${pickId}-results`}
              role="listbox"
              aria-label={t('results')}
              className="space-y-1"
            >
              {results.map((r) => {
                const code = String(r.values[pick.refField] ?? '');
                return (
                  <li key={code} role="option" aria-selected={false}>
                    <button
                      type="button"
                      onClick={() => add(r)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-bone/15 px-3 text-start hover:border-ectoplasm/60"
                    >
                      <span>
                        <span className="block font-medium" lang="en" dir="ltr">
                          {nameField ? String(r.values[nameField.name] ?? '') : code}
                        </span>
                        <span className="block text-xs text-bone/70" lang="en" dir="ltr">
                          {code}
                        </span>
                      </span>
                      <span className="text-end text-xs text-bone/75">
                        {pickNumbers.map((f) => (
                          <span key={f.name} className="block">
                            {word(f.name)}:{' '}
                            <span className="tabular-nums" lang="en" dir="ltr">
                              {show(f, r.values[f.name])}
                            </span>
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {form.line ? (
        <ol aria-label={t('lines')} className="space-y-2">
          {lines.map((l, i) => {
            const r = pick ? byKey(l[pick.field] ?? '') : undefined;
            const done_ = preview?.ok ? preview.lines[i] : undefined;
            const amount = form
              .line!.computed.filter((f) => f.type === 'N' && f.decimals > 0)
              .at(-1);
            return (
              <li key={i} data-testid="vessel-bill-line">
                <Card className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium" lang="en" dir="ltr">
                      {r && nameField
                        ? String(r.values[nameField.name] ?? '')
                        : l[pick?.field ?? '']}
                    </p>
                    <p
                      className="tabular-nums"
                      lang="en"
                      dir="ltr"
                      data-testid="vessel-line-amount"
                    >
                      {amount && done_ ? money(done_[amount.name]) : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {qtyField ? (
                      <>
                        <Button
                          type="button"
                          variant="secondary"
                          className="size-12 text-lg"
                          aria-label={t('less', { n: i + 1 })}
                          onClick={() =>
                            setLine(i, {
                              [qtyField.name]: String(
                                Math.max(0, Number(l[qtyField.name] ?? '0') - 1),
                              ),
                            })
                          }
                        >
                          −
                        </Button>
                        <input
                          aria-label={t('qty', { n: i + 1 })}
                          inputMode="numeric"
                          value={l[qtyField.name] ?? ''}
                          onChange={(e) =>
                            setLine(i, { [qtyField.name]: e.target.value.replace(/[^\d]/g, '') })
                          }
                          className="min-h-12 w-20 rounded-lg border border-bone/25 bg-graveyard text-center text-lg tabular-nums"
                          lang="en"
                          dir="ltr"
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          className="size-12 text-lg"
                          aria-label={t('more', { n: i + 1 })}
                          onClick={() =>
                            setLine(i, {
                              [qtyField.name]: String(Number(l[qtyField.name] ?? '0') + 1),
                            })
                          }
                        >
                          +
                        </Button>
                      </>
                    ) : null}
                    {otherLineInputs.map((f) => (
                      <input
                        key={f.name}
                        aria-label={`${word(f.name)} ${i + 1}`}
                        value={l[f.name] ?? ''}
                        onChange={(e) => setLine(i, { [f.name]: e.target.value })}
                        className="min-h-12 rounded-lg border border-bone/25 bg-graveyard px-2"
                      />
                    ))}
                    <Button
                      type="button"
                      variant="ghost"
                      className="ms-auto min-h-12"
                      aria-label={t('remove', { n: i + 1 })}
                      onClick={() => setLines(lines.filter((_, j) => j !== i))}
                    >
                      {t('removeShort')}
                    </Button>
                  </div>
                  {refusedFor(i + 1).map((x, k) => (
                    <p key={k} role="alert" className="text-sm text-blood">
                      {x.message}
                    </p>
                  ))}
                </Card>
              </li>
            );
          })}
        </ol>
      ) : null}
      {form.line && !lines.length ? <p className="text-sm text-bone/70">{t('empty')}</p> : null}
      {refusedFor().map((x, k) => (
        <p key={k} role="alert" className="text-sm text-blood">
          {x.message}
        </p>
      ))}

      {/* The running total, worked out by the Soul's rules: sticky over the bottom navigation. */}
      <Card
        data-testid="vessel-totals"
        aria-live="polite"
        className="sticky bottom-20 z-10 space-y-1 bg-graveyard md:bottom-4"
      >
        <dl className="space-y-1">
          {totals.map((f, i) => {
            const last = i === totals.length - 1;
            return (
              <div
                key={f.name}
                data-testid={`vessel-total-${f.name}`}
                className={cn(
                  'flex justify-between gap-3',
                  last ? 'border-t border-bone/15 pt-2 text-xl font-semibold' : 'text-sm',
                )}
              >
                <dt>{word(f.name)}</dt>
                <dd className="tabular-nums" lang="en" dir="ltr">
                  {record ? money(record[f.name]) : money('0.00')}
                </dd>
              </div>
            );
          })}
        </dl>
        <Button
          type="button"
          className="mt-2 min-h-14 w-full text-lg"
          onClick={save}
          disabled={busy || (form.line !== null && !lines.length) || !preview?.ok}
        >
          {word(form.action.name)}
        </Button>
      </Card>
    </div>
  );
}

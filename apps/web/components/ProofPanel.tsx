'use client';
import { CRTFrame, DiffBadge, ProgressCandle } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { proofCounter, type Proof, type ProofCaseEvent, type ProofProgress } from '../lib/proof';

const API = process.env.NEXT_PUBLIC_API_URL;

const inputsText = (c: Pick<ProofCaseEvent, 'inputs'>) => {
  const lines = (c.inputs.lines ?? []).map((l) => Object.values(l).join(' x ')).join(', ');
  const values = Object.entries(c.inputs.values ?? {})
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `${k} ${v}`)
    .join(', ');
  return [values, lines].filter(Boolean).join(' · ') || '—';
};

/** What one side wrote: its fields and values, in the data file's own words. */
function Written({ values, label }: { values: Record<string, string> | null; label: string }) {
  if (!values) return <p className="text-sm text-bone/70">{label}</p>;
  return (
    <dl lang="en" dir="ltr" className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 font-mono text-sm">
      {Object.entries(values).map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-bone/70">{k}</dt>
          <dd className="text-bone">{v.trim() || '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * The Proof tab (Prompt 70): the Oracle running cases on the old app and the reborn app. Left, the
 * old app's screen after the case just run (the real program, in its CRT frame); right, what the
 * reborn app wrote for the same case. A counter "N / M cases · K differences" with a candle, the
 * log of cases, and, once done, a red badge for a difference that opens the shrunk counterexample.
 */
export function ProofPanel({
  name,
  progress,
  proof,
}: {
  name: string;
  progress: ProofProgress | null;
  proof: Proof | null;
}) {
  const t = useTranslations('raise.proof');
  const [open, setOpen] = useState(false);
  const detail = useId();
  if (!progress && !proof) return null;
  const done = proof?.numRuns ?? progress?.done ?? 0;
  const of = proof?.numRuns ?? progress?.of ?? 0;
  const failed = proof?.failed ?? progress?.failed ?? 0;
  const skipped = proof?.skipped ?? progress?.skipped ?? 0;
  const accepted = proof?.accepted ?? progress?.accepted ?? 0;
  const latest = progress?.latest ?? null;
  const cx = proof?.counterexample ?? null;
  return (
    <section aria-labelledby="proof-title" data-testid="proof-panel" className="mt-6 space-y-4">
      <h3 id="proof-title" className="text-lg font-semibold">
        {t('title')}
      </h3>
      <div className="flex items-center gap-6">
        <ProgressCandle value={done} max={of} label={t('candle', { done, of })} />
        <div>
          <p
            data-testid="proof-counter"
            lang="en"
            dir="ltr"
            className={`font-mono text-2xl ${failed ? 'text-blood' : 'text-ectoplasm'}`}
          >
            {proofCounter({ done, of, failed })}
          </p>
          {skipped ? <p className="text-sm text-bone/70">{t('skipped', { n: skipped })}</p> : null}
          {accepted ? (
            <p data-testid="proof-accepted" className="text-sm text-candle">
              {t('accepted', { n: accepted })}
            </p>
          ) : null}
          {proof?.reused ? (
            <p className="text-sm text-bone/70">{t('reused', { n: proof.reused })}</p>
          ) : null}
          {proof?.acceptedDivergences.length ? (
            <ul data-testid="proof-divergences" className="mt-1 text-sm text-bone">
              {proof.acceptedDivergences.map((d) => (
                <li key={d.id}>
                  {t('divergence')}{' '}
                  <span lang="en" dir="ltr">
                    {d.text}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {proof?.notReborn.length ? (
            <div data-testid="proof-not-reborn" className="mt-2 text-sm">
              <p className="font-semibold text-candle">{t('notRebornTitle')}</p>
              <ul className="mt-1 space-y-1 text-bone">
                {proof.notReborn.map((n) => (
                  <li key={n.actionId} data-action={n.actionId}>
                    <span lang="en" dir="ltr" className="font-semibold">
                      {n.name}
                    </span>
                    {': '}
                    <span lang="en" dir="ltr" className="text-bone/80">
                      {n.reason}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {proof ? (
            <p data-testid="proof-done" className="text-sm text-bone/70">
              {failed
                ? t('doneDifferent', { version: proof.soulVersion })
                : t('doneSame', { version: proof.soulVersion })}{' '}
              <span lang="en" dir="ltr" className="font-mono">
                {t('seed', { seed: proof.seed })}
              </span>
            </p>
          ) : null}
        </div>
      </div>
      {proof?.certificate.id ? (
        <p
          data-testid="proof-certificate"
          className="rounded-lg border border-ectoplasm/50 p-3 text-bone"
        >
          {t('certificate.issued')}{' '}
          <a
            href={`${API ?? ''}/api/certificates/${proof.certificate.id}?download=1`}
            className="text-ectoplasm underline"
          >
            {t('certificate.download')}
          </a>
          {' · '}
          <a href={`/verify/${proof.certificate.id}`} className="text-ectoplasm underline">
            {t('certificate.verify')}
          </a>
        </p>
      ) : proof?.certificate.reason ? (
        <p data-testid="proof-certificate" className="text-sm text-bone/70">
          {t('certificate.none')}{' '}
          <span lang="en" dir="ltr">
            {proof.certificate.reason}
          </span>
        </p>
      ) : null}
      {cx ? (
        <div className="space-y-3">
          <button
            type="button"
            aria-expanded={open}
            aria-controls={detail}
            onClick={() => setOpen((o) => !o)}
            className="rounded-full focus-visible:outline-2"
          >
            <DiffBadge kind="deleted" label={t('difference')} className="text-base no-underline" />
          </button>
          {open ? (
            <div
              id={detail}
              data-testid="counterexample"
              className="space-y-3 rounded-lg border border-blood/60 p-4"
            >
              <p lang="en" dir="ltr" className="text-bone">
                {cx.explanation}
              </p>
              <p className="text-sm text-bone/70">
                {cx.reproduced
                  ? t('shrunk', { index: cx.index, shrinks: cx.shrinks, tries: cx.tries })
                  : t('notReproduced', { index: cx.index })}{' '}
                <span lang="en" dir="ltr" className="font-mono">
                  {t('replay', { seed: cx.seed, path: cx.path })}
                </span>
              </p>
              <p lang="en" dir="ltr" className="font-mono text-sm text-bone">
                {inputsText(cx)}
              </p>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-bone/70">
                    <th className="py-1 pr-4 font-normal">{t('col.table')}</th>
                    <th className="py-1 pr-4 font-normal">{t('col.record')}</th>
                    <th className="py-1 pr-4 font-normal">{t('col.field')}</th>
                    <th className="py-1 pr-4 font-normal">{t('col.old')}</th>
                    <th className="py-1 font-normal">{t('col.new')}</th>
                  </tr>
                </thead>
                <tbody lang="en" dir="ltr" className="font-mono">
                  {cx.differences.map((d, i) => (
                    <tr key={i} className="border-t border-bone/10">
                      <td className="py-1 pr-4">{d.table}</td>
                      <td className="py-1 pr-4">{d.record}</td>
                      <td className="py-1 pr-4">{d.field ?? '—'}</td>
                      <td className="py-1 pr-4 text-phosphor">{d.old ?? t('none')}</td>
                      <td className="py-1">
                        <span className="rounded bg-blood px-1 text-graveyard">
                          {d.vessel ?? t('none')}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}
      {latest ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold">{t('oldSide')}</h4>
            <CRTFrame label={t('oldScreen', { name, index: latest.index })}>
              <pre data-testid="proof-old-screen" className="overflow-x-auto text-xs leading-tight">
                {(latest.screen ?? []).join('\n')}
              </pre>
            </CRTFrame>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">{t('newSide')}</h4>
            <div data-testid="proof-new-side" className="rounded-lg border border-bone/15 p-4">
              <p lang="en" dir="ltr" className="mb-3 font-mono text-sm text-bone/70">
                {t('caseLine', { index: latest.index })} · {latest.actionId} · {inputsText(latest)}
              </p>
              <Written values={latest.vessel} label={t(`nothingWritten.${latest.outcome}`)} />
              {/* Why: the reborn app could not work it out, refused it, or it was skipped. */}
              {latest.reason ? (
                <p
                  lang="en"
                  dir="ltr"
                  data-testid="proof-reason"
                  className="mt-3 text-sm text-bone/80"
                >
                  {latest.reason}
                </p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
      {progress ? (
        <div>
          <h4 className="mb-2 text-sm font-semibold">{t('log')}</h4>
          <ol data-testid="proof-log" className="space-y-1 text-sm">
            {progress.cases.map((c) => (
              <li
                key={c.index}
                data-outcome={c.outcome}
                className="flex flex-wrap items-center gap-2"
              >
                <span lang="en" dir="ltr" className="font-mono text-candle">
                  #{c.index}
                </span>
                {c.outcome === 'fail' ? (
                  <DiffBadge kind="deleted" label={t('different')} className="no-underline" />
                ) : c.outcome === 'accepted' ? (
                  <DiffBadge kind="changed" label={t('acceptedOne')} />
                ) : c.outcome === 'skip' ? (
                  <span className="text-bone/70">{t('skippedOne')}</span>
                ) : (
                  <DiffBadge kind="same" label={t('same')} />
                )}
                <span lang="en" dir="ltr" className="font-mono text-bone/80">
                  {c.actionId} · {inputsText(c)}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

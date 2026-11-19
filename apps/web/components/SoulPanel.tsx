'use client';
import { Button, Card, CrtScreen, DiffBadge } from '@afterlife/ui';
import type { Rule, Soul } from '@afterlife/soul';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from './EmptyState';
import {
  diffRows,
  getObservation,
  getSoul,
  specZip,
  textGrid,
  type Observation,
  type SoulAnswer,
} from '../lib/soul-client';

const API = process.env.NEXT_PUBLIC_API_URL;

/** The Soul tab: the entities, the rules (English, Urdu, the expression, confidence, evidence). */
export function SoulPanel({ projectId }: { projectId: string }) {
  const t = useTranslations('raise.soul');
  const empty = useTranslations('raise');
  const [answer, setAnswer] = useState<SoulAnswer | null>(null);

  useEffect(() => {
    let alive = true;
    getSoul(API, projectId).then((a) => alive && setAnswer(a));
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (!answer) return <p className="mt-4 text-sm text-bone/70">{t('loading')}</p>;
  if (!answer.ok)
    return answer.reason === 'none' ? (
      <EmptyState body={empty('empty.soul')} />
    ) : (
      <p role="alert" className="mt-4 text-sm">
        {answer.reason === 'error' ? answer.message : t(`unavailable.${answer.reason}`)}
      </p>
    );
  const { soul, version } = answer;
  return (
    <div data-testid="soul" className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-bone/75">
          {t('version', {
            version,
            by: soul.provenance.createdBy,
            count: soul.provenance.observationCount,
          })}
        </p>
        <DownloadSpec soul={soul} />
      </div>
      {soul.provenance.createdBy === 'reference' ? (
        <p
          data-testid="soul-reference"
          className="rounded-md border border-bone/30 px-3 py-2 text-sm"
        >
          {t('reference')}
        </p>
      ) : null}
      <section aria-labelledby="entities-heading">
        <h2 id="entities-heading" className="text-lg font-semibold">
          {t('entities')}
        </h2>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {soul.entities.map((e) => (
            <Card key={e.id} data-testid={`entity-${e.id}`}>
              <h3 className="font-semibold">
                {e.name} <span className="font-mono text-sm text-bone/70">{e.file}</span>
              </h3>
              <ul className="mt-2 font-mono text-xs" lang="en" dir="ltr">
                {e.fields.map((f) => (
                  <li key={f.name}>
                    {f.name} {f.type}({f.length}
                    {f.decimals ? `,${f.decimals}` : ''})
                    {e.key.includes(f.name) ? ` · ${t('key')}` : ''}
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      </section>
      <section aria-labelledby="rules-heading">
        <h2 id="rules-heading" className="text-lg font-semibold">
          {t('rules', { count: soul.rules.length })}
        </h2>
        <ol className="mt-2 space-y-3">
          {soul.rules.map((r) => (
            <RuleCard key={r.id} rule={r} />
          ))}
        </ol>
      </section>
    </div>
  );
}

function RuleCard({ rule }: { rule: Rule }) {
  const t = useTranslations('raise.soul');
  const [open, setOpen] = useState<string | null>(null);
  return (
    <li data-testid={`rule-${rule.id}`}>
      <Card className="space-y-2">
        <p lang="en" dir="ltr">
          {rule.en}
        </p>
        {rule.ur ? (
          <p lang="ur" dir="rtl" className="font-urdu leading-loose">
            {rule.ur}
          </p>
        ) : null}
        <pre className="overflow-x-auto rounded-md bg-graveyard p-2 text-xs" lang="en" dir="ltr">
          <code>{rule.expression}</code>
        </pre>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            {t('confidence')}
            <meter min={0} max={1} value={rule.confidence} className="w-32">
              {Math.round(rule.confidence * 100)}%
            </meter>
            <span className="font-mono">{Math.round(rule.confidence * 100)}%</span>
          </label>
          {rule.evidence.length ? (
            rule.evidence.map((id, i) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => setOpen(id)}
              >
                {t('evidence', { n: i + 1 })}
              </Button>
            ))
          ) : (
            <span className="text-bone/70">{t('noEvidence')}</span>
          )}
        </div>
      </Card>
      {open ? <EvidenceDialog id={open} onClose={() => setOpen(null)} /> : null}
    </li>
  );
}

/** One observation the rule rests on: the screen before and after, and what changed in the data. */
function EvidenceDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const t = useTranslations('raise.soul');
  const ref = useRef<HTMLDialogElement>(null);
  const [obs, setObs] = useState<Observation | null | 'loading'>('loading');

  useEffect(() => {
    ref.current?.showModal();
    if (API) getObservation(API, id).then(setObs);
    else setObs(null);
  }, [id]);

  const rows = obs && obs !== 'loading' ? diffRows(obs.dbfDiff) : [];
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`ev-${id}`}
      data-testid="evidence"
      className="w-[min(64rem,95vw)] rounded-xl border border-bone/30 bg-graveyard p-4 text-bone backdrop:bg-graveyard/80"
    >
      <h2 id={`ev-${id}`} className="text-lg font-semibold">
        {t('evidenceTitle')}
      </h2>
      {obs === 'loading' ? (
        <p className="mt-2 text-sm">{t('loading')}</p>
      ) : !obs ? (
        <p role="alert" className="mt-2 text-sm">
          {t('evidenceMissing')}
        </p>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm">
            {t('keys')} <code className="font-mono">{obs.keys}</code>
          </p>
          <p className="text-xs text-bone/70">{t('textOnly')}</p>
          <div className="grid gap-3 lg:grid-cols-2">
            <div data-testid="evidence-before">
              <h3 className="text-sm font-semibold">{t('before')}</h3>
              <CrtScreen grid={textGrid(obs.screenBefore.text)} label={t('before')} />
            </div>
            <div data-testid="evidence-after">
              <h3 className="text-sm font-semibold">{t('after')}</h3>
              <CrtScreen grid={textGrid(obs.screenAfter.text)} label={t('after')} />
            </div>
          </div>
          <h3 className="text-sm font-semibold">{t('dataChanged')}</h3>
          {rows.length ? (
            <ul
              data-testid="evidence-diff"
              className="space-y-1 font-mono text-xs"
              lang="en"
              dir="ltr"
            >
              {rows.map((r, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2">
                  <DiffBadge kind={r.kind} /> {r.table} {r.key}{' '}
                  <span className="text-bone/70">{r.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p data-testid="evidence-diff" className="text-sm text-bone/70">
              {t('noChange')}
            </p>
          )}
        </div>
      )}
      <form method="dialog" className="mt-4">
        <Button type="submit" variant="secondary">
          {t('close')}
        </Button>
      </form>
    </dialog>
  );
}

function DownloadSpec({ soul }: { soul: Soul }) {
  const t = useTranslations('raise.soul');
  function download() {
    const url = URL.createObjectURL(
      new Blob([specZip(soul) as BlobPart], { type: 'application/zip' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = `${soul.app.id}-kiro-spec.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <Button type="button" size="sm" onClick={download}>
      {t('download')}
    </Button>
  );
}

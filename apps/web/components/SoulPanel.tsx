'use client';
import { Button, Card, CrtScreen, DiffBadge, cn } from '@afterlife/ui';
import type { Rule, Soul } from '@afterlife/soul';
import { useLocale, useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { EmptyState } from './EmptyState';
import { RuleCheck } from './RuleCheck';
import { VesselTryout } from './VesselTryout';
import { SoulVersions } from './SoulVersions';
import type { LiveEvent } from '../lib/live';
import { foundRuleIds, freshRules, typed, typingMs } from '../lib/rule-discovery';
import { UrduRules } from './UrduRules';
import {
  diffRows,
  getObservation,
  getObservationCount,
  getSoul,
  specZip,
  textGrid,
  type Observation,
  type SoulAnswer,
} from '../lib/soul-client';

const API = process.env.NEXT_PUBLIC_API_URL;

/** The Soul tab: the entities, the rules (English, Urdu, the expression, confidence, evidence). */
export function SoulPanel({
  projectId,
  events = [],
  app = null,
}: {
  projectId: string;
  /** The old app's bundle and clock, for running the Soul's actions on its own data (Prompt 58). */
  app?: { bundle: string; dosTime: string } | null;
  /** Live events: a new Soul version (the Urdu translation) reloads the tab. */
  events?: LiveEvent[];
}) {
  const t = useTranslations('raise.soul');
  const empty = useTranslations('raise');
  const [answer, setAnswer] = useState<SoulAnswer | null>(null);
  const [observed, setObserved] = useState<number | null>(null);
  const updates = events.filter((e) => e.type === 'soul_updated').length;
  // The rules shown before (null until the first load), and those exhumed since: they light a
  // candle and write themselves in (Prompt 57). Rules there on the first load were found earlier.
  const shown = useRef<Set<string> | null>(null);
  const [fresh, setFresh] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    let alive = true;
    getSoul(API, projectId).then((a) => {
      if (!alive) return;
      if (a.ok) {
        const ids = a.soul.rules.map((r) => r.id);
        const f = freshRules(shown.current, ids);
        if (f.length) setFresh((prev) => new Set([...prev, ...f]));
        shown.current = new Set([...ids, ...(shown.current ?? [])]);
      } else if (a.reason === 'none') shown.current ??= new Set();
      setAnswer(a);
    });
    if (API) getObservationCount(API, projectId).then((n) => alive && setObserved(n));
    return () => {
      alive = false;
    };
  }, [projectId, updates]);

  if (!answer) return <p className="mt-4 text-sm text-bone/70">{t('loading')}</p>;
  if (!answer.ok)
    return answer.reason === 'none' ? (
      <div className="space-y-6">
        <EmptyState body={empty('empty.soul')} />
        <RuleCheck projectId={projectId} events={events} />
      </div>
    ) : (
      <p role="alert" className="mt-4 text-sm">
        {answer.reason === 'error' ? answer.message : t(`unavailable.${answer.reason}`)}
      </p>
    );
  const { soul, version } = answer;
  // Rules the Archaeologist just found (rule_found) that the stored Soul does not have yet.
  const inSoul = new Set(soul.rules.map((r) => r.id));
  const pending = foundRuleIds(events, -1)
    .filter((id) => !inSoul.has(id))
    .map((id) => pendingRule(events, id))
    .filter((r): r is Rule => r !== null);
  return (
    <div data-testid="soul" className="mt-6 space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-bone/75">
          {t('version', {
            version,
            by: t(`makers.${soul.provenance.createdBy}`),
            count: soul.provenance.observationCount,
          })}
        </p>
        <DownloadSpec soul={soul} />
        {soul.actions.length ? (
          <Button asChild size="sm" variant="secondary">
            <Link href={`/vessel/${projectId}`}>{t('openVessel')}</Link>
          </Button>
        ) : null}
        {/* Prompt 62: the reborn app as code, with its Kiro files and tests. */}
        {soul.actions.length && API ? (
          <Button asChild size="sm" variant="secondary">
            <a href={`${API}/api/projects/${projectId}/export`} download>
              {t('export')}
            </a>
          </Button>
        ) : null}
      </div>
      {soul.provenance.createdBy === 'reference' ? (
        <p
          data-testid="soul-reference"
          className="rounded-md border border-bone/30 px-3 py-2 text-sm"
        >
          {t('reference')}
        </p>
      ) : null}
      <SoulVersions key={version} projectId={projectId} />
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
        {observed !== null ? (
          <p
            data-testid="exhumed-banner"
            className="mt-1 flex items-center gap-2 text-sm text-bone/85"
          >
            <span
              aria-hidden="true"
              className={cn(
                'inline-block h-3 w-2 rounded-full',
                fresh.size || pending.length
                  ? 'candle-flame animate-flame bg-candle shadow-[0_0_8px_2px_rgb(245_181_68/0.6)]'
                  : 'bg-bone/30',
              )}
            />
            {/* Only the Archaeologist's rules come from the observations (review of 51-60). */}
            {soul.provenance.createdBy === 'archaeologist'
              ? t('exhumed', { rules: soul.rules.length, observations: observed })
              : t('written', {
                  rules: soul.rules.length,
                  by: soul.provenance.createdBy === 'reference' ? 'reference' : 'owner',
                })}
          </p>
        ) : null}
        <UrduRules projectId={projectId} soul={soul} events={events} />
        <ol className="mt-2 space-y-3">
          {soul.rules.map((r) => (
            <RuleCard key={r.id} rule={r} fresh={fresh.has(r.id)} />
          ))}
          {pending.map((r) => (
            <RuleCard key={r.id} rule={r} fresh />
          ))}
        </ol>
      </section>
      <RuleCheck projectId={projectId} events={events} />
      <VesselTryout
        key={`vessel-${version}`}
        soul={soul}
        bundle={app?.bundle ?? null}
        dosTime={app?.dosTime ?? null}
      />
    </div>
  );
}

/** A rule from its rule_found event, before the Soul version with it is stored. */
function pendingRule(events: LiveEvent[], id: string): Rule | null {
  const e = events.find(
    (x) => x.type === 'rule_found' && (x.payload as { ruleId?: string })?.ruleId === id,
  );
  const p = e?.payload as
    { target?: string; expression?: string; en?: string; confidence?: number } | undefined;
  if (!p?.expression || !p.en) return null;
  return {
    id,
    kind: 'compute',
    ...(p.target ? { target: p.target } : {}),
    en: p.en,
    ur: '',
    expression: p.expression,
    evidence: [],
    confidence: typeof p.confidence === 'number' ? p.confidence : 0,
  };
}

/** The text written in so far, one character at a time; all of it at once under reduced motion. */
function useTypewriter(text: string, active: boolean) {
  const [elapsed, setElapsed] = useState(active ? 0 : Number.POSITIVE_INFINITY);
  useEffect(() => {
    if (!active || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setElapsed(Number.POSITIVE_INFINITY);
      return;
    }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setElapsed(now - start);
      if (now - start < typingMs(text)) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, active]);
  const shown = typed(text, elapsed);
  return { text: shown, done: shown === text };
}

function RuleCard({ rule, fresh = false }: { rule: Rule; fresh?: boolean }) {
  const t = useTranslations('raise.soul');
  const urdu = useLocale() === 'ur';
  const [open, setOpen] = useState<string | null>(null);
  const en = useTypewriter(rule.en, fresh);
  const ur = rule.ur.trim() ? (
    <p data-testid="rule-ur" lang="ur" dir="rtl" className="font-urdu text-lg leading-[2]">
      {rule.ur}
    </p>
  ) : urdu ? (
    <p data-testid="rule-ur-missing" className="text-sm text-bone/70">
      {t('urdu.notYet')}
    </p>
  ) : null;
  return (
    <li
      data-testid={`rule-${rule.id}`}
      data-fresh={fresh ? 'true' : undefined}
      data-typed={en.done ? 'true' : 'false'}
    >
      <Card className={cn('space-y-2', fresh && 'border-candle/60')}>
        {fresh ? (
          <p data-testid="rule-fresh" className="flex items-center gap-2 text-sm text-candle">
            <span
              aria-hidden="true"
              className="candle-flame inline-block h-3 w-2 animate-flame rounded-full bg-candle shadow-[0_0_8px_2px_rgb(245_181_68/0.6)]"
            />
            {t('fresh')}
          </p>
        ) : null}
        {/* In Urdu the owner reads the Urdu first; the English stays, for the developer. */}
        {urdu ? ur : null}
        <p
          data-testid="rule-en"
          lang="en"
          dir="ltr"
          className={urdu ? 'text-sm text-bone/75' : undefined}
        >
          {en.done ? (
            rule.en
          ) : (
            <>
              <span aria-hidden="true">{en.text}</span>
              <span className="sr-only">{rule.en}</span>
            </>
          )}
        </p>
        {urdu ? null : ur}
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
        {fresh && en.done && rule.evidence.length ? (
          <EvidenceThumbs ids={rule.evidence.slice(0, 3)} onOpen={setOpen} />
        ) : null}
      </Card>
      {open ? <EvidenceDialog id={open} onClose={() => setOpen(null)} /> : null}
    </li>
  );
}

/** The observations a just-exhumed rule rests on, flying in as small screens of the old app. */
function EvidenceThumbs({ ids, onOpen }: { ids: string[]; onOpen: (id: string) => void }) {
  const t = useTranslations('raise.soul');
  const [obs, setObs] = useState<(Observation | null)[] | null>(null);
  // By value: the parent passes a new array on every render.
  const key = ids.join(' ');
  useEffect(() => {
    let alive = true;
    if (API)
      Promise.all(key.split(' ').map((id) => getObservation(API, id))).then(
        (o) => alive && setObs(o),
      );
    return () => {
      alive = false;
    };
  }, [key]);
  if (!obs) return null;
  return (
    <ul className="flex flex-wrap gap-3" aria-label={t('evidenceShown')}>
      {obs.map((o, i) =>
        o ? (
          <li
            key={o.id}
            data-testid="evidence-thumb"
            className="evidence-fly w-44"
            style={{ animationDelay: `${i * 150}ms` }}
          >
            <button
              type="button"
              onClick={() => onOpen(o.id)}
              className="w-full text-left"
              aria-label={t('evidenceThumb', { n: i + 1, keys: o.keys })}
            >
              <CrtScreen
                grid={textGrid(o.screenAfter.text)}
                label={t('evidenceThumb', { n: i + 1, keys: o.keys })}
              />
            </button>
          </li>
        ) : null,
      )}
    </ul>
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

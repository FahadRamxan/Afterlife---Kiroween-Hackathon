'use client';
import { Button, Card, cn } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState } from 'react';
import type { LiveEvent } from '../lib/live';
import {
  candidateLines,
  getRuleTargets,
  verifyRule,
  type Answer,
  type RuleTargets,
  type RuleVerification,
} from '../lib/rule-check-client';

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * Check candidate rules against every observation of the project (Prompt 55): the same check the
 * Archaeologist runs on the model's candidates. A rule is kept only when it gives the value the
 * old app wrote in every observation; the simplest of those wins.
 */
export function RuleCheck({
  projectId,
  events = [],
}: {
  projectId: string;
  /** Live events: new observations or a new Soul version reload the values. */
  events?: LiveEvent[];
}) {
  const t = useTranslations('raise.soul.check');
  const targetId = useId();
  const candId = useId();
  const [targets, setTargets] = useState<Answer<RuleTargets> | null>(null);
  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [result, setResult] = useState<Answer<RuleVerification> | null>(null);
  const [busy, setBusy] = useState(false);
  // The tab is mounted while hidden: read the observations again each time it is shown (after a
  // séance saved on the other tab), and when the live run adds observations.
  const ref = useRef<HTMLElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver((xs) => {
      if (xs.some((x) => x.isIntersecting)) setShown((n) => n + 1);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const changes = events.filter(
    (e) => e.type === 'observation' || e.type === 'soul_updated',
  ).length;

  useEffect(() => {
    if (!API) return setTargets({ ok: false, message: t('unconfigured') });
    let alive = true;
    getRuleTargets(API, projectId).then((a) => {
      if (!alive) return;
      setTargets(a);
      if (a.ok)
        setTarget((cur) =>
          a.value.targets.some((x) => x.target === cur) ? cur : (a.value.targets[0]?.target ?? ''),
        );
    });
    return () => {
      alive = false;
    };
  }, [projectId, t, shown, changes]);

  async function check() {
    if (!API) return;
    setBusy(true);
    setResult(await verifyRule(API, projectId, target, candidateLines(text)));
    setBusy(false);
  }

  const lines = candidateLines(text);
  return (
    <section
      ref={ref}
      aria-labelledby="rule-check-heading"
      data-testid="rule-check"
      data-ready={targets?.ok ? 'true' : 'false'}
      className="space-y-3"
    >
      <h2 id="rule-check-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <p className="text-sm text-bone/75">{t('body')}</p>
      {!targets ? (
        <p className="text-sm text-bone/70">{t('loading')}</p>
      ) : !targets.ok ? (
        <p role="alert" className="text-sm">
          {targets.message}
        </p>
      ) : targets.value.targets.length === 0 ? (
        <p data-testid="rule-check-empty" className="text-sm text-bone/70">
          {t('noValues', { count: targets.value.observations })}
        </p>
      ) : (
        <Card className="flex flex-col gap-3">
          <label htmlFor={targetId} className="text-sm font-medium">
            {t('target')}
          </label>
          <select
            id={targetId}
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setResult(null);
            }}
            className="rounded-md bg-graveyard p-2 font-mono text-sm"
            dir="ltr"
            lang="en"
          >
            {targets.value.targets.map((x) => (
              <option key={x.target} value={x.target}>
                {t('targetOption', {
                  target: x.target,
                  effects: x.effects,
                  observations: x.observations,
                })}
              </option>
            ))}
          </select>
          <label htmlFor={candId} className="text-sm font-medium">
            {t('candidates')}
          </label>
          <textarea
            id={candId}
            rows={4}
            dir="ltr"
            lang="en"
            spellCheck={false}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="trunc((bill.subtotal - bill.discount) * 0.17, 2)"
            className="rounded-md bg-graveyard p-2 font-mono text-sm"
          />
          <div>
            <Button type="button" onClick={check} disabled={busy || lines.length === 0 || !target}>
              {t('run', { count: targets.value.observations })}
            </Button>
          </div>
        </Card>
      )}
      {result ? <Outcome result={result} /> : null}
    </section>
  );
}

function Outcome({ result }: { result: Answer<RuleVerification> }) {
  const t = useTranslations('raise.soul.check');
  if (!result.ok)
    return (
      <p role="alert" className="text-sm">
        {result.message}
      </p>
    );
  const v = result.value;
  return (
    <div data-testid="rule-check-result" aria-live="polite" className="space-y-3">
      {v.selected ? (
        <Card data-testid="rule-check-selected" className="border-ectoplasm">
          <p className="text-sm font-semibold text-ectoplasm">{t('selected')}</p>
          <pre className="mt-1 overflow-x-auto font-mono text-sm" dir="ltr" lang="en">
            <code>{v.selected.expression}</code>
          </pre>
          <p className="mt-1 text-sm">
            {t('selectedDetail', {
              effects: v.effects,
              observations: v.observations,
              nodes: v.selected.nodes,
              confidence: Math.round(v.selected.confidence * 100),
              coverage: Math.round(v.selected.coverage * 100),
            })}
          </p>
        </Card>
      ) : (
        <p data-testid="rule-check-none" className="text-sm">
          {v.effects ? t('none', { count: v.effects }) : t('noEffects')}
        </p>
      )}
      <ol className="space-y-2">
        {v.checks.map((c) => {
          const all = c.nodes !== null && c.total > 0 && c.explained === c.total;
          const chosen = v.selected?.expression === c.expression;
          const miss = c.misses[0];
          return (
            <li
              key={c.expression}
              data-testid="rule-check-candidate"
              className={cn(
                'rounded-md border p-2 text-sm',
                chosen ? 'border-ectoplasm' : all ? 'border-bone/30' : 'border-blood/60',
              )}
            >
              <code className="font-mono" dir="ltr" lang="en">
                {c.expression}
              </code>
              <p className="mt-1">
                {c.nodes === null
                  ? t('notARule', { message: miss?.error ?? '' })
                  : t('explains', { explained: c.explained, total: c.total, nodes: c.nodes })}
                {chosen ? ` · ${t('chosen')}` : all ? ` · ${t('alsoFits')}` : ''}
              </p>
              {c.nodes !== null && miss ? (
                <p className="mt-1 font-mono text-xs text-bone/75" dir="ltr" lang="en">
                  {miss.got === null
                    ? t('missError', { expected: miss.expected, error: miss.error ?? '' })
                    : t('miss', { expected: miss.expected, got: miss.got })}
                </p>
              ) : null}
            </li>
          );
        })}
      </ol>
      {v.probes.length ? (
        <div data-testid="rule-check-probes">
          <p className="text-sm font-semibold">{t('probes')}</p>
          <ul className="mt-1 list-disc ps-5 text-sm">
            {v.probes.map((p) => (
              <li key={`${p.field} ${p.values.join(' ')}`} dir="ltr" lang="en">
                {p.text}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

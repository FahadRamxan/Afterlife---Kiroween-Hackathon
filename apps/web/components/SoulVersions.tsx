'use client';
import type { SoulDiff } from '@afterlife/soul';
import { Button, DiffBadge } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import {
  changeLine,
  compareVersions,
  listVersions,
  showValue,
  type VersionRow,
} from '../lib/soul-versions';

const API = process.env.NEXT_PUBLIC_API_URL;

/** The Soul's versions, newest first, and "compare two versions". */
export function SoulVersions({ projectId }: { projectId: string }) {
  const t = useTranslations('raise.soul.versions');
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [diff, setDiff] = useState<SoulDiff | null>(null);

  useEffect(() => {
    if (!API) return;
    listVersions(API, projectId).then((v) => {
      setVersions(v);
      if (v && v.length > 1) {
        setTo(v[0]!.version);
        setFrom(v[1]!.version);
      }
    });
  }, [projectId]);

  if (!versions || versions.length === 0) return null;
  async function compare() {
    if (API && from !== null && to !== null)
      setDiff(await compareVersions(API, projectId, from, to));
  }
  const select = (value: number | null, set: (n: number) => void, label: string) => (
    <label className="flex items-center gap-2 text-sm">
      {label}
      <select
        value={value ?? ''}
        onChange={(e) => set(Number(e.target.value))}
        className="rounded-md bg-graveyard px-2 py-1 font-mono"
      >
        {versions.map((v) => (
          <option key={v.version} value={v.version}>
            {v.version}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <section aria-labelledby="versions-heading" data-testid="soul-versions">
      <h2 id="versions-heading" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <ol className="mt-2 space-y-1 text-sm">
        {versions.map((v) => (
          <li key={v.version} data-testid={`version-${v.version}`}>
            <span className="font-mono">v{v.version}</span>{' '}
            <time dateTime={v.createdAt} className="font-mono text-candle" lang="en" dir="ltr">
              {v.createdAt.slice(0, 19).replace('T', ' ')}
            </time>{' '}
            · {t('by', { by: v.createdBy })} · {t('rules', { count: v.rules })}
            {v.changes ? (
              <span className="text-bone/70" lang="en" dir="ltr">
                {' '}
                · {changeLine(v.changes).join(', ') || t('noChange')}
              </span>
            ) : (
              <span className="text-bone/70"> · {t('first')}</span>
            )}
          </li>
        ))}
      </ol>
      {versions.length > 1 ? (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          {select(from, setFrom, t('from'))}
          {select(to, setTo, t('to'))}
          <Button type="button" size="sm" variant="secondary" onClick={compare}>
            {t('compare')}
          </Button>
        </div>
      ) : null}
      {diff ? <DiffView diff={diff} /> : null}
    </section>
  );
}

function DiffView({ diff }: { diff: SoulDiff }) {
  const t = useTranslations('raise.soul.versions');
  const r = diff.rules;
  const nothing = !r.added.length && !r.removed.length && !r.changed.length;
  return (
    <div data-testid="soul-diff" className="mt-3 space-y-2 text-sm" lang="en" dir="ltr">
      <p className="font-semibold">{t('between', { from: diff.from, to: diff.to })}</p>
      {nothing ? <p className="text-bone/70">{t('sameRules')}</p> : null}
      <ul className="space-y-2">
        {r.added.map((x) => (
          <li key={`a-${x.id}`} data-kind="added">
            <DiffBadge kind="inserted" /> <code className="font-mono">{x.id}</code>: {x.en}
          </li>
        ))}
        {r.removed.map((id) => (
          <li key={`r-${id}`} data-kind="removed">
            <DiffBadge kind="deleted" /> <code className="font-mono">{id}</code>
          </li>
        ))}
        {r.changed.map((c) => (
          <li key={`c-${c.id}`} data-kind="changed">
            <DiffBadge kind="changed" /> <code className="font-mono">{c.id}</code>
            <ul className="ml-6 mt-1 space-y-1 font-mono text-xs">
              {c.fields.map((f) => (
                <li key={f.field}>
                  {f.field}: <span className="text-bone/70">{showValue(f.before)}</span> →{' '}
                  <span>{showValue(f.after)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}

'use client';
import { ProgressCandle, cn, motion as timing } from '@afterlife/ui';
import { motion, useReducedMotion } from 'motion/react';
import { useTranslations } from 'next-intl';
import type { Crossing, TableProgress } from '../lib/crossing';

/** Paper slips in flight at once while the data crosses. */
const SLIPS = 6;

/**
 * The data crossing (Prompt 66): the old app's records move as paper slips from its screen to the
 * phone while the Undertaker works, with a progress candle per table; then the reconciliation
 * table, each total ticked when old and new match exactly, and every rejected record with its
 * fix. The slips mean "records are moving": they stop once the step is done, and do not move at
 * all under reduced motion.
 */
export function DataCrossing({
  running,
  progress,
  crossing,
}: {
  running: boolean;
  progress: TableProgress[];
  crossing: Crossing | null;
}) {
  const t = useTranslations('raise.crossing');
  const still = useReducedMotion();
  const tables: TableProgress[] = crossing
    ? crossing.tables.map((x) => ({
        file: x.file,
        crossed: x.migrated,
        rejected: x.rejected,
        of: x.read - x.deleted,
      }))
    : progress;
  return (
    <section
      aria-labelledby="crossing-title"
      data-testid="data-crossing"
      className="mt-6 space-y-4"
    >
      <h2 id="crossing-title" className="text-lg font-semibold">
        {t('title')}
      </h2>
      <div className="relative flex h-20 items-center justify-between rounded-lg border border-bone/15 px-4">
        <span className="font-mono text-sm text-phosphor" aria-hidden="true">
          C:\&gt; *.DBF
        </span>
        {running && !still ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-24 top-1/2 h-4 -translate-y-1/2"
          >
            {Array.from({ length: SLIPS }, (_, i) => (
              <motion.span
                key={i}
                data-testid="crossing-slip"
                className="absolute h-3 w-4 rounded-[2px] bg-bone/80"
                initial={{ left: '0%', opacity: 0 }}
                animate={{ left: ['0%', '100%'], opacity: [0, 1, 1, 0] }}
                transition={{
                  duration: (timing.slow * 3) / 1000,
                  repeat: Infinity,
                  delay: (i * timing.slow * 0.5) / 1000,
                  ease: 'linear',
                }}
              />
            ))}
          </div>
        ) : null}
        <span className="text-sm text-ectoplasm" aria-hidden="true">
          {t('phone')}
        </span>
      </div>
      <p className="sr-only" role="status">
        {running ? t('moving') : crossing ? t('crossed') : ''}
      </p>
      {tables.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label={t('tables')}>
          {tables.map((x) => (
            <li key={x.file} data-testid={`crossing-table-${x.file}`} className="space-y-1">
              <ProgressCandle
                value={x.crossed + x.rejected}
                max={Math.max(x.of, 1)}
                label={t('table', { file: x.file, crossed: x.crossed, of: x.of })}
              />
              <p className="text-sm">
                <span lang="en" dir="ltr" className="font-mono">
                  {x.file}
                </span>{' '}
                {t('count', { crossed: x.crossed, of: x.of })}
                {x.rejected ? ` · ${t('rejectedCount', { n: x.rejected })}` : ''}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
      {crossing ? (
        <>
          <table data-testid="reconciliation" className="w-full text-sm">
            <caption className="text-start font-semibold">
              {crossing.reconciliation.matches ? t('matches') : t('mismatch')}
            </caption>
            <thead>
              <tr className="text-bone/70">
                <th scope="col" className="text-start">
                  {t('col.table')}
                </th>
                <th scope="col" className="text-start">
                  {t('col.total')}
                </th>
                <th scope="col" className="text-end">
                  {t('col.old')}
                </th>
                <th scope="col" className="text-end">
                  {t('col.new')}
                </th>
                <th scope="col" className="text-center">
                  {t('col.ok')}
                </th>
              </tr>
            </thead>
            <tbody>
              {crossing.reconciliation.lines.map((l, i) => (
                <tr
                  key={i}
                  data-testid="reconciliation-line"
                  data-ok={l.ok}
                  className="border-t border-bone/10"
                >
                  <td lang="en" dir="ltr" className="font-mono">
                    {l.table === 'all' ? t('all') : l.table}
                  </td>
                  <td lang="en" dir="ltr">
                    {l.total}
                  </td>
                  <td lang="en" dir="ltr" className="text-end font-mono tabular-nums">
                    {l.before}
                    {l.rejected !== '0' ? ` − ${l.rejected}` : ''}
                  </td>
                  <td lang="en" dir="ltr" className="text-end font-mono tabular-nums">
                    {l.after}
                  </td>
                  <td
                    className={cn(
                      'text-center font-semibold',
                      l.ok ? 'text-ectoplasm' : 'text-blood',
                    )}
                  >
                    <span aria-hidden="true">{l.ok ? '✓' : '✗'}</span>
                    <span className="sr-only">{l.ok ? t('ok') : t('notOk')}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {crossing.rejected.length ? (
            <div data-testid="crossing-rejected" className="space-y-2">
              <h3 className="text-base font-semibold">{t('rejectedTitle')}</h3>
              <ul className="space-y-2 text-sm">
                {crossing.rejected.map((r, i) => (
                  <li key={i} className="rounded-md border border-blood/40 p-2" lang="en" dir="ltr">
                    <p>
                      <span className="font-mono">
                        {r.file} #{r.recno}
                      </span>
                      : {r.reason}
                    </p>
                    <p className="text-bone/80">
                      {t('fix')}: {r.fix}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

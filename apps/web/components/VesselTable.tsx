'use client';
import type { DbfRecord } from '@afterlife/dbf';
import type { Entity } from '@afterlife/soul';
import type { Vessel } from '@afterlife/vessel';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useState } from 'react';
import { displayValue, searchRecords } from '../lib/vessel-views';
import { useWord } from '../lib/use-word';

/** A list of an entity's records (the old STOCK and CUSTOMERS screens), with a search box. */
export function VesselTable({
  vessel,
  entity,
  fields,
}: {
  vessel: Vessel;
  entity: Entity;
  fields: string[];
}) {
  const t = useTranslations('vessel');
  const word = useWord();
  const searchId = useId();
  const [records, setRecords] = useState<DbfRecord[] | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    vessel.store.records(entity.file).then((r) => alive && setRecords(r));
    return () => {
      alive = false;
    };
  }, [vessel, entity]);

  const cols = fields
    .map((f) => entity.fields.find((x) => x.name === f))
    .filter((f): f is Entity['fields'][number] => !!f);
  if (!records) return <p className="text-sm text-bone/70">{t('loading')}</p>;
  const text = cols.filter((c) => c.type === 'C').map((c) => c.name);
  const shown = query.trim()
    ? searchRecords(records, query, text, 500)
    : records.filter((r) => !r.deleted);
  return (
    <div className="space-y-3">
      <label htmlFor={searchId} className="sr-only">
        {t('search')}
      </label>
      <input
        id={searchId}
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('search')}
        className="min-h-12 w-full rounded-lg border border-bone/25 bg-graveyard px-3 text-base"
      />
      <p className="text-sm text-bone/70">
        {t('count', { shown: shown.length, total: records.filter((r) => !r.deleted).length })}
      </p>
      <div className="overflow-x-auto rounded-lg border border-bone/15">
        <table className="w-full text-sm" data-testid={`vessel-table-${entity.id}`}>
          <thead className="bg-bone/5 text-start">
            <tr>
              {cols.map((c) => (
                <th
                  key={c.name}
                  scope="col"
                  className={
                    c.type === 'N'
                      ? 'px-3 py-2 text-end font-medium'
                      : 'px-3 py-2 text-start font-medium'
                  }
                >
                  {word(c.name)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i} className="border-t border-bone/10">
                {cols.map((c) => (
                  <td
                    key={c.name}
                    lang="en"
                    dir="ltr"
                    className={c.type === 'N' ? 'px-3 py-3 text-end tabular-nums' : 'px-3 py-3'}
                  >
                    {displayValue(c, r.values[c.name])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

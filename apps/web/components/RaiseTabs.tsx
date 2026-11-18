'use client';

import * as Tabs from '@radix-ui/react-tabs';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { RAISE_TABS, type RaiseTab } from '../lib/raise-tabs';
import { EmptyState } from './EmptyState';

/** The six rebirth steps. The active tab is kept in ?tab= so links and refreshes restore it. */
export function RaiseTabs({
  initial,
  panels = {},
}: {
  initial: RaiseTab;
  /** What a step shows under its empty-state note (the séance recorder on Possession). */
  panels?: Partial<Record<RaiseTab, ReactNode>>;
}) {
  const t = useTranslations('raise');
  const [tab, setTab] = useState<RaiseTab>(initial);

  function select(value: string) {
    const next = value as RaiseTab;
    setTab(next);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', next);
    window.history.replaceState(null, '', url);
  }

  return (
    <Tabs.Root value={tab} onValueChange={select} className="mt-8">
      <Tabs.List
        aria-label={t('tabsLabel')}
        className="flex flex-wrap gap-1 border-b border-bone/15"
      >
        {RAISE_TABS.map((id) => (
          <Tabs.Trigger
            key={id}
            value={id}
            className="-mb-px border-b-2 border-transparent px-3 py-2 text-sm text-bone/75 hover:text-bone data-[state=active]:border-ectoplasm data-[state=active]:text-bone"
          >
            {t(`tabs.${id}`)}
          </Tabs.Trigger>
        ))}
      </Tabs.List>
      {RAISE_TABS.map((id) => (
        <Tabs.Content key={id} value={id} className="focus-visible:outline-2">
          <h2 className="sr-only">{t(`tabs.${id}`)}</h2>
          <EmptyState body={t(`empty.${id}`)} />
          {panels[id]}
        </Tabs.Content>
      ))}
    </Tabs.Root>
  );
}

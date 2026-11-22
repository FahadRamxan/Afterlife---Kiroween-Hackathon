'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import type { LiveEvent } from '../lib/live';
import { proofProgress, type Proof } from '../lib/proof';
import { getSteps } from '../lib/steps';
import { EmptyState } from './EmptyState';
import { ProofPanel } from './ProofPanel';

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * The Proof tab (Prompt 70): the cases live from the prove step's events, and its summary and
 * counterexample from the steps API, read again whenever the step starts or ends.
 */
export function ProofTab({
  projectId,
  name,
  events,
}: {
  projectId: string;
  name: string;
  events: LiveEvent[];
}) {
  const t = useTranslations('raise');
  const progress = useMemo(() => proofProgress(events), [events]);
  const ends = useMemo(
    () =>
      events.filter((e) => {
        const p = e.payload as { step?: string; state?: string } | null;
        return e.type === 'step' && p?.step === 'prove' && p.state !== 'retrying';
      }).length,
    [events],
  );
  const [proof, setProof] = useState<Proof | null>(null);
  useEffect(() => {
    let alive = true;
    getSteps(API, projectId).then((r) => {
      if (alive && r.ok) setProof(r.steps.find((s) => s.step === 'prove')?.proof ?? null);
    });
    return () => {
      alive = false;
    };
  }, [projectId, ends]);
  if (!progress && !proof) return <EmptyState body={t('empty.proof')} />;
  return <ProofPanel name={name} progress={progress} proof={proof} />;
}

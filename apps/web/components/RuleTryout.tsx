'use client';
import { tryRule } from '@afterlife/soul';
import { Card } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo, useState } from 'react';

const EXAMPLE = 'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0';
const EXAMPLE_VALUES = '{\n  "bill": { "subtotal": "6000.00" }\n}';

/**
 * Try a rule in the Soul's expression language: the same parser and decimal evaluator the Vessel
 * uses, in the browser. Nothing is sent anywhere.
 */
export function RuleTryout() {
  const t = useTranslations('playground.tryout');
  const exprId = useId();
  const valuesId = useId();
  const [expression, setExpression] = useState(EXAMPLE);
  const [values, setValues] = useState(EXAMPLE_VALUES);
  const result = useMemo(() => tryRule(expression, values), [expression, values]);
  // Set once React runs in the page: typing before that would be lost when it takes over.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <Card data-testid="rule-tryout" data-ready={ready} className="mt-6 flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="text-sm text-bone/75">{t('body')}</p>
      <label htmlFor={exprId} className="text-sm font-medium">
        {t('expression')}
      </label>
      <textarea
        id={exprId}
        dir="ltr"
        lang="en"
        spellCheck={false}
        rows={2}
        value={expression}
        onChange={(e) => setExpression(e.target.value)}
        className="rounded-md bg-graveyard p-2 font-mono text-sm"
      />
      <label htmlFor={valuesId} className="text-sm font-medium">
        {t('values')}
      </label>
      <textarea
        id={valuesId}
        dir="ltr"
        lang="en"
        spellCheck={false}
        rows={5}
        value={values}
        onChange={(e) => setValues(e.target.value)}
        className="rounded-md bg-graveyard p-2 font-mono text-sm"
      />
      <output
        data-testid="rule-result"
        aria-live="polite"
        className="font-mono text-sm"
        dir="ltr"
        lang="en"
      >
        {result.ok ? (
          <>
            = <span data-testid="rule-value">{result.value}</span>{' '}
            <span className="text-bone/70">({result.kind})</span>
          </>
        ) : (
          <span role="alert">
            {t(`error.${result.where}`)} {result.message}
          </span>
        )}
      </output>
    </Card>
  );
}

'use client';

import { Card } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';
import { checkUpload, type UploadCheck } from '../lib/upload';

/**
 * "Upload your own dead app". Checks the file in the browser only. Sending it to the API and
 * previewing its tables comes with the DBF inspector (Prompt 21) and the full upload (Prompt 40).
 */
export function UploadCard() {
  const t = useTranslations('graveyard.upload');
  const id = useId();
  const [chosen, setChosen] = useState<{ name: string; check: UploadCheck } | null>(null);

  return (
    <Card data-testid="upload-card" className="flex h-full flex-col gap-3 border-dashed">
      <h2 className="text-lg font-semibold">{t('title')}</h2>
      <p className="text-sm text-bone/75">{t('body')}</p>
      <label htmlFor={id} className="text-sm font-medium">
        {t('choose')}
      </label>
      <input
        id={id}
        type="file"
        accept=".zip,application/zip"
        className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ectoplasm file:px-3 file:py-1.5 file:text-graveyard"
        onChange={(e) => {
          const file = e.target.files?.[0];
          setChosen(file ? { name: file.name, check: checkUpload(file) } : null);
        }}
      />
      {chosen && !chosen.check.ok ? (
        <p role="alert" className="text-sm text-blood">
          {t(`errors.${chosen.check.reason}`)}
        </p>
      ) : null}
      {chosen?.check.ok ? (
        <p role="status" className="text-sm">
          {t('chosen', { name: chosen.name })}
        </p>
      ) : null}
    </Card>
  );
}

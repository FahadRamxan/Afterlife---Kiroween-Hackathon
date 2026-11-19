'use client';

import { Button, Card, DbfTable } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';
import { suggestDosTime } from '@afterlife/emulator';
import { postUpload, type UploadAnswer } from '../lib/upload-raise';
import {
  checkUpload,
  inspectZip,
  postInspect,
  type InspectResult,
  type ZipCheck,
} from '../lib/upload';

type ErrorKey = 'not-zip' | 'empty' | 'too-big' | 'not-a-zip' | 'no-program' | 'no-dbf';

type State =
  | { phase: 'idle' }
  | { phase: 'error'; reason: ErrorKey; entries: string[] }
  | {
      phase: 'checked';
      zip: Extract<ZipCheck, { ok: true }>;
      file: { name: string; bytes: Uint8Array };
      inspect: InspectResult | 'reading' | 'unconfigured';
    };

const API = process.env.NEXT_PUBLIC_API_URL;

/**
 * "Upload your own dead app". Checks the zip in the browser (name, size, then a DOS program and
 * DBF files inside), then previews its tables through POST /api/dbf/inspect. Nothing is stored
 * until "Raise this app" (Prompt 40) sends the zip to POST /api/uploads.
 */
export function UploadCard() {
  const t = useTranslations('graveyard.upload');
  const id = useId();
  const [state, setState] = useState<State>({ phase: 'idle' });
  // Ignores a slow answer for a file that has since been replaced by another choice.
  const pick = useRef(0);

  async function onFile(file: File | undefined) {
    const n = ++pick.current;
    if (!file) return setState({ phase: 'idle' });
    const first = checkUpload(file);
    if (!first.ok) return setState({ phase: 'error', reason: first.reason, entries: [] });
    const bytes = new Uint8Array(await file.arrayBuffer());
    const zip = inspectZip(bytes);
    const picked = { name: file.name, bytes };
    if (n !== pick.current) return;
    if (!zip.ok) return setState({ phase: 'error', reason: zip.reason, entries: zip.entries });
    if (!API) return setState({ phase: 'checked', zip, file: picked, inspect: 'unconfigured' });
    setState({ phase: 'checked', zip, file: picked, inspect: 'reading' });
    const inspect = await postInspect(API, zip.dbfs);
    if (n === pick.current) setState({ phase: 'checked', zip, file: picked, inspect });
  }

  const entries =
    state.phase === 'error' ? state.entries : state.phase === 'checked' ? state.zip.entries : [];

  return (
    <Card data-testid="upload-card" className="flex h-full min-w-0 flex-col gap-3 border-dashed">
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
        onChange={(e) => void onFile(e.target.files?.[0])}
      />

      {state.phase === 'error' ? (
        <p role="alert" className="text-sm text-blood">
          {t(`errors.${state.reason}`)}
        </p>
      ) : null}

      {state.phase === 'checked' ? (
        <p role="status" className="text-sm">
          {t.rich('found', {
            name: state.zip.program,
            count: state.zip.dbfs.length,
            program: (chunks) => (
              <span dir="ltr" lang="en" className="font-mono">
                {chunks}
              </span>
            ),
          })}
        </p>
      ) : null}

      {entries.length > 0 ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-bone/75">{t('entries')}</summary>
          <ul dir="ltr" lang="en" className="mt-1 font-mono text-xs text-bone/75">
            {entries.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {state.phase === 'checked' ? <Preview inspect={state.inspect} /> : null}
      {state.phase === 'checked' ? (
        <RaiseUpload
          file={state.file}
          suggested={suggestDosTime(state.zip.dbfs.map((d) => d.bytes))}
        />
      ) : null}
    </Card>
  );
}

function Preview({ inspect }: { inspect: InspectResult | 'reading' | 'unconfigured' }) {
  const t = useTranslations('graveyard.upload');
  if (inspect === 'reading')
    return (
      <p role="status" className="text-sm text-candle">
        {t('reading')}
      </p>
    );
  if (inspect === 'unconfigured')
    return <p className="text-sm text-bone/75">{t('unconfigured')}</p>;
  if (!inspect.ok)
    return (
      <p role="alert" className="text-sm text-blood">
        {inspect.message === null ? (
          t('apiDown')
        ) : (
          <>
            {t('apiError')}{' '}
            <span dir="ltr" lang="en">
              {inspect.message}
            </span>
          </>
        )}
      </p>
    );
  return (
    <div className="space-y-4" data-testid="upload-preview" data-upload-preview>
      {inspect.files.map((f, i) =>
        // The index too: a zip can hold the same path twice.
        f.ok ? (
          <section key={`${i}:${f.file}`} className="min-w-0 space-y-1">
            <h3 dir="ltr" className="font-mono text-sm text-bone">
              {t('tableCaption', { file: f.file, count: f.recordCount })}
            </h3>
            <DbfTable
              caption={t('tableCaption', { file: f.file, count: f.recordCount })}
              fields={f.fields}
              records={f.rows}
              height={220}
            />
            {f.moreRows > 0 ? (
              <p className="text-xs text-bone/75">
                {t('moreRows', { shown: f.rows.length, total: f.recordCount })}
              </p>
            ) : null}
            {f.warnings.map((w) => (
              <p key={w.message} className="text-xs text-candle" dir="ltr" lang="en">
                {w.message}
              </p>
            ))}
          </section>
        ) : (
          // One broken file shows its reason here; the other tables still show.
          <section key={`${i}:${f.file}`} className="space-y-1" data-testid="unread-file">
            <h3 dir="ltr" className="font-mono text-sm text-bone">
              {f.file}
            </h3>
            <p className="text-sm text-blood">
              {t('unreadable')}{' '}
              <span dir="ltr" lang="en">
                {f.message}
              </span>
            </p>
          </section>
        ),
      )}
      {inspect.leftOut > 0 ? (
        <p className="text-sm text-candle">
          {t('leftOut', { count: inspect.leftOut, shown: inspect.files.length })}
        </p>
      ) : null}
      <p className="text-xs text-bone/75">{t('notStored')}</p>
    </div>
  );
}

/**
 * Sends the zip to the server, which checks it again, virus-scans it and builds its bundle, then
 * opens the new project. With several programs in the zip, asks which one starts the app.
 */
function RaiseUpload({
  file,
  suggested,
}: {
  file: { name: string; bytes: Uint8Array };
  /** From its DBF headers: the day the shop last used it. */
  suggested: string | null;
}) {
  const t = useTranslations('graveyard.upload');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Extract<UploadAnswer, { ok: false }> | null>(null);
  const [program, setProgram] = useState<string>('');
  // The DOS clock it boots at, as the date and time inputs show it (YYYY-MM-DD and HH:MM).
  const [day, setDay] = useState(suggested?.slice(0, 10) ?? '');
  const [time, setTime] = useState(suggested?.slice(11, 16) ?? '09:00');

  async function send() {
    setBusy(true);
    const dosTime = day ? `${day} ${time || '09:00'}:00` : undefined;
    const r = await postUpload(API, file.bytes, file.name, program || undefined, fetch, dosTime);
    if (r.ok) return router.push(`/raise/${r.projectId}`);
    setAnswer(r);
    if (r.programs?.length && !program) setProgram(r.programs[0]!);
    setBusy(false);
  }

  return (
    <div className="flex flex-col gap-2">
      {answer?.programs ? (
        <label className="flex items-center gap-2 text-sm">
          {t('whichProgram')}
          <select
            value={program}
            onChange={(e) => setProgram(e.target.value)}
            className="rounded-md bg-graveyard px-2 py-1 font-mono"
          >
            {answer.programs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <fieldset className="flex flex-wrap items-center gap-2 text-sm">
        <legend className="mb-1">{t('dosClock')}</legend>
        <input
          type="date"
          aria-label={t('dosDay')}
          min="1980-01-01"
          max="2099-12-31"
          value={day}
          onChange={(e) => setDay(e.target.value)}
          className="rounded-md bg-graveyard px-2 py-1 font-mono"
        />
        <input
          type="time"
          aria-label={t('dosTime')}
          value={time}
          onChange={(e) => setTime(e.target.value)}
          className="rounded-md bg-graveyard px-2 py-1 font-mono"
        />
        <span className="text-xs text-bone/75">
          {suggested ? t('dosClockFrom') : t('dosClockNone')}
        </span>
      </fieldset>
      <Button type="button" onClick={send} disabled={busy} className="self-start">
        {busy ? t('raising') : t('raiseUpload')}
      </Button>
      {answer && !answer.programs ? (
        <p role="alert" className="text-sm">
          {answer.code === 'DOWN' || answer.code === 'UNCONFIGURED'
            ? t(answer.code === 'DOWN' ? 'raiseDown' : 'raiseUnconfigured')
            : `${t('refused')} ${answer.message}`}
        </p>
      ) : null}
      <p className="text-xs text-bone/75">{t('scanNote')}</p>
    </div>
  );
}

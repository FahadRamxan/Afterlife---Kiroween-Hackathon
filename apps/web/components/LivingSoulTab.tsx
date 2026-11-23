'use client';
import { Button, cn } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { isUrduScript, pickMime, sendVoice, type Heard } from '../lib/voice';
const API = process.env.NEXT_PUBLIC_API_URL;
/** The longest request: a minute, so it stays under the API's limit. */
const MAX_MS = 60_000;
type Mic = { recorder: MediaRecorder; chunks: Blob[]; timer: ReturnType<typeof setTimeout> };
/**
 * The Living Soul tab (Prompt 80): the owner says a rule change, in Urdu or English, or types it.
 * The recording (MediaRecorder, webm/opus) is transcribed on the API and its numbers normalised
 * ("paanch feesad" is 5%); both are shown. Turning it into a rule change comes in Prompt 81.
 */
export function LivingSoulTab() {
  const t = useTranslations('raise.living');
  const mic = useRef<Mic | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [heard, setHeard] = useState<Heard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  // Leaving the tab turns the microphone off.
  useEffect(
    () => () => {
      const m = mic.current;
      if (!m) return;
      clearTimeout(m.timer);
      if (m.recorder.state !== 'inactive') m.recorder.stop();
      m.recorder.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );
  async function start() {
    setError(null);
    setHeard(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime((m) => MediaRecorder.isTypeSupported(m));
      const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => ev.data.size > 0 && chunks.push(ev.data);
      recorder.start();
      mic.current = { recorder, chunks, timer: setTimeout(() => void stop(), MAX_MS) };
      setRecording(true);
    } catch {
      setError(t('noMic'));
    }
  }
  async function stop() {
    const m = mic.current;
    if (!m) return;
    mic.current = null;
    clearTimeout(m.timer);
    await new Promise<void>((resolve) => {
      m.recorder.onstop = () => resolve();
      m.recorder.stop();
    });
    m.recorder.stream.getTracks().forEach((tr) => tr.stop());
    setRecording(false);
    const blob = new Blob(m.chunks, { type: m.recorder.mimeType || 'audio/webm' });
    setBusy(true);
    const r = await sendVoice(API, {
      audio: { mime: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) },
    });
    setBusy(false);
    if (r.ok) setHeard(r);
    else setError(r.message);
  }
  async function read() {
    setError(null);
    setBusy(true);
    const r = await sendVoice(API, { text: typed });
    setBusy(false);
    if (r.ok) setHeard(r);
    else setError(r.message);
  }
  const say = (s: string, testId: string, className = '') =>
    isUrduScript(s) ? (
      <p
        data-testid={testId}
        lang="ur"
        dir="rtl"
        className={cn('font-urdu leading-loose', className)}
      >
        {s}
      </p>
    ) : (
      <p data-testid={testId} dir="ltr" className={cn('font-mono', className)}>
        {s}
      </p>
    );
  return (
    <section aria-labelledby="living-title" data-testid="living-soul" className="mt-6 space-y-4">
      <h3 id="living-title" className="text-lg font-semibold">
        {t('title')}
      </h3>
      <p className="text-sm text-bone/80">{t('intro')}</p>
      <div className="flex flex-wrap items-center gap-3">
        {recording ? (
          <Button variant="primary" size="lg" onClick={() => void stop()}>
            {t('stop')}
          </Button>
        ) : (
          <Button variant="primary" size="lg" disabled={busy} onClick={() => void start()}>
            {t('speak')}
          </Button>
        )}
        {recording ? (
          <span role="status" data-testid="living-recording" className="text-sm text-candle">
            {t('listening')}
          </span>
        ) : null}
        {busy ? (
          <span role="status" className="text-sm text-bone/70">
            {t('reading')}
          </span>
        ) : null}
      </div>
      <form
        className="flex flex-wrap items-end gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) void read();
        }}
      >
        <label className="flex min-w-72 flex-1 flex-col gap-1 text-sm">
          {t('typeLabel')}
          <input
            value={typed}
            maxLength={500}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="senior citizen ko das feesad discount do"
            dir="auto"
            className="rounded-md border border-bone/30 bg-transparent px-3 py-2 text-bone"
          />
        </label>
        <Button type="submit" variant="secondary" disabled={busy || !typed.trim()}>
          {t('read')}
        </Button>
      </form>
      {error ? (
        <p role="alert" data-testid="living-error" className="text-sm text-blood">
          {error}
        </p>
      ) : null}
      {heard ? (
        <div data-testid="living-heard" className="space-y-2 rounded-lg border border-bone/15 p-3">
          <p className="text-xs text-bone/70">
            {heard.source === 'typed' ? t('typed') : t('heardFrom', { source: heard.source })}
            {heard.language ? ` · ${heard.language}` : ''}
          </p>
          {say(heard.transcript, 'living-transcript', 'text-bone')}
          <p className="text-xs text-bone/70">{t('normalised')}</p>
          {say(heard.normalised, 'living-normalised', 'text-ectoplasm')}
          <p className="text-xs text-bone/70">{t('next')}</p>
        </div>
      ) : null}
    </section>
  );
}

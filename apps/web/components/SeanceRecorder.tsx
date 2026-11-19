'use client';

import {
  recordAction,
  type EmulatorController,
  type KeyStroke,
  type Observation,
} from '@afterlife/emulator';
import { analyzeScreen } from '@afterlife/screen';
import { Button, CrtScreen } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { summarizeObservation } from '../lib/observation';
import { keyFromEvent, thumbnailSize } from '../lib/seance';
import { useEmulator, useScreenGrid } from '../lib/use-emulator';

type Props = {
  projectId: string;
  bundle: string;
  name: string;
  dosTime: string;
  /** The raised project this séance belongs to (on /raise/<project id>). */
  raisedProjectId?: string;
  onSaved?: (sessionId: string) => void;
};
type Action = { observation: Observation; thumb: string; changed: string[] };

const API = process.env.NEXT_PUBLIC_API_URL;

/** A small picture of the emulator's screen, for the timeline. */
async function thumbnail(c: EmulatorController): Promise<string> {
  const shot = await c.screenshot();
  const full = document.createElement('canvas');
  full.width = shot.width;
  full.height = shot.height;
  full
    .getContext('2d')!
    .putImageData(new ImageData(new Uint8ClampedArray(shot.rgba), shot.width, shot.height), 0, 0);
  const size = thumbnailSize(shot.width, shot.height, 160);
  const small = document.createElement('canvas');
  small.width = size.width;
  small.height = size.height;
  const ctx = small.getContext('2d')!;
  // A smooth shrink: a quarter-size DOS screen stays readable.
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(full, 0, 0, size.width, size.height);
  return small.toDataURL('image/png');
}

const toBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/**
 * "Record a séance": the owner works the real old app in the page. Every key becomes an
 * observation (Prompt 29) on a timeline, optionally with their voice, and is saved as a session.
 */
export function SeanceRecorder({
  projectId,
  bundle,
  name,
  dosTime,
  raisedProjectId,
  onSaved,
}: Props) {
  const t = useTranslations('seance');
  const [url, setUrl] = useState<string | null>(null);
  const emu = useEmulator(url, { dosTime });
  const c = emu.controller;
  const [message, setMessage] = useState<string | null>(null);
  const grid = useScreenGrid(c, setMessage);
  const [actions, setActions] = useState<Action[]>([]);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  // How many actions the last save held: Save stays off until there are new ones, so a second
  // click does not store the same séance twice.
  const [savedCount, setSavedCount] = useState(0);
  const [saving, setSaving] = useState(false);
  const [voice, setVoice] = useState<'off' | 'on' | 'denied'>('off');
  const queue = useRef<KeyStroke[]>([]);
  const busy = useRef(false);
  const [pending, setPending] = useState(0);
  const mic = useRef<{ recorder: MediaRecorder; chunks: Blob[] } | null>(null);

  // Leaving the tab or the page unmounts the recorder: the microphone must go off with it, or the
  // browser keeps recording (its mic light on) with nothing left on the page to stop it.
  useEffect(
    () => () => {
      const m = mic.current;
      if (!m) return;
      mic.current = null;
      if (m.recorder.state !== 'inactive') m.recorder.stop();
      m.recorder.stream.getTracks().forEach((tr) => tr.stop());
    },
    [],
  );

  async function pump() {
    if (busy.current || !c) return;
    busy.current = true;
    try {
      while (queue.current.length > 0) {
        const stroke = queue.current.shift()!;
        setPending(queue.current.length);
        const observation = await recordAction(c, [stroke]);
        const changed = summarizeObservation(observation).tables.map((x) => x.name);
        const thumb = await thumbnail(c);
        setActions((a) => [...a, { observation, thumb, changed }]);
      }
    } catch (e) {
      setMessage((e as Error).message);
    } finally {
      busy.current = false;
      setPending(0);
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const k = keyFromEvent(e);
    if (!k) return;
    // Tab and the arrows belong to the old app here; Esc too. Leaving: click outside.
    e.preventDefault();
    queue.current.push(k);
    setPending(queue.current.length);
    void pump();
  }

  async function startVoice() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (ev) => ev.data.size > 0 && chunks.push(ev.data);
      recorder.start();
      mic.current = { recorder, chunks };
      setVoice('on');
    } catch {
      setVoice('denied');
    }
  }

  async function stopVoice(): Promise<{ mime: string; base64: string } | undefined> {
    const m = mic.current;
    if (!m) return undefined;
    mic.current = null;
    await new Promise<void>((resolve) => {
      m.recorder.onstop = () => resolve();
      m.recorder.stop();
    });
    m.recorder.stream.getTracks().forEach((tr) => tr.stop());
    setVoice('off');
    const blob = new Blob(m.chunks, { type: m.recorder.mimeType || 'audio/webm' });
    return { mime: blob.type.split(';')[0]!, base64: await toBase64(blob) };
  }

  async function save() {
    if (!API) return setMessage(t('unconfigured'));
    setSaving(true);
    setMessage(null);
    try {
      const audio = await stopVoice();
      const res = await fetch(`${API.replace(/\/+$/, '')}/api/sessions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId,
          ...(raisedProjectId ? { raisedProjectId } : {}),
          startedAt,
          actions: actions.map((a) => a.observation),
          audio,
        }),
      });
      const body = (await res.json()) as { id?: string; message?: string };
      if (!res.ok || !body.id) throw new Error(body.message ?? `The API answered ${res.status}`);
      setSaved(body.id);
      setSavedCount(actions.length);
      onSaved?.(body.id);
    } catch (e) {
      setMessage(t('saveFailed', { reason: (e as Error).message }));
    } finally {
      setSaving(false);
    }
  }

  const screenName = grid ? analyzeScreen(grid).title?.name : undefined;
  return (
    <section aria-label={t('title')} className="mt-6 space-y-4">
      <p className="text-sm text-bone/75">{t('intro')}</p>
      {emu.status === 'idle' ? (
        <Button
          onClick={() => {
            setUrl(bundle);
            setStartedAt(new Date().toISOString());
          }}
        >
          {t('start')}
        </Button>
      ) : null}
      {emu.status === 'booting' ? (
        <p role="status" className="text-sm text-candle">
          {t('booting', { name })}
        </p>
      ) : null}
      {emu.status === 'error' ? (
        <p role="alert" className="text-sm text-blood">
          {t('bootFailed', { reason: emu.error })}
        </p>
      ) : null}
      {c && grid ? (
        <div className="space-y-2">
          <div
            tabIndex={0}
            role="application"
            aria-label={t('keyboard', { name })}
            onKeyDown={onKeyDown}
            className="max-w-3xl rounded-2xl focus-visible:outline-2 focus-visible:outline-ectoplasm"
          >
            <CrtScreen grid={grid} label={t('live', { name })} />
          </div>
          <p className="text-xs text-bone/75" dir="ltr" lang="en">
            {t('screen')}{' '}
            <span className="font-mono" data-testid="seance-screen">
              {screenName ?? '?'}
            </span>
            {pending > 0 ? ` · ${t('pending', { count: pending })}` : ''}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            {voice === 'on' ? (
              <p role="status" className="text-sm text-blood">
                {t('voiceOn')}
              </p>
            ) : (
              <Button variant="secondary" onClick={() => void startVoice()}>
                {t('voiceStart')}
              </Button>
            )}
            <Button
              disabled={
                actions.length === 0 || actions.length === savedCount || saving || pending > 0
              }
              onClick={() => void save()}
            >
              {saving ? t('saving') : t('save', { count: actions.length })}
            </Button>
          </div>
          {voice === 'denied' ? <p className="text-sm text-candle">{t('voiceDenied')}</p> : null}
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-blood">
          {message}
        </p>
      ) : null}
      {saved ? (
        <p role="status" className="text-sm text-ectoplasm" data-testid="seance-saved">
          {t('saved', { id: saved })}
        </p>
      ) : null}
      {actions.length > 0 ? (
        <ol
          aria-label={t('timeline')}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
          dir="ltr"
          lang="en"
        >
          {actions.map((a, i) => {
            const s = summarizeObservation(a.observation);
            return (
              <li key={i} className="space-y-1 rounded-lg border border-bone/15 p-2 text-xs">
                {/* A data URL thumbnail: nothing for next/image to optimise. */}
                <img
                  src={a.thumb}
                  alt={`Screen after ${s.keys}`}
                  width={160}
                  height={100}
                  className="w-full"
                />
                <p className="font-mono">
                  {i + 1}. {s.keys}: {s.from} → {s.to}
                </p>
                <p className="text-bone/75">
                  {a.changed.length ? `Data: ${a.changed.join(', ')}` : 'No data changed'}
                </p>
              </li>
            );
          })}
        </ol>
      ) : null}
    </section>
  );
}

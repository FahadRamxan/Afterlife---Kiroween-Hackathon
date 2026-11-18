'use client';

import { snapshot } from '@afterlife/dbf';
import {
  KeyParseError,
  recordAction,
  waitForStableScreen,
  withFreshState,
  type EmulatorController,
} from '@afterlife/emulator';
import { analyzeScreen } from '@afterlife/screen';
import { Button, CrtScreen, DiffBadge } from '@afterlife/ui';
import { useId, useState } from 'react';
import {
  recordCountChanges,
  replayVerdict,
  summarizeObservation,
  type ObservationSummary,
} from '../lib/observation';
import { useEmulator, useScreenGrid } from '../lib/use-emulator';

type Props = { bundle: string; name: string; dosTime: string };

const REPLAYS = 3;

type DataState = { hash: string; counts: Record<string, number> };

/**
 * The .DBF files on drive C:: a short id of all of them (SHA-256 of each file, from the DBF
 * snapshot), and each table's record count.
 */
async function dataState(e: EmulatorController): Promise<DataState> {
  const names = (await e.listFiles()).filter((f) => f.endsWith('.DBF'));
  const snap = await snapshot(
    Object.fromEntries(await Promise.all(names.map(async (n) => [n, await e.readFile(n)]))),
  );
  const all = names.map((n) => snap.tables[n]!.hash).join('');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(all));
  const hash = [...new Uint8Array(digest)]
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  const counts = Object.fromEntries(names.map((n) => [n, snap.tables[n]!.table.records.length]));
  return { hash, counts };
}

/**
 * The real old app running in js-dos in this page. Its screen is read back with decodeScreen
 * (no OCR) several times a second and drawn with CrtScreen.
 */
export function LiveEmulator({ bundle, name, dosTime }: Props) {
  const keysId = useId();
  const [url, setUrl] = useState<string | null>(null);
  const emu = useEmulator(url, { dosTime });
  const [keys, setKeys] = useState('2');
  const [message, setMessage] = useState<string | null>(null);
  const [files, setFiles] = useState<{ name: string; size: number }[] | null>(null);
  const [observed, setObserved] = useState<ObservationSummary | null>(null);
  const [recording, setRecording] = useState(false);
  const [replays, setReplays] = useState<{ before: DataState | null; runs: DataState[] } | null>(
    null,
  );
  const [replaying, setReplaying] = useState(false);
  const c = emu.controller;
  const grid = useScreenGrid(c, setMessage);

  async function act(what: () => Promise<void>) {
    setMessage(null);
    try {
      await what();
    } catch (e) {
      setMessage(
        e instanceof KeyParseError ? `Not a key sequence: ${e.message}` : (e as Error).message,
      );
    }
  }

  const title = grid ? analyzeScreen(grid).title?.name : undefined;
  return (
    <div className="space-y-4" lang="en" dir="ltr">
      {emu.status === 'idle' ? (
        <Button onClick={() => setUrl(bundle)}>Boot {name} in js-dos</Button>
      ) : null}
      {emu.status === 'booting' ? (
        <p role="status" className="text-sm text-candle">
          Booting {name} in js-dos…
        </p>
      ) : null}
      {emu.status === 'error' ? (
        <p role="alert" className="text-sm text-blood">
          js-dos could not start: {emu.error}
        </p>
      ) : null}
      {c && grid ? (
        <>
          <CrtScreen grid={grid} label={`${name}, running live`} className="max-w-3xl" />
          <p className="text-xs text-bone/75" data-testid="live-screen-name">
            Screen: <span className="font-mono">{title ?? 'unknown'}</span>
          </p>
        </>
      ) : null}
      {c ? (
        <div className="flex flex-wrap items-end gap-3">
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void act(() => c.sendKeys(keys));
            }}
          >
            <div>
              <label htmlFor={keysId} className="block text-sm font-medium">
                Keys to send
              </label>
              <input
                id={keysId}
                value={keys}
                onChange={(e) => setKeys(e.target.value)}
                spellCheck={false}
                className="w-56 rounded-md border border-bone/25 bg-black px-3 py-2 font-mono text-sm text-bone focus-visible:outline-2 focus-visible:outline-ectoplasm"
              />
            </div>
            <Button type="submit">Send</Button>
            <Button
              type="button"
              variant="secondary"
              disabled={recording}
              onClick={() =>
                void act(async () => {
                  setRecording(true);
                  try {
                    setObserved(summarizeObservation(await recordAction(c, keys)));
                  } finally {
                    setRecording(false);
                  }
                })
              }
            >
              {recording ? 'Recording…' : 'Record'}
            </Button>
          </form>
          <Button
            variant="secondary"
            onClick={() =>
              void act(async () => {
                const names = await c.listFiles();
                setFiles(
                  await Promise.all(
                    names.map(async (n) => ({ name: n, size: (await c.readFile(n)).length })),
                  ),
                );
              })
            }
          >
            Read files
          </Button>
          <Button
            variant="secondary"
            disabled={replaying}
            onClick={() =>
              void act(async () => {
                setReplaying(true);
                setReplays({ before: null, runs: [] });
                try {
                  const bytes = new Uint8Array(await (await fetch(bundle)).arrayBuffer());
                  for (let i = 0; i < REPLAYS; i++) {
                    const run = await withFreshState(c, bytes, { dosTime }, async (e) => {
                      // The fresh state is the same every time: its data id is the "before".
                      const before = await dataState(e);
                      await waitForStableScreen(e);
                      await e.sendKeys(keys);
                      await waitForStableScreen(e);
                      return { before, after: await dataState(e) };
                    });
                    setReplays((r) => ({
                      before: r?.before ?? run.before,
                      runs: [...(r?.runs ?? []), run.after],
                    }));
                  }
                } finally {
                  setReplaying(false);
                }
              })
            }
          >
            {replaying ? 'Replaying…' : `Replay ${REPLAYS} times from a fresh state`}
          </Button>
          <Button variant="ghost" onClick={() => void act(() => c.reset())}>
            Reset
          </Button>
        </div>
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-blood">
          {message}
        </p>
      ) : null}
      {observed ? <ObservationView o={observed} /> : null}
      {replays?.before ? (
        <ReplayView before={replays.before} runs={replays.runs} done={!replaying} />
      ) : null}
      {files ? (
        <table className="font-mono text-sm" aria-label="Files on drive C:">
          <thead>
            <tr className="text-left text-bone/75">
              <th className="pr-6 font-normal">File</th>
              <th className="text-right font-normal">Bytes</th>
            </tr>
          </thead>
          <tbody>
            {files.map((f) => (
              <tr key={f.name}>
                <td className="pr-6">{f.name}</td>
                <td className="text-right">{f.size.toLocaleString('en')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}

/** One observation: the keys, the screens before and after, and what changed in the data. */
function ObservationView({ o }: { o: ObservationSummary }) {
  return (
    <section
      aria-label="Last observation"
      className="space-y-2 rounded-lg border border-bone/15 p-4 text-sm"
    >
      <p>
        <span className="font-mono">{o.keys}</span>: <span className="font-mono">{o.from}</span> →{' '}
        <span className="font-mono">{o.to}</span>{' '}
        <span className="text-bone/75">
          in {o.durationMs.toLocaleString('en')} ms{o.stable ? '' : ', screen still changing'}
        </span>
      </p>
      {o.tables.length === 0 ? (
        <p className="text-bone/75">No data changed.</p>
      ) : (
        <ul className="space-y-2">
          {o.tables.map((t) => (
            <li key={t.name}>
              <p className="flex flex-wrap items-center gap-2">
                <span className="font-mono">{t.name}</span>
                {t.inserted ? <DiffBadge kind="inserted" count={t.inserted} /> : null}
                {t.deleted ? <DiffBadge kind="deleted" count={t.deleted} /> : null}
                {t.changed ? <DiffBadge kind="changed" count={t.changed} /> : null}
              </p>
              <ul className="mt-1 font-mono text-xs text-bone/75">
                {t.lines.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * The data files before the keys (the fresh state) and after each replay: a repeatable run gives
 * the same id every time, and a different one from before (else the keys did nothing).
 */
function ReplayView({
  before,
  runs,
  done,
}: {
  before: DataState;
  runs: DataState[];
  done: boolean;
}) {
  const verdict = replayVerdict(
    runs.map((r) => r.hash),
    REPLAYS,
    before.hash,
  );
  const changes = runs[0] ? recordCountChanges(before.counts, runs[0].counts) : [];
  return (
    <section
      aria-label="Replays"
      className="space-y-2 rounded-lg border border-bone/15 p-4 text-sm"
    >
      <p className="font-mono text-xs" data-testid="replay-before">
        Before: data files {before.hash}
      </p>
      <ol className="font-mono text-xs">
        {runs.map((r, i) => (
          <li key={i}>
            Run {i + 1}: data files {r.hash} ({r.hash === before.hash ? 'unchanged' : 'changed'})
          </li>
        ))}
      </ol>
      {changes.length > 0 ? (
        <ul aria-label="What the keys changed" className="font-mono text-xs text-bone/75">
          {changes.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}
      {done ? (
        <p role="status" className={verdict.ok ? 'text-ectoplasm' : 'text-blood'}>
          {verdict.text}
        </p>
      ) : null}
    </section>
  );
}

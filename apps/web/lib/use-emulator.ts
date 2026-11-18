'use client';

import {
  BrowserJsDos,
  type BootOptions,
  type EmulatorController,
  type JsDosEmulators,
} from '@afterlife/emulator';
import { ScreenDecodeError, decodeScreen, type ScreenGrid } from '@afterlife/screen';
import { useEffect, useState } from 'react';

/** Where apps/web serves js-dos (copied there by scripts/copy-jsdos.mjs). */
const JSDOS = '/js-dos/';

type JsDosGlobal = JsDosEmulators & { pathPrefix: string };
let loading: Promise<JsDosEmulators> | null = null;

/** Loads js-dos's emulators.js once per page. */
export function loadJsDos(): Promise<JsDosEmulators> {
  loading ??= new Promise((resolve, reject) => {
    const w = window as unknown as { emulators?: JsDosGlobal };
    const ready = () => {
      w.emulators!.pathPrefix = JSDOS;
      resolve(w.emulators!);
    };
    if (w.emulators) return ready();
    const script = document.createElement('script');
    script.src = `${JSDOS}emulators.js`;
    script.async = true;
    script.onload = ready;
    script.onerror = () => {
      loading = null;
      reject(new Error('js-dos could not be loaded'));
    };
    document.head.append(script);
  });
  return loading;
}

export type EmulatorState =
  | { status: 'idle'; controller: null; error: null }
  | { status: 'booting'; controller: null; error: null }
  | { status: 'ready'; controller: BrowserJsDos; error: null }
  | { status: 'error'; controller: null; error: string };

const IDLE: EmulatorState = { status: 'idle', controller: null, error: null };

/**
 * Boots a js-dos bundle in this page and gives its EmulatorController. Pass null to stay idle.
 * The emulator stops when the component unmounts or the URL changes.
 */
export function useEmulator(bundleUrl: string | null, options: BootOptions = {}): EmulatorState {
  const [state, setState] = useState<EmulatorState>(IDLE);
  const key = JSON.stringify(options);
  useEffect(() => {
    if (!bundleUrl) {
      setState(IDLE);
      return;
    }
    let cancelled = false;
    let controller: BrowserJsDos | null = null;
    setState({ status: 'booting', controller: null, error: null });
    (async () => {
      try {
        const emulators = await loadJsDos();
        const res = await fetch(bundleUrl);
        if (!res.ok) throw new Error(`The bundle could not be downloaded (${res.status})`);
        const bytes = new Uint8Array(await res.arrayBuffer());
        controller = new BrowserJsDos({ emulators });
        await controller.boot(bytes, JSON.parse(key) as BootOptions);
        if (cancelled) return void (await controller.exit());
        setState({ status: 'ready', controller, error: null });
      } catch (e) {
        if (!cancelled)
          setState({ status: 'error', controller: null, error: (e as Error).message });
      }
    })();
    return () => {
      cancelled = true;
      void controller?.exit();
    };
  }, [bundleUrl, key]);
  return state;
}

/**
 * The emulator's screen, read back with decodeScreen (no OCR) several times a second. A frame in
 * another video mode (DOS starting up) is skipped; other errors go to `onError`.
 */
export function useScreenGrid(
  controller: EmulatorController | null,
  onError: (message: string) => void = () => {},
): ScreenGrid | null {
  const [grid, setGrid] = useState<ScreenGrid | null>(null);
  useEffect(() => {
    if (!controller) return;
    let busy = false;
    const timer = setInterval(async () => {
      if (busy) return;
      busy = true;
      try {
        const shot = await controller.screenshot();
        setGrid(decodeScreen(shot.rgba, shot.width, shot.height));
      } catch (e) {
        if (!(e instanceof ScreenDecodeError)) onError((e as Error).message);
      } finally {
        busy = false;
      }
    }, 250);
    return () => clearInterval(timer);
    // onError is a callback for messages; a new one each render must not restart the polling.
  }, [controller]);
  return grid;
}

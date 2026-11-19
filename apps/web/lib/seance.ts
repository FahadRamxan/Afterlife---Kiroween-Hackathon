import { KEY_NAMES, type KeyStroke, type Modifier } from '@afterlife/emulator';

type KeyEventLike = {
  key: string;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  metaKey: boolean;
};

/** Browser key names that differ from ours. */
const NAMED: Record<string, string> = {
  Escape: 'Esc',
  Delete: 'Del',
  Insert: 'Ins',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
};

/**
 * The keystroke a key press on the DOS screen sends, or null for keys a DOS keyboard does not
 * have (a modifier alone, the Windows/Command key, letters outside ASCII).
 */
export function keyFromEvent(e: KeyEventLike): KeyStroke | null {
  if (e.metaKey) return null;
  const named = NAMED[e.key] ?? e.key;
  const mods: Modifier[] = [];
  if (e.ctrlKey) mods.push('Ctrl');
  if (e.altKey) mods.push('Alt');
  if (named.length > 1) {
    if (!KEY_NAMES.includes(named)) return null;
    if (e.shiftKey) mods.push('Shift');
    return { kind: 'key', key: named, mods };
  }
  if (named < ' ' || named > '~') return null;
  if (mods.length === 0) return { kind: 'text', text: named };
  // {Ctrl+C}: the letter in upper case; Shift is part of the combination.
  const letter = named.toUpperCase();
  if (!KEY_NAMES.includes(letter)) return null;
  if (e.shiftKey) mods.push('Shift');
  return { kind: 'key', key: letter, mods };
}

/**
 * When each action was pressed, in whole ms from the start of the voice note (or of the séance
 * when there is none), so the transcript's times line up with the actions (Prompt 50). A key
 * pressed before the microphone started is at 0.
 */
export function actionTimes(keyAt: number[], voiceAt: number | null, seanceAt: number): number[] {
  const start = voiceAt ?? seanceAt;
  return keyAt.map((t) => Math.max(0, Math.round(t - start)));
}

/** A thumbnail `width` wide, keeping the screen's shape. */
export function thumbnailSize(width: number, height: number, target: number) {
  return { width: target, height: Math.round((height * target) / width) };
}

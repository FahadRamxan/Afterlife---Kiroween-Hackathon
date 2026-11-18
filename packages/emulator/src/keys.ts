// Key sequences (Prompt 26): "1{Enter}PANADOL{Tab}2{F2}" <-> keystrokes <-> js-dos key codes.
// Pure, so the Possessor, the recorder and both emulator controllers share one language.

export const MODIFIERS = ['Ctrl', 'Alt', 'Shift'] as const;
export type Modifier = (typeof MODIFIERS)[number];

const NAMED = [
  'Enter',
  'Esc',
  'Tab',
  'Backspace',
  'Ins',
  'Del',
  'Home',
  'End',
  'PgUp',
  'PgDn',
  'Up',
  'Down',
  'Left',
  'Right',
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
] as const;
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'];

/** Every key name inside braces: the named keys, then letters and digits (for {Alt+X}). */
export const KEY_NAMES: readonly string[] = [...NAMED, ...LETTERS];

export type KeyStroke =
  { kind: 'text'; text: string } | { kind: 'key'; key: string; mods: Modifier[] };

export class KeyParseError extends Error {
  override name = 'KeyParseError';
  constructor(
    message: string,
    readonly at: number,
  ) {
    super(`${message} at ${at}`);
  }
}

const BY_LOWER = new Map(KEY_NAMES.map((k) => [k.toLowerCase(), k]));
const MOD_BY_LOWER = new Map(MODIFIERS.map((m) => [m.toLowerCase(), m]));
const typable = (ch: string) => ch >= ' ' && ch <= '~';

/**
 * Reads a key sequence. Plain characters are typed as text; {Name} presses a key; {Ctrl+Alt+Del}
 * a combination (modifiers come out in the order Ctrl, Alt, Shift); {{} and {}} type a brace.
 * Names are case-insensitive. Throws KeyParseError, with the position, for anything else.
 */
export function parseKeys(seq: string): KeyStroke[] {
  const out: KeyStroke[] = [];
  const addText = (t: string) => {
    const last = out.at(-1);
    if (last?.kind === 'text') last.text += t;
    else out.push({ kind: 'text', text: t });
  };
  let i = 0;
  while (i < seq.length) {
    const ch = seq[i]!;
    if (seq.startsWith('{{}', i) || seq.startsWith('{}}', i)) {
      addText(seq[i + 1]!);
      i += 3;
      continue;
    }
    if (ch === '}') throw new KeyParseError('stray "}"', i);
    if (ch !== '{') {
      if (!typable(ch)) throw new KeyParseError(`cannot type "${ch}"`, i);
      addText(ch);
      i++;
      continue;
    }
    const close = seq.indexOf('}', i);
    if (close < 0) throw new KeyParseError('unclosed "{"', i);
    const body = seq.slice(i + 1, close);
    if (!body) throw new KeyParseError('empty {}', i);
    const parts = body.split('+');
    const name = parts.pop()!;
    const mods: Modifier[] = [];
    for (const p of parts) {
      const m = MOD_BY_LOWER.get(p.toLowerCase());
      if (!m) throw new KeyParseError(`unknown modifier "${p}"`, i);
      if (mods.includes(m)) throw new KeyParseError(`repeats ${m}`, i);
      mods.push(m);
    }
    if (!name) throw new KeyParseError('no key after the modifiers', i);
    const key = BY_LOWER.get(name.toLowerCase());
    if (!key) throw new KeyParseError(`unknown key "${name}"`, i);
    out.push({ kind: 'key', key, mods: MODIFIERS.filter((m) => mods.includes(m)) });
    i = close + 1;
  }
  return out;
}

/** Writes keystrokes as a sequence in the canonical spelling parseKeys reads. */
export function printKeys(strokes: KeyStroke[]): string {
  return strokes
    .map((s) =>
      s.kind === 'text'
        ? s.text.replace(/[{}]/g, (b) => `{${b}}`)
        : `{${[...MODIFIERS.filter((m) => s.mods.includes(m)), s.key].join('+')}}`,
    )
    .join('');
}

// js-dos key codes (GLFW numbering, as in js-dos's own key table).
const SHIFT = 340;
const MOD_CODE: Record<Modifier, number> = { Ctrl: 341, Alt: 342, Shift: SHIFT };
const NAMED_CODE: Record<string, number> = {
  Esc: 256,
  Enter: 257,
  Tab: 258,
  Backspace: 259,
  Ins: 260,
  Del: 261,
  Right: 262,
  Left: 263,
  Down: 264,
  Up: 265,
  PgUp: 266,
  PgDn: 267,
  Home: 268,
  End: 269,
  ...Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`F${i + 1}`, 290 + i])),
};
// On a US keyboard: the unshifted key for each character, and whether Shift is held.
const BASE = " '-,./0123456789;=[\\]`ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SHIFTED: Record<string, string> = {
  '!': '1',
  '@': '2',
  '#': '3',
  $: '4',
  '%': '5',
  '^': '6',
  '&': '7',
  '*': '8',
  '(': '9',
  ')': '0',
  _: '-',
  '+': '=',
  '{': '[',
  '}': ']',
  '|': '\\',
  ':': ';',
  '"': "'",
  '<': ',',
  '>': '.',
  '?': '/',
  '~': '`',
};

function charCodes(ch: string): number[] {
  if (ch >= 'a' && ch <= 'z') return [ch.toUpperCase().charCodeAt(0)];
  if (ch >= 'A' && ch <= 'Z') return [SHIFT, ch.charCodeAt(0)];
  if (BASE.includes(ch)) return [ch.charCodeAt(0)];
  const base = SHIFTED[ch];
  if (base) return [SHIFT, base.charCodeAt(0)];
  throw new KeyParseError(`cannot type "${ch}"`, 0);
}

/**
 * The js-dos key presses for keystrokes: one press per character or key, each a list of codes
 * held together (modifiers first), for CommandInterface.simulateKeyPress(...codes).
 */
export function jsdosKeys(strokes: KeyStroke[]): number[][] {
  return strokes.flatMap((s) => {
    if (s.kind === 'text') return [...s.text].map(charCodes);
    const code = NAMED_CODE[s.key] ?? s.key.charCodeAt(0);
    return [[...s.mods.map((m) => MOD_CODE[m]), code]];
  });
}

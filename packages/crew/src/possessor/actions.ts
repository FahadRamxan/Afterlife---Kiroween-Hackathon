// What the Possessor can do on a screen (Prompt 48), read from its ScreenModel only: pick a menu
// item, press a key the status bar offers, or fill the field the app is waiting on. Deterministic:
// the LLM only proposes the value typed into a field (values.ts). Esc is not an exploring action;
// it is how the Possessor goes back (crew.md: Esc always returns to safety).
import type { ScreenModel } from '@afterlife/screen';

export type FieldInfo = {
  /** The field's own label, or the text left of it on its row ("Customer ID (blank = walk-in)"). */
  label: string;
  row: number;
  col: number;
  /** How many characters fit; null when the app does not show it (a bare prompt). */
  length: number | null;
  kind: 'reverse' | 'underscore' | 'prompt';
};

export type PossessAction =
  | { kind: 'menu'; id: string; keys: string; label: string }
  | { kind: 'hint'; id: string; keys: string; label: string; save: boolean }
  | { kind: 'fill'; id: string; field: FieldInfo };

/** Menu items and key hints that leave the program. Never chosen: the app would be gone. */
export const EXIT_WORDS = /\b(exit|quit|log ?out|log ?off|shut ?down|bye|end program|to dos)\b/i;

/** Hints whose action may write data: tried before the other keys on their screen. */
export const SAVE_WORDS = /\b(save|add|new|post|finish|confirm|ok|continue|next|insert|issue)\b/i;

const NAMED = new Map(
  [
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
  ].map((k) => [k.toLowerCase(), k]),
);
NAMED.set('return', 'Enter');
NAMED.set('escape', 'Esc');
NAMED.set('pgdown', 'PgDn');
NAMED.set('pageup', 'PgUp');
NAMED.set('pagedown', 'PgDn');

/**
 * The key sequences a status-bar hint names. "F2" is {F2}, "A" is A, "PgDn/PgUp" is both,
 * "Enter on blank code" is {Enter}. A range ("1-5") names the menu's own keys, so nothing here.
 */
export function hintKeys(key: string): string[] {
  return key.split('/').flatMap((part) => {
    const word = part.trim().split(/\s+/)[0] ?? '';
    const named = NAMED.get(word.toLowerCase());
    if (named) return [`{${named}}`];
    if (/^[A-Za-z0-9]$/.test(word)) return [word.toUpperCase()];
    return [];
  });
}

/** The label of a field: its own, or the nearest text left of it on the same row. */
export function fieldLabel(
  m: ScreenModel,
  f: ScreenModel['fields'][number],
  text?: string[],
): string {
  if (f.label) return f.label;
  // The last "Label:" left of the box on its row ("Code: PAN500   Qty: [    ]" gives Qty).
  const line = text?.[f.row]?.slice(0, f.col);
  const said = line ? /([A-Za-z][^:]*?):\s*$/.exec(line) : null;
  if (said) return said[1]!.replace(/^.*\s{2,}/, '').trim();
  // A box drawn over its own prompt: that prompt's label.
  const prompt = m.fields.find(
    (x) => x !== f && x.kind === 'prompt' && x.row === f.row && x.col === f.col,
  );
  if (prompt?.label) return prompt.label;
  const left = m.texts
    .filter((t) => t.row === f.row && t.col + t.text.length <= f.col)
    .sort((a, b) => b.col - a.col)[0];
  return (left?.text ?? '').trim().replace(/:$/, '');
}

/**
 * The field the app is waiting on: the focused one, else the first empty input box. A bare prompt
 * counts only with the cursor on it. On a menu screen the menu items are the actions instead.
 */
export function activeField(m: ScreenModel, text?: string[]): FieldInfo | null {
  if (m.menu && m.menu.items.length) return null;
  const f =
    m.fields.find((x) => x.focused) ??
    m.fields.find((x) => x.kind !== 'prompt' && x.value.trim() === '') ??
    (m.cursor
      ? m.fields.find((x) => x.row === m.cursor!.row && x.col === m.cursor!.col)
      : undefined);
  if (!f) return null;
  return { label: fieldLabel(m, f, text), row: f.row, col: f.col, length: f.length, kind: f.kind };
}

/**
 * Everything the Possessor may try on this screen, in the order it tries them: fill the field the
 * app waits on, then keys that may save, then menu items, then the other keys. Each sequence once.
 */
export function screenActions(m: ScreenModel, text?: string[]): PossessAction[] {
  // A question on the screen ("SAVE SALE OF RS 100.00 FOR P001? (Y/N)"): the app waits for Yes or
  // No and nothing else. Yes may save, so it goes first.
  const question = m.messages.find((x) => /[([]\s*Y\s*\/\s*N\s*[)\]]|\bY\/N\b/i.test(x.text));
  if (question) {
    const q = question.text.trim();
    return [
      { kind: 'hint', id: 'answer:Y', keys: 'Y', label: `Y: ${q}`, save: true },
      { kind: 'hint', id: 'answer:N', keys: 'N', label: `N: ${q}`, save: false },
    ];
  }
  const out: PossessAction[] = [];
  const seen = new Set<string>();
  const field = activeField(m, text);
  if (field) out.push({ kind: 'fill', id: `fill:${field.row}:${field.col}`, field });
  const hints = (m.status?.hints ?? []).flatMap((h) =>
    EXIT_WORDS.test(h.action)
      ? []
      : hintKeys(h.key)
          .filter((k) => k !== '{Esc}')
          .map((keys) => ({
            keys,
            label: `${h.key}=${h.action}`,
            save: SAVE_WORDS.test(h.action),
          })),
  );
  const add = (a: PossessAction & { keys: string }) => {
    if (seen.has(a.keys)) return;
    seen.add(a.keys);
    out.push(a);
  };
  for (const h of hints.filter((x) => x.save)) add({ kind: 'hint', id: `hint:${h.keys}`, ...h });
  const items = m.menu?.items ?? [];
  // A bar menu (a highlight moved with the arrows, Enter to choose): an item is reached from the
  // highlighted one with Down or Up, then Enter. Its arrow and Enter hints say the same thing.
  const bar = m.menu?.kind === 'bar' || (items.length > 0 && items.every((i) => !i.key));
  const sel = Math.max(
    0,
    items.findIndex((i) => i.selected),
  );
  items.forEach((i, n) => {
    if (EXIT_WORDS.test(i.label)) return;
    if (i.key && !bar) add({ kind: 'menu', id: `menu:${i.key}`, keys: i.key, label: i.label });
    else if (bar) {
      const move = n >= sel ? '{Down}'.repeat(n - sel) : '{Up}'.repeat(sel - n);
      out.push({ kind: 'menu', id: `menu:${i.label}`, keys: `${move}{Enter}`, label: i.label });
      seen.add(`${move}{Enter}`);
    }
  });
  for (const h of hints.filter((x) => !x.save))
    if (!(bar && ['{Up}', '{Down}', '{Enter}'].includes(h.keys)))
      add({ kind: 'hint', id: `hint:${h.keys}`, ...h });
  return out;
}

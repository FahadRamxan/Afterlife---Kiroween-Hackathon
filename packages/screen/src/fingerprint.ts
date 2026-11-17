// Screen fingerprint (Prompt 24): a stable id for a screen's layout, so the Possessor knows
// whether it has seen a screen before. Pure; SHA-256 through Web Crypto (browser and Node).
import type { ScreenModel } from './semantics';

/** Numbers change (the clock, totals, page numbers); their place on the screen does not. */
const mask = (s: string) => s.replace(/\d+/g, '#');

/**
 * The layout as a canonical string: what makes a screen this screen. Left out on purpose:
 * values typed into fields or shown after a label, table rows, highlighted text (DOS apps show
 * data in another colour), messages (a state of the screen, not another screen), which menu item
 * is selected, the cursor, and every digit outside the status bar.
 */
export function layoutKey(m: ScreenModel): string {
  const tableRows = new Set(m.tables.flatMap((t) => t.rows.map((r) => r.row)));
  return JSON.stringify({
    rows: m.rows,
    title: m.title && { name: mask(m.title.name), parts: m.title.parts.map(mask) },
    // The status bar's digits are keys (F2, F3, 1-5), not changing numbers.
    status: m.status && {
      text: m.status.text,
      hints: m.status.hints.map((h) => [h.key, h.action]),
    },
    menu: m.menu && {
      kind: m.menu.kind,
      items: m.menu.items.map((i) => [i.key, i.label, i.row, i.col]),
    },
    fields: m.fields.map((f) => [f.kind, f.label, f.row, f.col, f.length]),
    labels: m.labels.map((l) => [l.label, l.row, l.col]),
    tables: m.tables.map((t) => [t.headerRow, t.columns.map((c) => c.name)]),
    texts: m.texts
      .filter((t) => !t.highlight && !tableRows.has(t.row))
      .map((t) => [mask(t.text), t.row, t.col]),
  });
}

/** "fp_" and the first 16 hex digits of the SHA-256 of the layout key. */
export async function fingerprint(m: ScreenModel): Promise<string> {
  const bytes = new TextEncoder().encode(layoutKey(m));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `fp_${hex.slice(0, 16)}`;
}

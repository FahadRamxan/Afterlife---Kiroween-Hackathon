// Screen semantics (Prompt 23): what is on a decoded text screen. Deterministic heuristics over
// the characters and colours; an LLM may refine the result later through refineScreen, which
// validates whatever it returns.
import { z } from 'zod';
import type { ScreenGrid } from './decoder';

const COLS = 80;
const int = () => z.number().int();

export const ScreenModelSchema = z.object({
  rows: z.union([z.literal(25), z.literal(50)]),
  /** The coloured bar on the first row: its text, the parts split by wide gaps, the centred part. */
  title: z
    .object({ row: int(), text: z.string(), parts: z.array(z.string()), name: z.string() })
    .nullable(),
  /** The coloured bar on the last row, with its "Key=Action" hints. */
  status: z
    .object({
      row: int(),
      text: z.string(),
      hints: z.array(z.object({ key: z.string(), action: z.string() })),
    })
    .nullable(),
  menu: z
    .object({
      kind: z.enum(['numbered', 'lettered', 'bar']),
      items: z.array(
        z.object({
          key: z.string().nullable(),
          label: z.string(),
          row: int(),
          col: int(),
          selected: z.boolean(),
        }),
      ),
    })
    .nullable(),
  fields: z.array(
    z.object({
      kind: z.enum(['reverse', 'underscore', 'prompt']),
      label: z.string().nullable(),
      row: int(),
      col: int(),
      /** null for a prompt: the app does not show how long the answer may be. */
      length: int().positive().nullable(),
      value: z.string(),
      focused: z.boolean(),
    }),
  ),
  /** "Label: value" pairs that are shown, not typed into. */
  labels: z.array(z.object({ label: z.string(), value: z.string(), row: int(), col: int() })),
  tables: z.array(
    z.object({
      headerRow: int(),
      columns: z.array(
        z.object({
          name: z.string(),
          col: int(),
          length: int().positive(),
          align: z.enum(['left', 'right']),
        }),
      ),
      rows: z.array(z.object({ row: int(), cells: z.array(z.string()) })),
    }),
  ),
  /** A line near the bottom in its own colour: red behind it means an error. */
  messages: z.array(
    z.object({ kind: z.enum(['error', 'info']), text: z.string(), row: int(), col: int() }),
  ),
  /** Every other piece of text, with whether it is highlighted (not in the body colours). */
  texts: z.array(z.object({ text: z.string(), row: int(), col: int(), highlight: z.boolean() })),
  cursor: z.object({ row: int(), col: int() }).nullable(),
});
export type ScreenModel = z.infer<typeof ScreenModelSchema>;

/** A run of cells with the same background colour. */
type Run = { start: number; end: number; bg: number };

/** Groups in first-seen order (Map.groupBy, without needing the ES2024 library). */
function groupBy<T, K>(items: T[], key: (t: T) => K): T[][] {
  const m = new Map<K, T[]>();
  for (const it of items) m.set(key(it), [...(m.get(key(it)) ?? []), it]);
  return [...m.values()];
}

// Box-drawing characters (CP437 179-218 as Unicode) are frames, not text.
const isBox = (ch: string) => ch >= '\u2500' && ch <= '\u257f';
const rowText = (grid: ScreenGrid, r: number) =>
  grid.cells[r]!.map((c) => (c.code < 0 || isBox(c.char) ? ' ' : c.char)).join('');

/** Background runs of a row. A blank cell has no foreground worth comparing. */
function runs(grid: ScreenGrid, r: number): Run[] {
  const out: Run[] = [];
  for (let c = 0; c < COLS; c++) {
    const bg = grid.cells[r]![c]!.bg;
    const last = out.at(-1);
    if (last && last.bg === bg) last.end = c;
    else out.push({ start: c, end: c, bg });
  }
  return out;
}

/** Maximal pieces of text separated by gaps of `gap` or more spaces. */
function pieces(text: string, gap = 2): { text: string; col: number }[] {
  const out: { text: string; col: number }[] = [];
  const re = new RegExp(`\\S(?:.*?\\S)?(?=\\s{${gap},}|\\s*$)`, 'g');
  for (const m of text.matchAll(re)) out.push({ text: m[0], col: m.index! });
  return out;
}

const tokens = (text: string) =>
  [...text.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    start: m.index!,
    end: m.index! + m[0].length - 1,
  }));

const mostCommon = (values: number[]) => {
  const count = new Map<number, number>();
  for (const v of values) count.set(v, (count.get(v) ?? 0) + 1);
  return [...count].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
};

/** A light background (grey or white): the DOS look of an input box or a selection bar. */
const isReverse = (bg: number) => bg === 7 || bg === 15;

export function analyzeScreen(grid: ScreenGrid): ScreenModel {
  const last = grid.rows - 1;
  const cell = (r: number, c: number) => grid.cells[r]![c]!;
  const isBlank = (r: number, c: number) => cell(r, c).code === 0x20;

  // The body colours: the commonest background, and the commonest text colour on it.
  const bgs: number[] = [];
  const fgs: number[] = [];
  for (let r = 1; r < last; r++) for (let c = 0; c < COLS; c++) bgs.push(cell(r, c).bg);
  const bodyBg = mostCommon(bgs);
  for (let r = 1; r < last; r++)
    for (let c = 0; c < COLS; c++)
      if (!isBlank(r, c) && cell(r, c).bg === bodyBg) fgs.push(cell(r, c).fg);
  const bodyFg = mostCommon(fgs);
  /** Not in the body colours: another background, or text in another colour. */
  const highlighted = (r: number, c: number) =>
    cell(r, c).bg !== bodyBg || (!isBlank(r, c) && cell(r, c).fg !== bodyFg);

  const used: boolean[][] = Array.from({ length: grid.rows }, () => new Array(COLS).fill(false));
  const mark = (r: number, from: number, to: number) => {
    for (let c = Math.max(0, from); c <= Math.min(COLS - 1, to); c++) used[r]![c] = true;
  };
  const text = Array.from({ length: grid.rows }, (_, r) => rowText(grid, r));

  // Title and status bars: a whole row on one background that is not the body's.
  const bar = (r: number) => {
    const rs = runs(grid, r);
    if (rs.length !== 1 || rs[0]!.bg === bodyBg || !text[r]!.trim()) return null;
    return { text: text[r]!.trim(), parts: pieces(text[r]!) };
  };
  const top = bar(0);
  const centre = (p: { text: string; col: number }) =>
    Math.abs(p.col + p.text.length / 2 - COLS / 2);
  const title = top
    ? {
        row: 0,
        text: top.text,
        parts: top.parts.map((p) => p.text),
        name: [...top.parts].sort((a, b) => centre(a) - centre(b))[0]!.text,
      }
    : null;
  if (title) mark(0, 0, COLS - 1);
  const bottom = bar(last);
  const status = bottom
    ? {
        row: last,
        text: bottom.text,
        hints: bottom.parts.flatMap((p) => {
          const m = /^(\S.*?)=(\S.*)$/.exec(p.text) ?? /^(\d+-\d+)\s+(\S.*)$/.exec(p.text);
          return m ? [{ key: m[1]!, action: m[2]! }] : [];
        }),
      }
    : null;
  if (status) mark(last, 0, COLS - 1);
  const inner = Array.from({ length: grid.rows }, (_, r) => r).filter(
    (r) => !(r === 0 && title) && !(r === last && status),
  );

  // Tables: a header of 3+ upper-case words over rows whose values line up under them.
  const tables: ScreenModel['tables'] = [];
  for (let i = 0; i < inner.length; i++) {
    const h = inner[i]!;
    const head = tokens(text[h]!);
    if (
      head.length < 3 ||
      head.some((t) => t.text.endsWith(':') || /[a-z]/.test(t.text) || /^[\d.,/-]+$/.test(t.text))
    )
      continue;
    // Real header words are words: a spaced-out title ("S H I F A") is not a header.
    if (head.filter((t) => t.text.length >= 2).length < head.length - 1) continue;
    const data: number[] = [];
    for (let r = h + 1; r < grid.rows && inner.includes(r); r++) {
      if (tokens(text[r]!).length < 2) break;
      data.push(r);
    }
    if (data.length === 0) {
      // An empty table (a bill with no lines yet): a highlighted header of 4+ words across at
      // least half the screen. A centred heading ("IQRA MODEL SCHOOL") is shorter.
      const lit = head.every((t) => [...t.text].every((_, k) => highlighted(h, t.start + k)));
      if (lit && head.length >= 4 && head.at(-1)!.end - head[0]!.start >= 40) {
        tables.push({
          headerRow: h,
          columns: head.map((t, k) => ({
            name: t.text,
            col: t.start,
            length: (head[k + 1]?.start ?? t.end + 2) - t.start,
            align: 'left' as const,
          })),
          rows: [],
        });
        mark(h, head[0]!.start, head.at(-1)!.end);
      }
      continue;
    }
    const rowsUsed = [h, ...data];
    // Columns grow from their header word over the blocks of text between blank gutters.
    const gutter = (c: number) => rowsUsed.every((r) => text[r]![c] === ' ');
    const blocks: { start: number; end: number }[] = [];
    for (let c = 0; c < COLS; c++)
      if (!gutter(c)) {
        const b = blocks.at(-1);
        if (b && b.end === c - 1) b.end = c;
        else blocks.push({ start: c, end: c });
      }
    const cols = head.map((t) => ({ name: t.text, start: t.start, end: t.end }));
    let fits = true;
    for (const b of blocks) {
      const over = cols.filter((c) => c.start <= b.end && b.start <= c.end);
      if (over.length > 1) continue; // one block under two words: they share it
      if (over.length === 1) {
        over[0]!.start = Math.min(over[0]!.start, b.start);
        over[0]!.end = Math.max(over[0]!.end, b.end);
      } else if (b.start > cols.at(-1)!.end) {
        continue; // right of every header word: a note, not a column
      } else {
        const left = cols.filter((c) => c.end < b.start).at(-1);
        if (!left) fits = false;
        else left.end = Math.max(left.end, b.end);
      }
    }
    if (!fits) continue;
    for (let k = 1; k < cols.length; k++)
      if (cols[k]!.start <= cols[k - 1]!.end) cols[k]!.start = cols[k - 1]!.end + 1;
    // A column edge never cuts through a word: if it does, these rows are not a table.
    const cuts = data.some((r) =>
      cols.slice(1).some((c) => text[r]![c.start - 1] !== ' ' && text[r]![c.start] !== ' '),
    );
    if (cuts) continue;
    const span = (r: number, k: number) => {
      const raw = text[r]!.slice(cols[k]!.start, cols[k]!.end + 1);
      if (!raw.trim()) return null;
      return {
        value: raw.trim(),
        start: cols[k]!.start + raw.length - raw.trimStart().length,
        end: cols[k]!.start + raw.trimEnd().length - 1,
      };
    };
    // Values line up under their header word: they start where it starts, end where it ends, or
    // sit inside it (a number printed in a field as wide as the word).
    let aligned = 0;
    let values = 0;
    for (const r of data)
      for (let k = 0; k < cols.length; k++) {
        const v = span(r, k);
        if (!v) continue;
        values++;
        const under = v.start >= head[k]!.start && v.end <= head[k]!.end;
        if (v.start === head[k]!.start || v.end === head[k]!.end || under) aligned++;
      }
    if (values === 0 || aligned / values < 0.75) continue;
    tables.push({
      headerRow: h,
      columns: cols.map((c, k) => {
        const vs = data.map((r) => span(r, k)).filter((v) => v !== null);
        const sameEnd = vs.length > 0 && new Set(vs.map((v) => v.end)).size === 1;
        const sameStart = new Set(vs.map((v) => v.start)).size === 1;
        const numbers = vs.every((v) => /^-?[\d.,]+$/.test(v.value));
        return {
          name: c.name,
          col: c.start,
          length: c.end - c.start + 1,
          align: sameEnd && (!sameStart || numbers) ? ('right' as const) : ('left' as const),
        };
      }),
      rows: data.map((r) => ({ row: r, cells: cols.map((_, k) => span(r, k)?.value ?? '') })),
    });
    for (const r of rowsUsed) for (const c of cols) mark(r, c.start, c.end);
    i += data.length;
  }
  const inTable = new Set(tables.flatMap((t) => [t.headerRow, ...t.rows.map((r) => r.row)]));

  // Menus: numbered or lettered items in one column, or a list with one highlighted bar.
  type Item = { key: string | null; label: string; row: number; col: number; selected: boolean };
  let menu: ScreenModel['menu'] = null;
  const candidates = inner.filter((r) => !inTable.has(r));
  const reverseRun = (r: number) => runs(grid, r).find((x) => isReverse(x.bg) && x.bg !== bodyBg);
  for (const kind of ['numbered', 'lettered'] as const) {
    // "1  New Bill", and the commonest DOS style too: "1. New Slip", "2) Parties", "A. Add".
    const re =
      kind === 'numbered'
        ? /^(\d{1,2})[.)]?\s{1,3}(\S.*)$/
        : /^([A-Z])(?:[.)]\s{1,3}|\s{2,})(\S.*)$/;
    const items: Item[] = [];
    for (const r of candidates) {
      const p = pieces(text[r]!, 3);
      if (p.length !== 1) continue;
      const m = re.exec(p[0]!.text);
      if (!m || m[2]!.includes(':') || m[2]!.includes('=')) continue;
      items.push({ key: m[1]!, label: m[2]!, row: r, col: p[0]!.col, selected: !!reverseRun(r) });
    }
    const best = groupBy(items, (it) => it.col).sort((a, b) => b.length - a.length)[0];
    if (best && best.length >= 2 && new Set(best.map((b) => b.key)).size === best.length) {
      menu = { kind, items: best };
      break;
    }
  }
  if (!menu) {
    const items: Item[] = [];
    for (const r of candidates) {
      const p = pieces(text[r]!);
      if (p.length !== 1 || p[0]!.text.length > 30 || p[0]!.text.includes(':')) continue;
      const rev = reverseRun(r);
      const end = p[0]!.col + p[0]!.text.length - 1;
      items.push({
        key: null,
        label: p[0]!.text,
        row: r,
        col: p[0]!.col,
        selected: !!rev && rev.start <= p[0]!.col && end <= rev.end,
      });
    }
    const best = groupBy(items, (it) => it.col).sort((a, b) => b.length - a.length)[0];
    if (best && best.length >= 3 && best.filter((b) => b.selected).length === 1)
      menu = { kind: 'bar', items: best };
  }
  const menuRows = new Set(menu?.items.map((i) => i.row) ?? []);
  for (const it of menu?.items ?? []) {
    mark(it.row, it.col, text[it.row]!.indexOf(it.label, it.col) + it.label.length - 1);
    const rev = it.selected ? reverseRun(it.row) : undefined;
    if (rev) mark(it.row, rev.start, rev.end);
  }

  // Fields and "Label: value" pairs, row by row.
  const fields: ScreenModel['fields'] = [];
  const labels: ScreenModel['labels'] = [];
  const cur = grid.cursor;
  const labelBefore = (r: number, col: number) => {
    const m = /([A-Za-z][A-Za-z0-9 .#/]*?)\s*:\s*$/.exec(text[r]!.slice(0, col));
    if (!m) return null;
    const start = m.index!;
    // A label starts the row's text or follows a wide gap.
    if (start > 0 && text[r]!.slice(Math.max(0, start - 2), start).trim()) return null;
    return { label: m[1]!.replace(/\s+/g, ' '), start };
  };
  for (const r of candidates) {
    if (menuRows.has(r)) continue;
    // Reverse-video input boxes.
    for (const run of runs(grid, r)) {
      if (!isReverse(run.bg) || run.bg === bodyBg) continue;
      const lab = labelBefore(r, run.start);
      fields.push({
        kind: 'reverse',
        label: lab?.label ?? null,
        row: r,
        col: run.start,
        length: run.end - run.start + 1,
        value: text[r]!.slice(run.start, run.end + 1).trim(),
        focused: !!cur && cur.row === r && cur.col >= run.start && cur.col <= run.end,
      });
      if (lab) mark(r, lab.start, run.start - 1);
      mark(r, run.start, run.end);
    }
    // ____ boxes.
    for (const m of text[r]!.matchAll(/_{2,}/g)) {
      const col = m.index!;
      if (used[r]![col]) continue;
      const lab = labelBefore(r, col);
      fields.push({
        kind: 'underscore',
        label: lab?.label ?? null,
        row: r,
        col,
        length: m[0].length,
        value: '',
        focused: !!cur && cur.row === r && cur.col >= col && cur.col < col + m[0].length,
      });
      if (lab) mark(r, lab.start, col - 1);
      mark(r, col, col + m[0].length - 1);
    }
    // "Label: value" shown, or "Label:" with nothing after it: a prompt.
    for (const m of text[r]!.matchAll(/(?<=^\s*|\s{2,})([A-Za-z][A-Za-z0-9 .#/]*?)\s*:(?=\s|$)/g)) {
      const start = m.index!;
      const colon = start + m[0].length - 1;
      if (used[r]![start] || used[r]![colon]) continue;
      const rest = text[r]!.slice(colon + 1);
      const next = /\S/.exec(rest);
      const label = m[1]!.replace(/\s+/g, ' ');
      if (next && next.index <= 10 && !used[r]![colon + 1 + next.index]) {
        const value = pieces(rest.slice(next.index), 2)[0]!.text;
        labels.push({ label, value, row: r, col: start });
        mark(r, start, colon + next.index + value.length);
      } else {
        fields.push({
          kind: 'prompt',
          label,
          row: r,
          // The answer goes after "Label: ", but never off the right edge.
          col: Math.min(colon + 2, COLS - 1),
          length: null,
          value: '',
          focused: !!cur && cur.row === r && cur.col > colon,
        });
        mark(r, start, colon);
      }
    }
  }

  // Messages: a row near the bottom whose only text is highlighted, all in one colour. Red behind
  // it means an error. Its column is where the text starts.
  const messages: ScreenModel['messages'] = [];
  for (const r of candidates) {
    if (r < Math.floor(grid.rows * 0.8) || menuRows.has(r)) continue;
    const first = text[r]!.search(/\S/);
    if (first < 0) continue;
    const end = text[r]!.trimEnd().length - 1;
    if (used[r]!.slice(first, end + 1).some(Boolean)) continue;
    const lit: number[] = [];
    for (let c = first; c <= end; c++) if (!isBlank(r, c)) lit.push(c);
    if (!lit.every((c) => highlighted(r, c))) continue;
    if (new Set(lit.map((c) => `${cell(r, c).bg}:${cell(r, c).fg}`)).size !== 1) continue;
    messages.push({
      kind: cell(r, first).bg === 4 ? 'error' : 'info',
      text: text[r]!.slice(first, end + 1),
      row: r,
      col: first,
    });
    mark(r, first, end);
  }

  // Everything else is plain text.
  const texts: ScreenModel['texts'] = [];
  for (const r of inner) {
    let start = -1;
    for (let c = 0; c <= COLS; c++) {
      const free = c < COLS && !used[r]![c];
      if (free && start < 0) start = c;
      if (!free && start >= 0) {
        for (const p of pieces(text[r]!.slice(start, c))) {
          const col = start + p.col;
          texts.push({
            text: p.text,
            row: r,
            col,
            highlight: [...p.text].some((ch, k) => ch !== ' ' && highlighted(r, col + k)),
          });
        }
        start = -1;
      }
    }
  }

  return {
    rows: grid.rows,
    title,
    status,
    menu,
    fields,
    labels,
    tables,
    messages,
    texts,
    cursor: grid.cursor,
  };
}

export class ScreenRefineError extends Error {
  override name = 'ScreenRefineError';
}

/** Anything that can improve a model: in production the LLM (through @afterlife/crew). */
export type ScreenRefiner = (draft: ScreenModel, grid: ScreenGrid) => Promise<unknown> | unknown;

/**
 * Lets an LLM improve the deterministic model. Its answer is validated with zod and must stay on
 * the screen (every row and column inside the grid). If not, ScreenRefineError: the caller keeps
 * the draft.
 */
export async function refineScreen(
  grid: ScreenGrid,
  draft: ScreenModel,
  refiner: ScreenRefiner,
): Promise<ScreenModel> {
  const parsed = ScreenModelSchema.safeParse(await refiner(draft, grid));
  if (!parsed.success)
    throw new ScreenRefineError(`The refined screen model is not valid: ${parsed.error.message}`);
  const m = parsed.data;
  const at: [number, number][] = [
    ...m.fields.map((f): [number, number] => [f.row, f.col]),
    ...m.labels.map((l): [number, number] => [l.row, l.col]),
    ...m.messages.map((x): [number, number] => [x.row, x.col]),
    ...m.texts.map((x): [number, number] => [x.row, x.col]),
    ...(m.menu?.items.map((i): [number, number] => [i.row, i.col]) ?? []),
    ...m.tables.flatMap((t) => t.columns.map((c): [number, number] => [t.headerRow, c.col])),
  ];
  const off = at.find(([r, c]) => r < 0 || r >= grid.rows || c < 0 || c >= COLS);
  if (off || m.rows !== grid.rows)
    throw new ScreenRefineError(
      `The refined screen model points off the screen at ${off ? off.join(',') : 'its row count'}`,
    );
  return m;
}

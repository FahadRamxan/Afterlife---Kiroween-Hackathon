// The Possessor's input strategy (Prompt 49): what kind of value a field takes, a typical value,
// and the boundary values worth trying. These probes are what reveal hidden rules: a quantity of
// 0, a code that does not exist, a date on the other side of 2000. Every value fits the field's
// width and its type (inputs.prop.test.ts).
import type { FieldInfo } from './actions';
import type { DataSample } from './values';

export type DateFormat = 'DD/MM/YY' | 'DD/MM/YYYY' | 'DD-MM-YYYY' | 'DDMMYY' | 'YYYYMMDD';
export type MonthFormat = 'MMYYYY' | 'MM/YYYY' | 'YYYYMM';

export type FieldType =
  | { kind: 'quantity' }
  | { kind: 'money'; decimals: number }
  | { kind: 'date'; format: DateFormat }
  | { kind: 'month'; format: MonthFormat }
  | { kind: 'code' }
  | { kind: 'phone' }
  | { kind: 'name' }
  | { kind: 'text' };

/** Where a field's type came from, for the log and the tests. */
export type TypedField = {
  type: FieldType;
  /** At most this many characters. */
  width: number;
  /** The data file field it was matched to, when there was one. */
  dbf: { file: string; name: string; type: string; length: number } | null;
  /** Values of that field in the data files, as samples of what exists. */
  existing: string[];
  /** The screen says the field may be left blank ("blank = walk-in"). */
  blankOk: boolean;
};

export type ProbeReason =
  | 'typical'
  | 'zero'
  | 'max-width'
  | 'negative'
  | 'past-date'
  | 'future-date'
  | 'y2k'
  | 'existing-key'
  | 'new-key'
  | 'blank';

export type Probe = { value: string; why: ProbeReason };

const words = (s: string): string[] => s.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
const has = (w: string[], ...xs: string[]) => xs.some((x) => w.includes(x));

function dateFormatIn(label: string, width: number): DateFormat {
  const l = label.toUpperCase();
  if (l.includes('DD/MM/YYYY')) return 'DD/MM/YYYY';
  if (l.includes('DD-MM-YYYY')) return 'DD-MM-YYYY';
  if (l.includes('DD/MM/YY')) return 'DD/MM/YY';
  if (l.includes('DDMMYY')) return 'DDMMYY';
  if (l.includes('YYYYMMDD')) return 'YYYYMMDD';
  return width >= 10 ? 'DD/MM/YYYY' : width === 6 ? 'DDMMYY' : 'DD/MM/YY';
}

function monthFormatIn(label: string): MonthFormat | null {
  const l = label.toUpperCase();
  if (l.includes('MM/YYYY')) return 'MM/YYYY';
  if (l.includes('MMYYYY')) return 'MMYYYY';
  if (l.includes('YYYYMM')) return 'YYYYMM';
  return null;
}

/** The data file field whose name matches a word of the label ("Party ID" matches PARTY_ID). */
function matchDbf(label: string, samples: DataSample[]) {
  const w = words(label).filter((x) => x.length >= 2);
  const joined = w.join('_');
  let best: { s: DataSample; f: DataSample['fields'][number]; score: number } | null = null;
  for (const s of samples)
    for (const f of s.fields) {
      const score =
        f.name === joined
          ? 3
          : w.includes(f.name)
            ? 2
            : w.some((x) => f.name.split('_').includes(x))
              ? 1
              : 0;
      if (score > (best?.score ?? 0)) best = { s, f, score };
    }
  return best;
}

/** The field's type from its label, its width on screen and the data files' schemas. */
export function typeField(field: FieldInfo, samples: DataSample[]): TypedField {
  const label = field.label;
  const w = words(label);
  const m = matchDbf(label, samples);
  const dbf = m ? { file: m.s.file, name: m.f.name, type: m.f.type, length: m.f.length } : null;
  const existing = m
    ? [...new Set(m.s.records.map((r) => r[m.f.name] ?? '').filter((v) => v !== ''))]
    : [];
  const width = Math.max(1, field.length ?? dbf?.length ?? 20);
  const month = monthFormatIn(label);
  const decimals = m?.f.type === 'N' ? (existing[0]?.split('.')[1]?.length ?? 2) : 2;
  const date = dateFormatIn(label, width);
  let type: FieldType;
  // A box too narrow for the date is not typed as one (a 1-character flag next to a date field).
  if (month && width >= month.length) type = { kind: 'month', format: month };
  else if (
    (has(w, 'DATE', 'DOB', 'EXPIRY', 'EXP', 'DD', 'DDMMYY') || dbf?.type === 'D') &&
    width >= date.length
  )
    type = { kind: 'date', format: date };
  else if (has(w, 'QTY', 'QUANTITY', 'QNTY', 'NOS', 'UNITS', 'PCS', 'COUNT', 'DAYS'))
    type = { kind: 'quantity' };
  else if (
    has(w, 'RS', 'AMOUNT', 'AMT', 'PRICE', 'RATE', 'FEE', 'TOTAL', 'PAID', 'BALANCE', 'LIMIT')
  )
    type = { kind: 'money', decimals };
  else if (has(w, 'PHONE', 'MOBILE', 'TEL', 'CELL')) type = { kind: 'phone' };
  else if (has(w, 'CODE', 'ID', 'NO', 'NUMBER', 'ROLL', 'KEY', 'BATCH')) type = { kind: 'code' };
  else if (has(w, 'NAME', 'PARTY', 'CUSTOMER', 'STUDENT', 'FATHER')) type = { kind: 'name' };
  else if (dbf?.type === 'N') type = { kind: 'money', decimals };
  else type = { kind: 'text' };
  return { type, width, dbf, existing, blankOk: /\bblank\b/i.test(label) };
}

const pad2 = (n: number) => String(n).padStart(2, '0');

function formatDate(d: { y: number; m: number; d: number }, f: DateFormat): string {
  const yy = pad2(d.y % 100);
  switch (f) {
    case 'DD/MM/YY':
      return `${pad2(d.d)}/${pad2(d.m)}/${yy}`;
    case 'DD/MM/YYYY':
      return `${pad2(d.d)}/${pad2(d.m)}/${d.y}`;
    case 'DD-MM-YYYY':
      return `${pad2(d.d)}-${pad2(d.m)}-${d.y}`;
    case 'DDMMYY':
      return `${pad2(d.d)}${pad2(d.m)}${yy}`;
    case 'YYYYMMDD':
      return `${d.y}${pad2(d.m)}${pad2(d.d)}`;
  }
}

function formatMonth(d: { y: number; m: number }, f: MonthFormat): string {
  return f === 'MMYYYY'
    ? `${pad2(d.m)}${d.y}`
    : f === 'MM/YYYY'
      ? `${pad2(d.m)}/${d.y}`
      : `${d.y}${pad2(d.m)}`;
}

/** The app's date, from its screen (DOS apps show it in the title bar), or null. */
export function screenDate(lines: string[]): { y: number; m: number; d: number } | null {
  for (const l of lines.slice(0, 2)) {
    const x = /\b(\d{2})[/-](\d{2})[/-](\d{4}|\d{2})\b/.exec(l);
    if (!x) continue;
    const y = Number(x[3]);
    const year = x[3]!.length === 4 ? y : y >= 70 ? 1900 + y : 2000 + y;
    const m = Number(x[2]);
    const d = Number(x[1]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return { y: year, m, d };
  }
  return null;
}

const nines = (n: number) => '9'.repeat(Math.max(1, n));

function money(width: number, decimals: number, whole: string): string {
  if (decimals > 0 && width >= decimals + 2) {
    const ints = whole.slice(0, width - decimals - 1) || '0';
    return `${ints}.${'0'.repeat(decimals)}`;
  }
  return whole.slice(0, width) || '0';
}

/** A code that keeps the shape of the existing ones but is not one of them ("PAN500": "ZZZ999"). */
function newKey(existing: string[], width: number): string {
  const shape = existing[0] ?? 'X'.repeat(Math.min(width, 6));
  let v = shape
    .replace(/[A-Za-z]/g, 'Z')
    .replace(/\d/g, '9')
    .slice(0, width);
  if (existing.includes(v)) v = `${v.slice(0, -1)}Y`;
  return v.replace(/[^A-Z0-9-]/g, 'Z');
}

/** A value a shop worker would type, to get through the screen. */
export function typicalValue(
  t: TypedField,
  today: { y: number; m: number; d: number } | null,
): string {
  if (t.blankOk) return '';
  const now = today ?? { y: 1998, m: 7, d: 15 };
  const v = (() => {
    switch (t.type.kind) {
      case 'quantity':
        return '1';
      case 'money':
        return money(t.width, t.type.decimals, '100');
      case 'date':
        return formatDate(now, t.type.format);
      case 'month':
        return formatMonth(now, t.type.format);
      case 'code':
        return t.existing[0] ?? 'A1';
      case 'phone':
        return '051-0000000';
      case 'name':
        return t.existing.length && /PARTY|CUSTOMER|STUDENT/.test(t.dbf?.name ?? '')
          ? t.existing[0]!
          : 'AFTERLIFE TEST';
      case 'text':
        return 'TEST';
    }
  })().slice(0, t.width);
  // A data value that is not written as the type is (a code with a slash) is not typed as is.
  return fitsType(v, t) ? v : FALLBACK[t.type.kind].slice(0, t.width);
}

const FALLBACK: Record<FieldType['kind'], string> = {
  quantity: '1',
  money: '1',
  date: '01/01/98',
  month: '011998',
  code: 'A1',
  phone: '0',
  name: 'TEST',
  text: 'TEST',
};

/**
 * The boundary values for a field, in the order to try them. Each fits the width and the type;
 * duplicates and values that would not fit are left out.
 */
export function probes(t: TypedField, today: { y: number; m: number; d: number } | null): Probe[] {
  const w = t.width;
  const now = today ?? { y: 1998, m: 7, d: 15 };
  const out: Probe[] = [];
  const add = (value: string, why: ProbeReason) => {
    if (value.length > w || out.some((p) => p.value === value)) return;
    if (!fitsType(value, t)) return;
    out.push({ value, why });
  };
  switch (t.type.kind) {
    case 'quantity':
      add('0', 'zero');
      add(nines(w), 'max-width');
      add('-1', 'negative');
      break;
    case 'money':
      add(money(w, t.type.decimals, '0'), 'zero');
      add(`-${money(w - 1, t.type.decimals, '1')}`, 'negative');
      add(money(w, t.type.decimals, nines(w)), 'max-width');
      break;
    case 'date':
      add(formatDate({ y: 1980, m: 1, d: 1 }, t.type.format), 'past-date');
      add(formatDate({ y: now.y + 2, m: 12, d: 31 }, t.type.format), 'future-date');
      // The other side of 2000 from the app's own date: where two-digit years break.
      add(
        formatDate(
          now.y < 2000 ? { y: 2000, m: 1, d: 1 } : { y: 1999, m: 12, d: 31 },
          t.type.format,
        ),
        'y2k',
      );
      break;
    case 'month':
      add(formatMonth({ y: 1980, m: 1 }, t.type.format), 'past-date');
      add(formatMonth({ y: now.y + 2, m: 12 }, t.type.format), 'future-date');
      add(formatMonth(now.y < 2000 ? { y: 2000, m: 1 } : { y: 1999, m: 12 }, t.type.format), 'y2k');
      break;
    case 'code':
      add(newKey(t.existing, w), 'new-key');
      if (t.existing[1]) add(t.existing[1], 'existing-key');
      add('', 'blank');
      break;
    case 'phone':
      add('', 'blank');
      add(nines(w), 'max-width');
      break;
    case 'name':
    case 'text':
      add('', 'blank');
      add('W'.repeat(w), 'max-width');
      break;
  }
  return out;
}

const DATE_RE: Record<DateFormat, RegExp> = {
  'DD/MM/YY': /^\d{2}\/\d{2}\/\d{2}$/,
  'DD/MM/YYYY': /^\d{2}\/\d{2}\/\d{4}$/,
  'DD-MM-YYYY': /^\d{2}-\d{2}-\d{4}$/,
  DDMMYY: /^\d{6}$/,
  YYYYMMDD: /^\d{8}$/,
};
const MONTH_RE: Record<MonthFormat, RegExp> = {
  MMYYYY: /^(0[1-9]|1[0-2])\d{4}$/,
  'MM/YYYY': /^(0[1-9]|1[0-2])\/\d{4}$/,
  YYYYMM: /^\d{4}(0[1-9]|1[0-2])$/,
};

/** True when the value fits the field: not wider than it, and written as its type is. Blank fits. */
export function fitsType(value: string, t: TypedField): boolean {
  if (value.length > t.width) return false;
  if (value === '') return true;
  switch (t.type.kind) {
    case 'quantity':
      return /^-?\d+$/.test(value);
    case 'money':
      return new RegExp(`^-?\\d+(\\.\\d{1,${Math.max(1, t.type.decimals)}})?$`).test(value);
    case 'date':
      return DATE_RE[t.type.format].test(value);
    case 'month':
      return MONTH_RE[t.type.format].test(value);
    case 'code':
      return /^[A-Z0-9-]+$/.test(value);
    case 'phone':
      return /^[0-9-]+$/.test(value);
    case 'name':
    case 'text':
      return /^[\x20-\x7e]+$/.test(value) && !value.includes('{');
  }
}

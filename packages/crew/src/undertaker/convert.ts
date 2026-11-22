// The Undertaker's conversion (Prompt 64): a record of the old app's data file, field by field,
// into the reborn app's types, and back. Text is trimmed; a date is `YYYY-MM-DD` (blank is none);
// a number is a decimal with no more places than its field; a logical is true or false. What
// cannot be converted says which field, why, and how to fix it.
import Decimal from 'decimal.js';
import type { DbfField, DbfRecord, DbfValue } from '@afterlife/dbf';
import type { Entity } from '@afterlife/soul';

export type TypedValue = string | Decimal | boolean | number | null;
export type Typed = Record<string, TypedValue>;
export type Unconverted = { field: string; reason: string; fix: string };

const NUMBER = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;

/** A day of the calendar as YYYY-MM-DD, or null when `s` is not one. */
export function calendarDay(s: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const at = new Date(Date.UTC(y, mo - 1, d));
  if (at.getUTCFullYear() !== y || at.getUTCMonth() !== mo - 1 || at.getUTCDate() !== d)
    return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function importValue(f: DbfField, v: DbfValue | undefined): TypedValue | Unconverted {
  const bad = (reason: string, fix: string): Unconverted => ({ field: f.name, reason, fix });
  if (v === undefined || v === null) return null;
  switch (f.type) {
    case 'C':
      return String(v).trim();
    case 'N':
    case 'F': {
      const s = String(v).trim();
      if (s === '') return null;
      if (!NUMBER.test(s))
        return bad(`${f.name} is "${s}", which is not a number`, `Type a number into ${f.name}`);
      const d = new Decimal(s);
      if (f.type === 'N' && d.decimalPlaces() > f.decimals)
        return bad(
          `${f.name} is ${s}, with more than its ${f.decimals} decimal places`,
          `Round ${f.name} to ${f.decimals} places`,
        );
      return d;
    }
    case 'D': {
      const s = String(v).trim();
      if (s === '') return null;
      const day = calendarDay(s);
      return (
        day ??
        bad(
          `${f.name} is "${s}", which is not a day of the calendar`,
          `Correct the date in ${f.name}, or blank it`,
        )
      );
    }
    case 'L':
      if (typeof v === 'boolean') return v;
      if (/^[TtYy]$/.test(String(v))) return true;
      if (/^[FfNn]$/.test(String(v))) return false;
      return bad(`${f.name} is "${String(v)}", which is not yes or no`, `Set ${f.name} to T or F`);
    default:
      // Memo blocks (M) are kept as the number of their block.
      return v;
  }
}

const isUnconverted = (x: TypedValue | Unconverted): x is Unconverted =>
  !!x && typeof x === 'object' && !Decimal.isDecimal(x) && 'reason' in x;

/** A record of an entity in the reborn app's types, or why it cannot be. */
export function importRecord(
  e: Pick<Entity, 'fields'>,
  r: DbfRecord,
): { ok: true; typed: Typed } | ({ ok: false } & Unconverted) {
  const typed: Typed = {};
  for (const f of e.fields) {
    const v = importValue(f, r.values[f.name]);
    if (isUnconverted(v)) return { ok: false, ...v };
    typed[f.name] = v;
  }
  return { ok: true, typed };
}

/** A typed record back in the data file's form: what the Vessel runs on. */
export function exportRecord(e: Pick<Entity, 'fields'>, t: Typed): Record<string, DbfValue> {
  const out: Record<string, DbfValue> = {};
  for (const f of e.fields) {
    const v = t[f.name];
    if (v === null || v === undefined) {
      out[f.name] = f.type === 'C' ? '' : null;
      continue;
    }
    switch (f.type) {
      case 'N':
        out[f.name] = (v as Decimal).toFixed(f.decimals);
        break;
      case 'F':
        out[f.name] = (v as Decimal).toString();
        break;
      case 'D':
        out[f.name] = String(v).replace(/-/g, '');
        break;
      default:
        out[f.name] = Decimal.isDecimal(v) ? v.toString() : (v as DbfValue);
    }
  }
  return out;
}

// Values in and out of a data file, the way the old app stored them: numbers as decimal text with
// the field's decimals (decimal.js, never a JS float), dates as YYYYMMDD, text trimmed.
import type { DbfField, DbfValue } from '@afterlife/dbf';
import { DslDate, DslText, dslDate } from '@afterlife/soul';
import Decimal from 'decimal.js';

/** A value the owner typed that the field cannot hold. */
export class ValueError extends Error {
  constructor(
    readonly field: string,
    message: string,
  ) {
    super(message);
    this.name = 'ValueError';
  }
}

const NUMBER = /^-?\d+(\.\d+)?$/;

/** A number in the field's width and decimals; dBASE writes stars when it does not fit. */
function number(field: DbfField, v: Decimal): string {
  const s = (v.isZero() ? new Decimal(0) : v).toFixed(field.decimals, Decimal.ROUND_HALF_UP);
  return s.length > field.length ? '*'.repeat(field.length) : s;
}

/** What a rule gave, as the field stores it. */
export function toDbfValue(field: DbfField, v: unknown): DbfValue {
  switch (field.type) {
    case 'N':
    case 'F': {
      if (Decimal.isDecimal(v)) return number(field, new Decimal(v.toString()));
      if (typeof v === 'string' && NUMBER.test(v)) return number(field, new Decimal(v));
      throw new ValueError(field.name, `${field.name} needs a number`);
    }
    case 'D':
      if (v instanceof DslDate) return v.iso.replace(/-/g, '');
      if (typeof v === 'string' && /^\d{8}$/.test(v)) return v;
      throw new ValueError(field.name, `${field.name} needs a date`);
    case 'L':
      if (typeof v === 'boolean') return v;
      throw new ValueError(field.name, `${field.name} needs yes or no`);
    default: {
      const s = v instanceof DslText ? v.text : typeof v === 'string' ? v : null;
      if (s === null) throw new ValueError(field.name, `${field.name} needs text`);
      return s.trimEnd().slice(0, field.length);
    }
  }
}

/** A field's blank value: '' for text, null for the rest (as the DBF reader gives them). */
export const blank = (field: DbfField): DbfValue =>
  field.type === 'C' || field.type === 'M' ? '' : null;

/** What the owner typed into a field, checked the way the field can hold it. */
export function parseInput(field: DbfField, raw: string): DbfValue {
  const s = raw.trim();
  if (s === '') return blank(field);
  switch (field.type) {
    case 'N':
    case 'F': {
      if (!NUMBER.test(s)) throw new ValueError(field.name, `${field.name} must be a number`);
      const places = s.split('.')[1]?.length ?? 0;
      if (places > field.decimals)
        throw new ValueError(
          field.name,
          field.decimals
            ? `${field.name} takes at most ${field.decimals} decimals`
            : `${field.name} must be a whole number`,
        );
      const out = new Decimal(s).toFixed(field.decimals);
      if (out.length > field.length)
        throw new ValueError(field.name, `${field.name} is too big for ${field.length} digits`);
      return out;
    }
    case 'D':
      try {
        return dslDate(s).iso.replace(/-/g, '');
      } catch {
        throw new ValueError(field.name, `${field.name} must be a date (YYYY-MM-DD)`);
      }
    case 'L':
      if (/^[TY]$/i.test(s)) return true;
      if (/^[FN]$/i.test(s)) return false;
      throw new ValueError(field.name, `${field.name} must be Y or N`);
    default:
      if (s.length > field.length)
        throw new ValueError(field.name, `${field.name} takes at most ${field.length} characters`);
      return s;
  }
}

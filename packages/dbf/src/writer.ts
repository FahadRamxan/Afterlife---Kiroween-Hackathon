import { unicodeToCp437 } from '@afterlife/screen';
import { DbfError, type DbfField, type DbfTable, type DbfValue } from './types';

const HEADER = 32;
const DESCRIPTOR = 32;
const DECIMAL = /^-?\d+(\.\d+)?$/;

function checkField(f: DbfField) {
  if (!/^[A-Z][A-Z0-9_]{0,9}$/.test(f.name))
    throw new DbfError('BAD_FIELD', `Bad field name ${JSON.stringify(f.name)}`);
  const ok =
    (f.type === 'C' && f.length >= 1 && f.length <= 254 && f.decimals === 0) ||
    ((f.type === 'N' || f.type === 'F') &&
      f.length >= 1 &&
      f.length <= 19 &&
      (f.decimals === 0 || (f.decimals <= 15 && f.decimals + 2 <= f.length))) ||
    (f.type === 'D' && f.length === 8 && f.decimals === 0) ||
    (f.type === 'L' && f.length === 1 && f.decimals === 0) ||
    (f.type === 'M' && f.length === 10 && f.decimals === 0);
  if (!ok)
    throw new DbfError(
      'BAD_FIELD',
      `Bad definition for field ${f.name}: ${f.type}(${f.length},${f.decimals})`,
    );
}

const asciiBytes = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

/** The bytes of one value, exactly f.length long. */
function encodeValue(f: DbfField, v: DbfValue): Uint8Array {
  const fail = (why: string) => {
    throw new DbfError('BAD_VALUE', `${f.name}: ${why}: ${JSON.stringify(v)}`);
  };
  const spaces = (n: number) => ' '.repeat(n);
  switch (f.type) {
    case 'C': {
      if (typeof v !== 'string') fail('a C field takes a string');
      const b = unicodeToCp437(v as string);
      if (b.length > f.length)
        throw new DbfError('WIDTH', `${f.name}: "${v}" is longer than ${f.length} characters`);
      const out = new Uint8Array(f.length).fill(0x20);
      out.set(b);
      return out;
    }
    case 'N':
    case 'F': {
      if (v === null) return asciiBytes(spaces(f.length));
      if (typeof v !== 'string') fail('a numeric field takes decimal text, never a JS number');
      const s = v as string;
      if (s === '*'.repeat(f.length)) return asciiBytes(s); // dBASE's overflow marker, kept as it is
      if (!DECIMAL.test(s)) fail('not a decimal number');
      const decimals = s.includes('.') ? s.split('.')[1]!.length : 0;
      if (decimals !== f.decimals) fail(`needs exactly ${f.decimals} decimals`);
      if (s.length > f.length)
        throw new DbfError('WIDTH', `${f.name}: ${s} does not fit N(${f.length},${f.decimals})`);
      return asciiBytes(spaces(f.length - s.length) + s);
    }
    case 'D': {
      if (v === null) return asciiBytes(spaces(8));
      if (typeof v !== 'string' || !/^\d{8}$/.test(v)) fail('a date must be YYYYMMDD');
      return asciiBytes(v as string);
    }
    case 'L': {
      if (v === null) return asciiBytes('?');
      if (typeof v !== 'boolean') fail('a logical field takes true, false or null');
      return asciiBytes(v ? 'T' : 'F');
    }
    case 'M': {
      if (v === null) return asciiBytes(spaces(10));
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 9_999_999_999)
        fail('a memo takes a block number');
      return asciiBytes(String(v).padStart(10, ' '));
    }
  }
}

/** Writes a dBASE III .DBF: header, field descriptors, 0x0D, fixed-width records, 0x1A. */
export function writeDbf(table: DbfTable): Uint8Array {
  const { fields, records } = table;
  const version = table.version ?? 0x03;
  const date = table.lastUpdate ?? { year: 1980, month: 1, day: 1 };
  if (fields.length === 0 || fields.length > 255)
    throw new DbfError('BAD_FIELD', 'A table needs 1 to 255 fields');
  fields.forEach(checkField);
  if (new Set(fields.map((f) => f.name)).size !== fields.length)
    throw new DbfError('BAD_FIELD', 'Field names must be unique');
  if (date.year < 1900 || date.year > 2155)
    throw new DbfError('BAD_VALUE', `Year ${date.year} cannot be stored (1900 to 2155)`);

  const headerLength = HEADER + fields.length * DESCRIPTOR + 1;
  const recordLength = 1 + fields.reduce((s, f) => s + f.length, 0);
  if (recordLength > 0xffff) throw new DbfError('BAD_FIELD', 'Records are too long');
  const out = new Uint8Array(headerLength + records.length * recordLength + 1);
  const view = new DataView(out.buffer);

  out[0] = version;
  out[1] = date.year - 1900;
  out[2] = date.month;
  out[3] = date.day;
  view.setUint32(4, records.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  out[29] = table.codePage ?? 0;

  fields.forEach((f, i) => {
    const p = HEADER + i * DESCRIPTOR;
    out.set(asciiBytes(f.name), p);
    out[p + 11] = f.type.charCodeAt(0);
    out[p + 16] = f.length;
    out[p + 17] = f.decimals;
  });
  out[headerLength - 1] = 0x0d;

  records.forEach((r, i) => {
    let at = headerLength + i * recordLength;
    out[at++] = r.deleted ? 0x2a : 0x20;
    for (const f of fields) {
      if (!(f.name in r.values))
        throw new DbfError('BAD_VALUE', `Record ${i} has no value for ${f.name}`);
      out.set(encodeValue(f, r.values[f.name]!), at);
      at += f.length;
    }
  });
  out[out.length - 1] = 0x1a;
  return out;
}

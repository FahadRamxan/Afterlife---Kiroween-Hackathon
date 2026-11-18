import { cp437ToUnicode } from '@afterlife/screen';
import {
  DbfError,
  type DbfField,
  type DbfFile,
  type DbfValue,
  type DbfWarning,
  type FieldType,
} from './types';

// dBASE III and Clipper (0x03), with memo (0x83), dBASE IV with memo (0x8B), FoxPro 2.x with memo
// (0xF5), FoxBASE+ (0xFB): all the dBASE III record layout.
const VERSIONS = new Set([0x03, 0x83, 0x8b, 0xf5, 0xfb]);
const MEMO_VERSIONS = new Set([0x83, 0x8b, 0xf5]);
// Visual FoxPro: a 263-byte backlink after the fields and types (I, B, T, Y, 0) we do not read yet.
const VISUAL_FOXPRO = new Set([0x30, 0x31, 0x32]);
const TYPES = new Set<FieldType>(['C', 'N', 'F', 'D', 'L', 'M']);
const HEADER = 32;
const DESCRIPTOR = 32;

const ascii = (b: Uint8Array) => String.fromCharCode(...b);

function decodeValue(f: DbfField, raw: Uint8Array): DbfValue {
  switch (f.type) {
    case 'C':
      // Trailing spaces and NUL padding are not part of the value.
      return cp437ToUnicode(raw).replace(/[ \u2400]+$/, '');
    case 'N':
    case 'F': {
      const t = ascii(raw).trim();
      return t === '' ? null : t;
    }
    case 'D': {
      const t = ascii(raw).trim();
      return t === '' ? null : t;
    }
    case 'L': {
      const c = ascii(raw);
      if ('TtYy'.includes(c)) return true;
      if ('FfNn'.includes(c)) return false;
      return null;
    }
    case 'M': {
      const t = ascii(raw).trim();
      return /^\d+$/.test(t) ? Number(t) : null;
    }
  }
}

/**
 * Reads a dBASE III, Clipper or FoxPro 2.x .DBF. Pure: works on bytes, in the browser and in Node.
 * A file whose header counts more records than it holds (an app that crashed while appending)
 * gives the complete records and a TRUNCATED warning instead of an error.
 */
export function readDbf(buf: Uint8Array): DbfFile {
  if (buf.length < HEADER + 1)
    throw new DbfError('TOO_SHORT', `A .DBF needs at least ${HEADER + 1} bytes, got ${buf.length}`);
  const version = buf[0]!;
  if (VISUAL_FOXPRO.has(version))
    throw new DbfError(
      'BAD_VERSION',
      `Visual FoxPro files (version byte 0x${version.toString(16)}) are not supported yet. Save the table as FoxPro 2.x or dBASE III`,
    );
  if (!VERSIONS.has(version))
    throw new DbfError(
      'BAD_VERSION',
      `Not a supported .DBF version byte: 0x${version.toString(16)}`,
    );
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const recordCount = view.getUint32(4, true);
  const headerLength = view.getUint16(8, true);
  const recordLength = view.getUint16(10, true);
  if (headerLength < HEADER + DESCRIPTOR + 1 || headerLength > buf.length)
    throw new DbfError(
      'BAD_HEADER',
      `Header length ${headerLength} does not fit a ${buf.length}-byte file`,
    );

  const fields: DbfField[] = [];
  let offset = 1;
  for (let p = HEADER; p + DESCRIPTOR <= headerLength && buf[p] !== 0x0d; p += DESCRIPTOR) {
    const nameBytes = buf.subarray(p, p + 11);
    const nul = nameBytes.indexOf(0);
    const name = ascii(nul >= 0 ? nameBytes.subarray(0, nul) : nameBytes).trim();
    const type = String.fromCharCode(buf[p + 11]!) as FieldType;
    if (!TYPES.has(type))
      throw new DbfError('BAD_FIELD', `Field ${name} has an unknown type ${JSON.stringify(type)}`);
    // Clipper stores a character field longer than 255 as low byte + 256 x the decimals byte.
    const length = type === 'C' ? buf[p + 16]! + 256 * buf[p + 17]! : buf[p + 16]!;
    const decimals = type === 'N' || type === 'F' ? buf[p + 17]! : 0;
    if (!name || length === 0)
      throw new DbfError('BAD_FIELD', `Field ${fields.length + 1} has no name or no length`);
    fields.push({ name, type, length, decimals });
    offset += length;
  }
  if (fields.length === 0) throw new DbfError('BAD_HEADER', 'No field descriptors');
  if (offset !== recordLength)
    throw new DbfError(
      'BAD_HEADER',
      `Record length ${recordLength} does not match the fields (${offset})`,
    );
  const warnings: DbfWarning[] = [];
  const fit = Math.floor((buf.length - headerLength) / recordLength);
  const readable = Math.min(recordCount, fit);
  if (readable < recordCount)
    warnings.push({
      code: 'TRUNCATED',
      message: `The header says ${recordCount} records, but the file holds only ${readable} complete records`,
    });

  const records = [];
  for (let r = 0; r < readable; r++) {
    const start = headerLength + r * recordLength;
    let at = start + 1;
    const values: Record<string, DbfValue> = {};
    for (const f of fields) {
      values[f.name] = decodeValue(f, buf.subarray(at, at + f.length));
      at += f.length;
    }
    records.push({ deleted: buf[start] === 0x2a, values });
  }

  return {
    header: {
      version,
      // The year byte counts from 1900: 98 is 1998, 101 is 2001.
      lastUpdate: { year: 1900 + buf[1]!, month: buf[2]!, day: buf[3]! },
      recordCount,
      headerLength,
      recordLength,
      codePage: buf[29]!,
      hasMemo: MEMO_VERSIONS.has(version),
    },
    fields,
    records,
    ...(warnings.length ? { warnings } : {}),
  };
}

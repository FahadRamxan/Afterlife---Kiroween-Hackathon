import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DbfError, readDbf } from './index';

const GRAVEYARD = resolve(__dirname, '../../../samples/graveyard');
const bytes = (p: string) => new Uint8Array(readFileSync(resolve(GRAVEYARD, p)));

/** Our seed CSV format (see samples/graveyard/toolchain/tools/csv2dbf.c), parsed independently. */
function readSeedCsv(path: string) {
  const lines = readFileSync(resolve(GRAVEYARD, path), 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .filter((l) => l && !l.startsWith('#'));
  const header = lines[0]!.split(',').map((h) => {
    const [name, type, len, dec] = h.split(':');
    return { name: name!, type: type!, length: Number(len), decimals: Number(dec ?? 0) };
  });
  const rows = lines.slice(1).map((l) => l.split(','));
  return { header, rows };
}

describe('readDbf on the real sample files (written by our C dbf3 library)', () => {
  const apps = readdirSync(resolve(GRAVEYARD, 'dist')).filter((a) => a !== 'hello');
  const files = apps.flatMap((app) =>
    readdirSync(resolve(GRAVEYARD, 'dist', app))
      .filter((f) => f.endsWith('.DBF'))
      .map((f) => [app, f.replace(/\.DBF$/, '')] as const),
  );

  it('finds all nine data files of the three apps', () => {
    expect(files).toHaveLength(9);
  });

  it.each(files)('%s/%s.DBF matches its seed CSV field for field', (app, table) => {
    const dbf = readDbf(bytes(`dist/${app}/${table}.DBF`));
    const csv = readSeedCsv(`${app}/seed/${table}.csv`);
    expect(dbf.fields).toEqual(csv.header);
    expect(dbf.header.recordCount).toBe(csv.rows.length);
    expect(dbf.records).toHaveLength(csv.rows.length);
    dbf.records.forEach((rec, i) => {
      expect(rec.deleted).toBe(false);
      csv.header.forEach((f, j) => {
        const want = csv.rows[i]![j]!;
        const got = rec.values[f.name];
        // A blank C field is ''. Blank N, D, L and M fields have no value: null.
        expect(got, `${table} row ${i} ${f.name}`).toBe(
          want === '' && f.type !== 'C' ? null : want,
        );
      });
    });
  });

  it('reads the header: version, date, lengths', () => {
    const { header, fields } = readDbf(bytes('dist/shifa/MEDICINE.DBF'));
    expect(header).toEqual({
      version: 0x03,
      lastUpdate: { year: 1998, month: 7, day: 1 },
      recordCount: 40,
      headerLength: 32 + 6 * 32 + 1,
      recordLength: 1 + 6 + 20 + 8 + 8 + 8 + 5,
      codePage: 0,
      hasMemo: false,
    });
    expect(fields.map((f) => f.name)).toEqual(['CODE', 'NAME', 'BATCH', 'EXPIRY', 'PRICE', 'QTY']);
  });

  it('reads a year after 2000 from the header byte (2001 is stored as 101)', () => {
    expect(readDbf(bytes('dist/iqra/STUDENT.DBF')).header.lastUpdate).toEqual({
      year: 2001,
      month: 3,
      day: 1,
    });
  });
});

describe('readDbf on a file written inside DOSBox by a 16-bit DOS program', () => {
  it('reads HELLO.DBF', () => {
    const dbf = readDbf(bytes('fixtures/hello/HELLO.DBF'));
    expect(dbf.header.lastUpdate).toEqual({ year: 1998, month: 7, day: 15 });
    expect(dbf.records).toEqual([
      { deleted: false, values: { CODE: 'PAN500', PRICE: '45.50' } },
      { deleted: false, values: { CODE: 'ASP100', PRICE: '12.00' } },
    ]);
  });
});

/** Builds a small DBF by hand, byte by byte, to test cases the samples do not have. */
function handmade(opts: {
  version?: number;
  codePage?: number;
  fields: [string, string, number, number][];
  records: string[];
  eof?: boolean;
  recordCount?: number;
}): Uint8Array {
  const hdrLen = 32 + opts.fields.length * 32 + 1;
  const recLen = 1 + opts.fields.reduce((s, f) => s + f[2], 0);
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 255, (v >> 8) & 255);
  const u32 = (v: number) => out.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  out.push(opts.version ?? 0x03, 96, 1, 2);
  u32(opts.recordCount ?? opts.records.length);
  u16(hdrLen);
  u16(recLen);
  for (let i = 12; i < 32; i++) out.push(i === 29 ? (opts.codePage ?? 0) : 0);
  for (const [name, type, len, dec] of opts.fields) {
    const d = new Array(32).fill(0);
    for (let i = 0; i < name.length; i++) d[i] = name.charCodeAt(i);
    d[11] = type.charCodeAt(0);
    d[16] = len & 255;
    d[17] = type === 'C' && len > 255 ? len >> 8 : dec;
    out.push(...d);
  }
  out.push(0x0d);
  for (const r of opts.records) {
    if (r.length !== recLen) throw new Error(`record ${JSON.stringify(r)} is not ${recLen} bytes`);
    for (const ch of r) out.push(ch.charCodeAt(0));
  }
  if (opts.eof !== false) out.push(0x1a);
  return new Uint8Array(out);
}

describe('readDbf field types and edge cases', () => {
  const fields: [string, string, number, number][] = [
    ['NAME', 'C', 6, 0],
    ['QTY', 'N', 5, 0],
    ['RATE', 'F', 8, 3],
    ['DAY', 'D', 8, 0],
    ['OK', 'L', 1, 0],
    ['NOTES', 'M', 10, 0],
  ];

  it('reads C, N, F, D, L and M (memo block number) values', () => {
    const dbf = readDbf(
      handmade({
        fields,
        records: [
          ' ALI     -42  12.50019961120T         7',
          '*      ' + ' '.repeat(5) + ' '.repeat(8) + ' '.repeat(8) + '?' + ' '.repeat(10),
        ],
      }),
    );
    expect(dbf.records[0]).toEqual({
      deleted: false,
      values: { NAME: 'ALI', QTY: '-42', RATE: '12.500', DAY: '19961120', OK: true, NOTES: 7 },
    });
    expect(dbf.records[1]).toEqual({
      deleted: true,
      values: { NAME: '', QTY: null, RATE: null, DAY: null, OK: null, NOTES: null },
    });
  });

  it.each([
    ['T', true],
    ['t', true],
    ['Y', true],
    ['y', true],
    ['F', false],
    ['f', false],
    ['N', false],
    ['n', false],
    ['?', null],
    [' ', null],
  ])('logical %j reads as %s', (ch, want) => {
    const dbf = readDbf(handmade({ fields: [['OK', 'L', 1, 0]], records: [` ${ch}`] }));
    expect(dbf.records[0]!.values.OK).toBe(want);
  });

  it("keeps dBASE's ******** overflow marker in a numeric field as it is", () => {
    const dbf = readDbf(
      handmade({ fields: [['BALANCE', 'N', 8, 2]], records: [' ********', '  5790.00'] }),
    );
    expect(dbf.records.map((r) => r.values.BALANCE)).toEqual(['********', '5790.00']);
  });

  it('decodes C fields as code page 437, keeps leading spaces, trims trailing spaces and NULs', () => {
    const dbf = readDbf(
      handmade({ fields: [['NAME', 'C', 6, 0]], records: [' \x80\x9c A\x00\x00', '  AB   '] }),
    );
    expect(dbf.records.map((r) => r.values.NAME)).toEqual(['Ç£ A', ' AB']);
  });

  it('reads the code page byte and the memo flag of FoxPro 2.x files', () => {
    const dbf = readDbf(
      handmade({
        version: 0xf5,
        codePage: 0x01,
        fields: [['NOTES', 'M', 10, 0]],
        records: [' ' + '         1'],
      }),
    );
    expect(dbf.header).toMatchObject({ version: 0xf5, codePage: 1, hasMemo: true });
    expect(
      readDbf(handmade({ version: 0x83, fields: [['A', 'C', 1, 0]], records: [' x'] })).header
        .hasMemo,
    ).toBe(true);
  });

  it('reads a file without the 0x1A end-of-file byte', () => {
    expect(
      readDbf(handmade({ fields: [['A', 'C', 1, 0]], records: [' x'], eof: false })).records,
    ).toHaveLength(1);
  });

  it('reads a table with no records', () => {
    expect(readDbf(handmade({ fields: [['A', 'C', 1, 0]], records: [] })).records).toEqual([]);
  });
});

describe('readDbf errors', () => {
  const one: [string, string, number, number][] = [['A', 'C', 1, 0]];

  it.each([
    ['an empty buffer', new Uint8Array(0), 'TOO_SHORT'],
    [
      'a text file',
      new TextEncoder().encode('hello, this is not a dbf file at all, really'),
      'BAD_VERSION',
    ],
    [
      'a Visual FoxPro (0x30) file',
      handmade({ version: 0x30, fields: [['N', 'I', 4, 0]], records: [' \x01\x00\x00\x00'] }),
      'BAD_VERSION',
    ],
    [
      'an unknown field type',
      handmade({ fields: [['A', 'Q', 1, 0]], records: [' x'] }),
      'BAD_FIELD',
    ],
  ])('rejects %s with %s', (_label, buf, code) => {
    let err: unknown;
    try {
      readDbf(buf);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(DbfError);
    expect((err as DbfError).code).toBe(code);
  });

  it('rejects a header whose record length disagrees with its fields', () => {
    const buf = handmade({ fields: one, records: [' x'] });
    buf[10] = 9; // record length byte
    expect(() => readDbf(buf)).toThrow(DbfError);
  });
});

describe('readDbf on real-world files (Prompt 21)', () => {
  it('reads a Clipper character field longer than 255 (length = low byte + 256 x decimals byte)', () => {
    const text = 'A'.repeat(299) + 'Z';
    const dbf = readDbf(handmade({ fields: [['DESC', 'C', 300, 0]], records: [' ' + text] }));
    expect(dbf.fields).toEqual([{ name: 'DESC', type: 'C', length: 300, decimals: 0 }]);
    expect(dbf.records[0]!.values.DESC).toBe(text);
    expect(dbf.warnings).toBeUndefined();
  });

  it('reads the complete records when the header counts more than the file holds, with a warning', () => {
    // An app that crashed while appending: the count says 5, the file has 2 records and a half.
    const whole = handmade({ fields: [['A', 'C', 3, 0]], records: [' abc', ' def'], eof: false });
    const buf = new Uint8Array([...whole, 0x20, 0x67]);
    buf[4] = 5;
    const dbf = readDbf(buf);
    expect(dbf.header.recordCount).toBe(5);
    expect(dbf.records.map((r) => r.values.A)).toEqual(['abc', 'def']);
    expect(dbf.warnings).toEqual([
      {
        code: 'TRUNCATED',
        message: 'The header says 5 records, but the file holds only 2 complete records',
      },
    ]);
  });

  it('refuses Visual FoxPro with a clear message', () => {
    const buf = handmade({ version: 0x30, fields: [['A', 'C', 1, 0]], records: [' x'] });
    expect(() => readDbf(buf)).toThrow(/Visual FoxPro.*not supported/);
  });

  it('a file read without problems has no warnings', () => {
    expect(
      readDbf(handmade({ fields: [['A', 'C', 1, 0]], records: [' x'] })).warnings,
    ).toBeUndefined();
  });
});

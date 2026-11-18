// Real sample data for /design, read at build time on the server.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { diffTables, readDbf, type DbfRecord, type Table, type TableDiff } from '@afterlife/dbf';
import { analyzeScreen, decodePng, decodeScreen, fingerprint, gridText } from '@afterlife/screen';

// next build and next dev run from apps/web.
const DIST = path.join(process.cwd(), '..', '..', 'samples', 'graveyard', 'dist');

export function shifaMedicine(): Table {
  const { fields, records } = readDbf(
    new Uint8Array(readFileSync(path.join(DIST, 'shifa', 'MEDICINE.DBF'))),
  );
  return { fields, records };
}

/**
 * The stock file after a day's work: the two stock changes the DOS app really makes in the
 * bill-small scenario (PAN500 240 -> 236, BRU400 180 -> 178), plus the expired AMP500 batch
 * deleted and one new medicine added.
 */
export function shifaStockDiff(): { before: Table; after: Table; diff: TableDiff } {
  const before = shifaMedicine();
  const records: DbfRecord[] = before.records.map((r) => {
    const code = r.values.CODE;
    if (code === 'PAN500') return { ...r, values: { ...r.values, QTY: '236' } };
    if (code === 'BRU400') return { ...r, values: { ...r.values, QTY: '178' } };
    if (code === 'AMP500') return { ...r, deleted: true };
    return r;
  });
  records.push({
    deleted: false,
    values: {
      CODE: 'ZIN020',
      NAME: 'ZINCAT SYRUP 60ML',
      BATCH: 'ZN9807',
      EXPIRY: '20000531',
      PRICE: '42.00',
      QTY: '60',
    },
  });
  const after = { fields: before.fields, records };
  return { before, after, diff: diffTables(before, after) };
}

/**
 * A recorded js-dos frame of the Shifa main menu (packages/screen/fixtures, from
 * `pnpm screen:capture`) and what decodeScreen reads from its pixels.
 */
export async function shifaMenuDecoded() {
  const png = readFileSync(
    path.join(
      process.cwd(),
      '..',
      '..',
      'packages',
      'screen',
      'fixtures',
      'shifa-menu-menu-640.png',
    ),
  );
  const img = decodePng(new Uint8Array(png));
  const grid = decodeScreen(img.rgba, img.width, img.height);
  const cells = grid.cells.flat();
  const model = analyzeScreen(grid);
  return {
    src: `data:image/png;base64,${png.toString('base64')}`,
    width: img.width,
    height: img.height,
    text: gridText(grid),
    cells: cells.length,
    unknown: cells.filter((c) => c.code < 0).length,
    cursor: grid.cursor,
    model,
    fingerprint: await fingerprint(model),
  };
}

/**
 * A recorded js-dos frame of a Shifa bill with two lines (packages/screen/fixtures), with the
 * overlays the Possessor would show: the Code box it types into, and the line just added.
 */
export function shifaBillScreen() {
  const png = readFileSync(
    path.join(
      process.cwd(),
      '..',
      '..',
      'packages',
      'screen',
      'fixtures',
      'shifa-bill-small-lines-640.png',
    ),
  );
  const img = decodePng(new Uint8Array(png));
  const grid = decodeScreen(img.rgba, img.width, img.height);
  const model = analyzeScreen(grid);
  const code = model.fields.find((f) => f.label === 'Code')!;
  const table = model.tables[0]!;
  const added = table.rows.at(-1)!;
  const last = table.columns.at(-1)!;
  return {
    grid,
    highlight: { row: code.row, col: code.col, length: code.length ?? 1, label: 'Code' },
    ghost: { row: code.row, col: code.col },
    changed: [
      {
        row: added.row,
        col: table.columns[0]!.col,
        length: last.col + last.length - table.columns[0]!.col,
      },
    ],
  };
}

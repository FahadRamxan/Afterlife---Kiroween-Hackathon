// @spec ghost-twin#2 Replay and compare.
// @spec ghost-twin#2.1 Prompt 77 done when: 50 recorded real-style events give 50 matches, and an
// injected wrong rule gives a mismatch. The events are a week the real 1998 Shifa app wrote in
// headless js-dos (pnpm twin:record): its bills and new customers, each change as the capture tool
// would have sent it.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { SnapshotDiff } from '@afterlife/dbf';
import type { Soul } from '@afterlife/soul';
import { SHIFA_AS_IT_RUNS_SOUL as SOUL } from '@afterlife/soul/examples/shifa';
import { tablesFromBundle } from '@afterlife/vessel';
import { describe, expect, it } from 'vitest';
import { candidateActions, inputsFromDiff, replayTwin, type TwinInput } from './twin';

const ROOT = resolve(__dirname, '../../..');
const WEEK = JSON.parse(
  readFileSync(resolve(ROOT, 'samples/graveyard/shifa/twin-week.json'), 'utf8'),
) as {
  days: string[];
  events: (TwinInput & { day: string })[];
};
const BUNDLE = new Uint8Array(readFileSync(resolve(ROOT, 'apps/web/public/graveyard/shifa.jsdos')));
const RECORDS = Object.fromEntries(
  Object.entries(tablesFromBundle(BUNDLE, SOUL)).map(([f, t]) => [f, t.records]),
);
const today = (e: TwinInput) => e.occurredAt.slice(0, 10);
const recordedSoul = () =>
  JSON.parse(readFileSync(resolve(ROOT, 'apps/worker/recorded/shifa.json'), 'utf8')).soul as Soul;

describe('the recorded week', () => {
  it('is a real week: 7 days and over 200 transactions, bills numbered on from day to day', () => {
    expect(WEEK.days).toHaveLength(7);
    expect(WEEK.events.length).toBeGreaterThanOrEqual(200);
    const bills = WEEK.events
      .flatMap((e) => e.diff.tables['BILLS.DBF']?.inserted ?? [])
      .map((r) => String(r.values.BILL_NO));
    expect(new Set(bills).size).toBe(bills.length);
  });
});

describe('replayTwin', () => {
  it('50 recorded events: 50 matches, the action of each worked out from its change', async () => {
    const events = WEEK.events.slice(0, 50);
    const r = await replayTwin(SOUL, RECORDS, events, { today });
    expect(
      r.filter((x) => x.outcome !== 'matched'),
      JSON.stringify(r.find((x) => x.outcome !== 'matched')),
    ).toEqual([]);
    expect(new Set(r.map((x) => x.actionId))).toEqual(new Set(['save-bill', 'add-customer']));
  });

  it('the whole week matches, on the Soul the Archaeologist found too', async () => {
    for (const soul of [SOUL, recordedSoul()]) {
      const r = await replayTwin(soul, RECORDS, WEEK.events, { today });
      expect(
        r
          .filter((x) => x.outcome !== 'matched')
          .map((x) => [x.seq, x.reason, x.differences?.slice(0, 2)]),
      ).toEqual([]);
    }
  });

  it('an injected wrong rule (GST at 18%) is a mismatch, naming the field; customers still match', async () => {
    const wrong: Soul = {
      ...SOUL,
      rules: SOUL.rules.map((r) =>
        r.id === 'gst-17-truncated'
          ? { ...r, expression: r.expression.replace('0.17', '0.18') }
          : r,
      ),
    };
    const r = await replayTwin(wrong, RECORDS, WEEK.events.slice(0, 50), { today });
    const bad = r.filter((x) => x.outcome === 'mismatched');
    expect(bad.length).toBeGreaterThan(0);
    expect(bad.every((x) => x.actionId === 'save-bill')).toBe(true);
    expect(bad[0]!.differences).toContainEqual(
      expect.objectContaining({ table: 'BILLS.DBF', field: 'GST' }),
    );
    expect(
      r.filter((x) => x.actionId === 'add-customer').every((x) => x.outcome === 'matched'),
    ).toBe(true);
    // The twin still follows the shop after a mismatch: the next bills are compared from the real records.
    expect(r.filter((x) => x.outcome === 'matched').length).toBeGreaterThan(0);
  });

  it('a change no action makes (stock corrected by hand) is unknown, and says so', async () => {
    const hand: SnapshotDiff = {
      tables: {
        'MEDICINE.DBF': {
          key: 'CODE',
          inserted: [],
          deleted: [],
          updated: [
            {
              key: 'PAN500',
              beforeRecno: 0,
              afterRecno: 0,
              changes: [{ field: 'QTY', before: '240', after: '250', delta: '10' }],
            },
          ],
          schema: { added: [], removed: [] },
        },
      },
      unchanged: [],
      addedTables: [],
      removedTables: [],
    };
    const [r] = await replayTwin(
      SOUL,
      RECORDS,
      [{ seq: 1, occurredAt: '1998-07-15T09:00:00.000Z', diff: hand }],
      { today },
    );
    expect(r).toMatchObject({
      seq: 1,
      outcome: 'unknown',
      reason: 'No action of the Soul changes MEDICINE.DBF this way',
    });
  });
});

describe('inputsFromDiff', () => {
  it('a bill: the customer and each line as typed, in the order the lines were written', () => {
    const bill = WEEK.events.find(
      (e) => (e.diff.tables['BILLITEM.DBF']?.inserted.length ?? 0) > 1,
    )!;
    expect(candidateActions(SOUL, bill.diff)).toEqual(['save-bill']);
    const i = inputsFromDiff(SOUL, 'save-bill', bill.diff)!;
    expect(Object.keys(i.values!)).toEqual(['CUST_ID']);
    expect(i.lines!.length).toBe(bill.diff.tables['BILLITEM.DBF']!.inserted.length);
    expect(Object.keys(i.lines![0]!).sort()).toEqual(['CODE', 'QTY']);
  });
});

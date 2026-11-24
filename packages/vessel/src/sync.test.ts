import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createVessel, type ActionInputs } from './runtime';
import { MemoryOutbox, queuedVessel, replaySale, stockConflicts, syncOutbox } from './sync';
import { SHIFA, SHIFA_FILES, SHIFA_TODAY, shifaSeed, shifaStore } from './testing/shifa';

let n = 0;
const newId = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;

/** A phone: its own copy of the shop's records, and its outbox. */
async function phone() {
  const store = await shifaStore();
  const outbox = new MemoryOutbox();
  const v = queuedVessel(createVessel(SHIFA, store, { today: () => SHIFA_TODAY }), outbox, {
    today: () => SHIFA_TODAY,
    newId,
  });
  return { store, outbox, v };
}
/** The server's records, and its side of a sync. */
async function server() {
  const store = await shifaStore();
  return {
    store,
    push: async (items: Parameters<typeof replaySale>[2][]) => {
      const out = [];
      for (const i of items) out.push(await replaySale(SHIFA, store, i));
      return out;
    },
  };
}
const insulin = (qty: string): ActionInputs => ({ lines: [{ CODE: 'INS100', QTY: qty }] });
const stockOf = async (s: Awaited<ReturnType<typeof shifaStore>>, code: string) =>
  (await s.records('MEDICINE.DBF')).find((r) => r.values.CODE === code)!.values.QTY;

describe('offline sales and sync', () => {
  it('three bills made offline reach the server, and its records end up the same as the phone’s', async () => {
    const p = await phone();
    const s = await server();
    for (const q of ['1', '2', '3'])
      expect((await p.v.performAction('save-bill', insulin(q))).ok).toBe(true);
    expect(await p.outbox.pending()).toHaveLength(3);
    const r = await syncOutbox(p.outbox, s.push);
    expect(r.left).toBe(0);
    expect(r.results.every((x) => x.ok && !x.conflicts.length && !x.renumbered)).toBe(true);
    for (const f of SHIFA_FILES) expect(await s.store.records(f)).toEqual(await p.store.records(f));
  });

  it('another phone sold the same insulin: the last write wins on the server, and it is listed for review', async () => {
    const a = await phone();
    const b = await phone();
    const s = await server();
    await a.v.performAction('save-bill', insulin('2'));
    await b.v.performAction('save-bill', insulin('3'));
    await syncOutbox(a.outbox, s.push);
    const r = await syncOutbox(b.outbox, s.push);
    // Both sales stand: 12 - 2 - 3. B's bill is renumbered, and its stock change is to review.
    expect(await stockOf(s.store, 'INS100')).toBe('7');
    expect(r.results[0]).toEqual({
      id: expect.any(String),
      ok: true,
      renumbered: { phone: '9807-0001', server: '9807-0002' },
      conflicts: [
        {
          file: 'MEDICINE.DBF',
          key: 'INS100',
          field: 'QTY',
          phone: { before: '12', after: '9' },
          server: { before: '10', after: '7' },
        },
      ],
    });
  });

  it('a sale the phone checked is not refused later, even past the stock now', async () => {
    const a = await phone();
    const b = await phone();
    const s = await server();
    await a.v.performAction('save-bill', insulin('10'));
    await b.v.performAction('save-bill', insulin('10'));
    await syncOutbox(a.outbox, s.push);
    const r = await syncOutbox(b.outbox, s.push);
    expect(r.results[0]!.ok).toBe(true);
    expect(await stockOf(s.store, 'INS100')).toBe('-8');
    expect(r.results[0]!.conflicts[0]!.server).toEqual({ before: '2', after: '-8' });
  });

  it('when the network fails the outbox keeps everything, and sends it next time', async () => {
    const p = await phone();
    const s = await server();
    await p.v.performAction('save-bill', insulin('1'));
    await p.v.performAction('save-bill', insulin('1'));
    const down = await syncOutbox(p.outbox, async () => {
      throw new Error('offline');
    });
    expect(down).toEqual({ results: [], left: 2 });
    // In batches of one: the first answer arrives, then the network goes.
    let calls = 0;
    const flaky = await syncOutbox(
      p.outbox,
      async (items) => {
        if (++calls > 1) throw new Error('offline');
        return s.push(items);
      },
      1,
    );
    expect(flaky.left).toBe(1);
    expect((await syncOutbox(p.outbox, s.push)).left).toBe(0);
  });

  it('a refused bill never goes into the outbox; one the server cannot take is answered and dropped', async () => {
    const p = await phone();
    await p.v.performAction('save-bill', { lines: [{ CODE: 'SEP200', QTY: '1' }] });
    expect(await p.outbox.pending()).toEqual([]);
    await p.v.performAction('save-bill', insulin('1'));
    const [item] = await p.outbox.pending();
    // A code the server does not know (a phone with older records, say).
    await p.outbox.remove([item!.id]);
    await p.outbox.add({ ...item!, inputs: { lines: [{ CODE: 'NOPE01', QTY: '1' }] } });
    const r = await syncOutbox(p.outbox, (await server()).push);
    expect(r.results[0]).toMatchObject({
      ok: false,
      message: 'There is no medicine with CODE NOPE01',
    });
    expect(r.left).toBe(0);
  });
});

describe('stockConflicts', () => {
  it('none when the phone and the server changed a number the same way', async () => {
    const v = createVessel(SHIFA, await shifaStore(), { today: () => SHIFA_TODAY });
    const r = await v.previewAction('save-bill', insulin('1'));
    if (!r.ok) throw new Error('refused');
    expect(stockConflicts(r.effects, r.effects)).toEqual([]);
  });
});

describe('sync (property)', () => {
  const codes = shifaSeed('MEDICINE.DBF').records.map((r) => String(r.values.CODE));
  const bill = fc.record({
    lines: fc.array(
      fc.record({
        CODE: fc.constantFrom(...codes),
        QTY: fc.integer({ min: 1, max: 9 }).map(String),
      }),
      {
        minLength: 1,
        maxLength: 3,
      },
    ),
  });

  it('one phone, any bills, offline: after syncing the server has exactly the phone’s records (convergence)', async () => {
    // About 1 s alone; the full suite shares the CPU with Postgres and emulator tests.

    await fc.assert(
      fc.asyncProperty(fc.array(bill, { maxLength: 5 }), async (bills) => {
        const p = await phone();
        const s = await server();
        for (const b of bills) await p.v.performAction('save-bill', b);
        const r = await syncOutbox(p.outbox, s.push, 2);
        expect(r.left).toBe(0);
        expect(r.results.every((x) => x.ok && !x.conflicts.length)).toBe(true);
        for (const f of SHIFA_FILES)
          expect(await s.store.records(f)).toEqual(await p.store.records(f));
      }),
    );
  }, 30_000);
});

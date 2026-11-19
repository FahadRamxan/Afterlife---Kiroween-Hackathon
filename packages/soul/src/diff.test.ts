import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { soulArbitrary } from './arbitrary';
import { applySoulDiff, diffSouls, summarizeDiff } from './diff';
import { SHIFA_REFERENCE_SOUL } from './examples/shifa';
import type { Soul } from './ir';

const v2 = (): Soul => {
  const s: Soul = JSON.parse(JSON.stringify(SHIFA_REFERENCE_SOUL));
  s.version = 2;
  s.provenance = { ...s.provenance, createdBy: 'owner', parentVersion: 1 };
  s.rules = s.rules.filter((r) => r.id !== 'bill-total');
  s.rules[0] = {
    ...s.rules[0]!,
    expression: 'if bill.subtotal > 10000 then trunc(bill.subtotal * 0.10, 2) else 0',
    confidence: 0.9,
  };
  s.rules.push({
    id: 'sunday-closed',
    kind: 'validate',
    en: 'No bills on Sunday.',
    ur: '',
    expression: 'true',
    evidence: [],
    confidence: 0.5,
  });
  return s;
};

describe('diffSouls and applySoulDiff', () => {
  it('names the rules added, removed and changed, and what changed in each', () => {
    const d = diffSouls(SHIFA_REFERENCE_SOUL, v2());
    expect(d.rules.added.map((r) => r.id)).toEqual(['sunday-closed']);
    expect(d.rules.removed).toEqual(['bill-total']);
    expect(d.rules.changed.map((c) => [c.id, c.fields.map((f) => f.field)])).toEqual([
      ['discount-over-5000', ['expression', 'confidence']],
    ]);
    expect(d.rules.changed[0]!.fields[0]).toEqual({
      field: 'expression',
      before: 'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
      after: 'if bill.subtotal > 10000 then trunc(bill.subtotal * 0.10, 2) else 0',
    });
    expect(summarizeDiff(d)).toEqual({
      added: 1,
      removed: 1,
      changed: 1,
      entities: 0,
      screens: 0,
      actions: 0,
    });
  });

  it('the same Soul twice: nothing changed', () => {
    expect(summarizeDiff(diffSouls(SHIFA_REFERENCE_SOUL, SHIFA_REFERENCE_SOUL))).toEqual({
      added: 0,
      removed: 0,
      changed: 0,
      entities: 0,
      screens: 0,
      actions: 0,
    });
  });

  it("property: applying a version's diff to the version before it gives that version", () => {
    fc.assert(
      fc.property(soulArbitrary, soulArbitrary, (a, b) => {
        expect(applySoulDiff(a, diffSouls(a, b))).toEqual(b);
      }),
    );
  });

  it('property: and for a small edit of the same Soul (the usual case)', () => {
    const edit = fc.record({
      drop: fc.nat(),
      conf: fc.double({ min: 0, max: 1, noNaN: true }),
      en: fc.string({ minLength: 1, maxLength: 30 }),
    });
    fc.assert(
      fc.property(soulArbitrary, edit, (a, e) => {
        const b: Soul = JSON.parse(JSON.stringify(a));
        if (b.rules.length) {
          b.rules.splice(e.drop % b.rules.length, 1);
          if (b.rules[0]) b.rules[0] = { ...b.rules[0], confidence: e.conf, en: e.en };
        }
        b.version = a.version + 1;
        expect(applySoulDiff(a, diffSouls(a, b))).toEqual(b);
      }),
    );
  });

  it('a diff applied to the wrong version is refused', () => {
    const d = diffSouls(SHIFA_REFERENCE_SOUL, v2());
    const other = { ...SHIFA_REFERENCE_SOUL, version: 7 };
    expect(() => applySoulDiff(other, d)).toThrow(/version 1, not 7/);
  });
});

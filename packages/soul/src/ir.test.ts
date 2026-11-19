import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { soulArbitrary } from './arbitrary';
import { SHIFA_REFERENCE_SOUL } from './examples/shifa';
import { SoulError, SoulSchema, parseSoul, serializeSoul, type Soul } from './ir';

const clone = (s: Soul): Soul => JSON.parse(JSON.stringify(s));

describe('the Soul IR', () => {
  it('the reference Soul of Shifa is a valid Soul', () => {
    expect(SoulSchema.parse(SHIFA_REFERENCE_SOUL)).toEqual(SHIFA_REFERENCE_SOUL);
    expect(SHIFA_REFERENCE_SOUL.entities.map((e) => e.file).sort()).toEqual([
      'BILLITEM.DBF',
      'BILLS.DBF',
      'CUSTOMER.DBF',
      'MEDICINE.DBF',
    ]);
  });

  it('round-trip: parse(serialize(soul)) is the same Soul', () => {
    fc.assert(
      fc.property(soulArbitrary, (s) => {
        expect(parseSoul(serializeSoul(s))).toEqual(SoulSchema.parse(s));
      }),
    );
  });

  it('serialize is canonical: the same Soul gives the same text, whatever its key order', () => {
    fc.assert(
      fc.property(soulArbitrary, (s) => {
        const shuffled = JSON.parse(JSON.stringify(s), (_k, v) =>
          v && typeof v === 'object' && !Array.isArray(v)
            ? Object.fromEntries(Object.entries(v).reverse())
            : v,
        );
        expect(serializeSoul(shuffled)).toBe(serializeSoul(s));
      }),
    );
  });

  describe('every reference inside a Soul must point at something', () => {
    const bad: [string, (s: Soul) => void, RegExp][] = [
      [
        'a key field that does not exist',
        (s) => s.entities[0]!.key.push('NOPE'),
        /NOPE is not a field/,
      ],
      [
        'a foreign key to no entity',
        (s) =>
          s.entities[3]!.foreignKeys.push({
            fields: ['CODE'],
            references: { entity: 'ghost', fields: ['X'] },
          }),
        /No entity ghost/,
      ],
      [
        'a screen field bound to no field',
        (s) => (s.screens[0]!.fields[0]!.binds = { entity: 'medicine', field: 'COLOUR' }),
        /medicine.COLOUR/,
      ],
      [
        'navigation to no screen',
        (s) => s.screens[0]!.navigation.push({ keys: '9', to: 'fp_ffffffffffffffff' }),
        /No screen fp_ffff/,
      ],
      [
        'an action effect on no entity',
        (s) => s.actions[0]!.effects.push({ entity: 'ghost', kind: 'insert', fields: [] }),
        /No entity ghost/,
      ],
      ['two rules with one id', (s) => s.rules.push({ ...s.rules[0]! }), /Two rules have the id/],
      [
        'a compute rule without a target',
        (s) => delete s.rules.find((r) => r.kind === 'compute')!.target,
        /needs a target/,
      ],
      ['a confidence over 1', (s) => (s.rules[0]!.confidence = 1.5), /confidence/],
      [
        'a rule the expression language cannot read',
        (s) => (s.rules[0]!.expression = 'bill.subtotal >'),
        /rules.0.expression: The expression ends too early/,
      ],
      [
        'a field name that is not a dBASE name',
        (s) => (s.entities[0]!.fields[0]!.name = 'name with space'),
        /fields/,
      ],
    ];
    for (const [what, spoil, message] of bad)
      it(what, () => {
        const s = clone(SHIFA_REFERENCE_SOUL);
        spoil(s);
        expect(() => parseSoul(JSON.stringify(s))).toThrow(SoulError);
        expect(() => parseSoul(JSON.stringify(s))).toThrow(message);
      });
  });

  it('parseSoul says why text is not a Soul', () => {
    expect(() => parseSoul('{nope')).toThrow(/Not JSON/);
    expect(() => parseSoul('{}')).toThrow(/schemaVersion/);
  });
});

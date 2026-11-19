// fast-check arbitraries for valid Souls: every reference inside points at something that exists.
import fc from 'fast-check';
import type { Soul } from './ir';

const fieldName = fc.stringMatching(/^[A-Z][A-Z0-9_]{0,9}$/);
const id = fc.stringMatching(/^[a-z][a-z0-9-]{0,20}$/);
const fingerprint = fc.stringMatching(/^[0-9a-f]{16}$/).map((h) => `fp_${h}`);
const text = fc.string({ minLength: 1, maxLength: 60 });
const field = fc.record({
  type: fc.constantFrom('C', 'N', 'D', 'L', 'M', 'F' as const),
  length: fc.integer({ min: 1, max: 254 }),
  decimals: fc.integer({ min: 0, max: 15 }),
});

const entities = fc
  .uniqueArray(fc.tuple(id, fc.uniqueArray(fieldName, { minLength: 1, maxLength: 6 })), {
    minLength: 1,
    maxLength: 4,
    selector: ([i]) => i,
  })
  .chain((list) =>
    fc.tuple(
      ...list.map(([eid, names], i) =>
        fc
          .record({
            name: text,
            fields: fc.tuple(...names.map((n) => field.map((f) => ({ name: n, ...f })))),
            keyCount: fc.nat({ max: names.length }),
            counter: fc.boolean(),
            fk: fc.boolean(),
          })
          .map(({ name, fields, keyCount, counter, fk }) => {
            const target = list[(i + 1) % list.length]!;
            return {
              id: eid,
              name,
              file: `T${i}.DBF`,
              fields,
              key: names.slice(0, keyCount),
              foreignKeys: fk
                ? [
                    {
                      fields: [names[0]!],
                      references: { entity: target[0], fields: [target[1][0]!] },
                    },
                  ]
                : [],
              counters: counter ? [{ field: names[0]!, pattern: 'C####' }] : [],
            };
          }),
      ),
    ),
  );

export const soulArbitrary: fc.Arbitrary<Soul> = fc
  .record({
    entities,
    screenIds: fc.uniqueArray(fingerprint, { minLength: 1, maxLength: 4 }),
    version: fc.integer({ min: 1, max: 1000 }),
    ruleIds: fc.uniqueArray(id, { maxLength: 5 }),
    seed: fc.array(fc.nat(), { minLength: 8, maxLength: 8 }),
    created: fc.date({
      min: new Date('2020-01-01'),
      max: new Date('2030-01-01'),
      noInvalidDate: true,
    }),
    en: text,
    ur: fc.string({ maxLength: 60 }),
    confidence: fc.double({ min: 0, max: 1, noNaN: true }),
  })
  .map(({ entities: ents, screenIds, version, ruleIds, seed, created, en, ur, confidence }) => {
    const pick = <T>(xs: T[], n: number) => xs[n % xs.length]!;
    const e0 = ents[0]!;
    return {
      schemaVersion: 1 as const,
      app: { id: 'shifa', name: 'Shifa Medical Store' },
      version,
      provenance: {
        createdAt: created.toISOString(),
        createdBy: 'archaeologist' as const,
        observationCount: seed[0]!,
        ...(version > 1 ? { parentVersion: version - 1 } : {}),
      },
      entities: ents,
      screens: screenIds.map((sid, i) => ({
        id: sid,
        title: `SCREEN ${i}`,
        fields: [
          {
            label: 'Code',
            row: seed[1]! % 25,
            col: seed[2]! % 80,
            width: (seed[3]! % 20) + 1,
            binds: { entity: e0.id, field: e0.fields[0]!.name },
          },
        ],
        navigation: [{ keys: '{Esc}', to: pick(screenIds, i + 1) }],
      })),
      actions: [
        {
          id: 'save',
          screen: screenIds[0]!,
          name: 'Save',
          keys: '{F2}',
          effects: [{ entity: e0.id, kind: 'insert' as const, fields: [e0.fields[0]!.name] }],
        },
      ],
      rules: ruleIds.map((rid, i) => ({
        id: rid,
        kind: pick(['compute', 'validate', 'effect', 'counter'] as const, seed[4]! + i),
        target: 'bill.total',
        en,
        ur,
        expression: `bill.subtotal > ${seed[5]}`,
        evidence: [`obs-${seed[6]}`],
        confidence,
      })),
    };
  });

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GraveyardCatalog,
  GraveyardManifest,
  publicEntry,
  type GraveyardManifestT,
} from './graveyard';

const valid: GraveyardManifestT = {
  id: 'shifa',
  name: 'Shifa Medical Store',
  version: '2.3',
  born: 1998,
  died: 2004,
  kind: 'pharmacy',
  place: 'Satellite Town, Rawalpindi',
  story: 'Two lines.\nOf story.',
  executable: 'SHIFA.EXE',
  dataFiles: ['MEDICINE.DBF'],
  dosTime: '1998-07-15 10:00:00',
  preview: 'menu/MENU.SCR',
  knownRules: [
    {
      id: 'gst-17-truncated',
      text: '17% GST, truncated to the paisa.',
      scenarios: ['bill-small'],
      truth: {
        kind: 'compute',
        target: 'bill.gst',
        expression: 'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
      },
    },
  ],
  knownBugs: [
    {
      id: 'y2k-expiry',
      text: 'Two-digit year.',
      severity: 'high',
      scenarios: ['y2k-blocks-2000'],
      truth: { smell: 'two-digit-year', target: 'medicine.expiry' },
    },
  ],
};

describe('GraveyardManifest', () => {
  it('accepts a valid manifest', () => {
    expect(GraveyardManifest.parse(valid)).toEqual(valid);
  });

  it.each([
    ['an unknown field', { ...valid, secret: 1 }],
    ['died before born', { ...valid, died: 1990 }],
    ['a lower-case id with spaces', { ...valid, id: 'Shifa Store' }],
    ['a non-DOS executable', { ...valid, executable: 'shifa.exe' }],
    ['no data files', { ...valid, dataFiles: [] }],
    [
      'a rule without evidence',
      { ...valid, knownRules: [{ ...valid.knownRules[0]!, id: 'x', scenarios: [] }] },
    ],
    [
      'a rule without its truth',
      { ...valid, knownRules: [{ id: 'x', text: 'y', scenarios: ['bill-small'] }] },
    ],
    [
      'a truth with a bad target',
      {
        ...valid,
        knownRules: [{ ...valid.knownRules[0]!, truth: { kind: 'compute', target: 'BILL' } }],
      },
    ],
    ['a bad severity', { ...valid, knownBugs: [{ ...valid.knownBugs[0]!, severity: 'meh' }] }],
    ['duplicate rule ids', { ...valid, knownRules: [valid.knownRules[0]!, valid.knownRules[0]!] }],
    // Prompt 73: every known bug carries its truth for the Exorcist's score, with a known smell.
    [
      'a bug with no truth',
      { ...valid, knownBugs: [{ ...valid.knownBugs[0]!, truth: undefined }] },
    ],
    [
      'a bug with an unknown smell',
      { ...valid, knownBugs: [{ ...valid.knownBugs[0]!, truth: { smell: 'spooky' } }] },
    ],
    ['a story longer than 3 lines', { ...valid, story: 'a\nb\nc\nd' }],
  ])('rejects %s', (_label, m) => {
    expect(GraveyardManifest.safeParse(m).success).toBe(false);
  });
});

describe('publicEntry', () => {
  it('keeps what the Graveyard page shows and adds the bundle URL and preview', () => {
    const e = publicEntry(valid, ['line 1', 'line 2']);
    expect(e).toEqual({
      id: 'shifa',
      name: 'Shifa Medical Store',
      version: '2.3',
      born: 1998,
      died: 2004,
      kind: 'pharmacy',
      place: 'Satellite Town, Rawalpindi',
      story: 'Two lines.\nOf story.',
      executable: 'SHIFA.EXE',
      // The app's DOS clock, so the browser can start it at its own date (Prompt 31).
      dosTime: '1998-07-15 10:00:00',
      bundle: '/graveyard/shifa.jsdos',
      preview: ['line 1', 'line 2'],
    });
  });

  it('property: never leaks the hidden rules or bugs, whatever they contain', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1 }), fc.string({ minLength: 1 }), (rule, bug) => {
        const m = {
          ...valid,
          knownRules: [
            {
              id: 'r',
              text: `SECRET-RULE ${rule}`,
              scenarios: ['s'],
              // The truth the score checks against is hidden too (Prompt 56).
              truth: {
                kind: 'compute' as const,
                target: 'bill.gst',
                expression: `SECRET-TRUTH ${rule}`,
              },
            },
          ],
          knownBugs: [
            {
              id: 'b',
              text: `SECRET-BUG ${bug}`,
              severity: 'low' as const,
              scenarios: ['s'],
              truth: { smell: 'rounding' as const },
            },
          ],
        };
        const json = JSON.stringify(publicEntry(m, []));
        expect(json).not.toContain('SECRET-');
        expect(json).not.toMatch(/knownRules|knownBugs|scenarios|truth|bill\.gst/);
      }),
    );
  });
});

describe('GraveyardCatalog', () => {
  const entry = publicEntry(
    valid,
    Array.from({ length: 25 }, () => ''),
  );

  it('accepts what publicEntry produces', () => {
    expect(GraveyardCatalog.parse({ disclosure: 'x', apps: [entry] }).apps[0]).toEqual(entry);
  });

  it('rejects an entry carrying hidden data', () => {
    expect(
      GraveyardCatalog.safeParse({ disclosure: 'x', apps: [{ ...entry, knownRules: [] }] }).success,
    ).toBe(false);
  });
});

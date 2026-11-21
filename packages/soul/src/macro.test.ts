// @spec archaeologist-completion#1.1 The macro language and its round-trip property.
import { parseKeys } from '@afterlife/emulator';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MacroError, expandMacro, isMacro, macroFields } from './macro';

const BILL = '{@CUST_ID}{Enter}{lines}{#CODE}{Enter}{#QTY}{Enter}{/lines}{Enter}{F2}';

describe('expandMacro', () => {
  it("gives Shifa's own keys for a bill (samples/graveyard/shifa/scenarios/bill-small.keys)", () => {
    expect(
      expandMacro(BILL, {
        values: { CUST_ID: '' },
        lines: [
          { CODE: 'PAN500', QTY: '4' },
          { CODE: 'BRU400', QTY: '2' },
        ],
      }),
    ).toBe('{Enter}PAN500{Enter}4{Enter}BRU400{Enter}2{Enter}{Enter}{F2}');
    expect(
      expandMacro('A{@NAME}{Enter}{@PHONE}{Enter}', { values: { NAME: 'ALI', PHONE: '051' } }),
    ).toBe('A' + 'ALI{Enter}051{Enter}');
  });

  it('types a brace in a value as a brace, so the keys always parse (invariant)', () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[ -~]{0,8}$/),
        fc.array(
          fc.record({
            CODE: fc.stringMatching(/^[ -~]{0,6}$/),
            QTY: fc.nat({ max: 999 }).map(String),
          }),
          {
            maxLength: 4,
          },
        ),
        (cust, lines) => {
          const keys = expandMacro(BILL, { values: { CUST_ID: cust }, lines });
          const text = parseKeys(keys)
            .filter((s) => s.kind === 'text')
            .map((s) => (s.kind === 'text' ? s.text : ''))
            .join('');
          expect(text).toBe(cust + lines.map((l) => l.CODE + l.QTY).join(''));
        },
      ),
    );
  });
});

describe('macroFields and isMacro', () => {
  it('lists the fields asked for, and refuses a macro that is not well formed', () => {
    expect(macroFields(BILL)).toEqual({ record: ['CUST_ID'], line: ['CODE', 'QTY'] });
    expect(isMacro(BILL)).toBe(true);
    expect(isMacro('{Enter}{F2}')).toBe(false);
    for (const bad of ['{#CODE}', '{lines}{#CODE}', '{/lines}', '{lines}{lines}{/lines}{/lines}'])
      expect(() => macroFields(bad), bad).toThrow(MacroError);
  });
});

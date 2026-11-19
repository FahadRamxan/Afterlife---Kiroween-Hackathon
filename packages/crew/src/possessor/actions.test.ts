import { parseKeys } from '@afterlife/emulator';
import { analyzeScreen, gridFromCells } from '@afterlife/screen';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { scrCells } from '../../../screen/src/test-screens';
import { EXIT_WORDS, activeField, hintKeys, screenActions } from './actions';

/** A real Shifa screen, dumped from DOSBox (samples/graveyard/fixtures/shifa). */
const shifa = (path: string) => analyzeScreen(gridFromCells(scrCells(`shifa/${path}`)));

describe('hintKeys', () => {
  it('turns a status-bar key into the keys to press', () => {
    expect(hintKeys('F2')).toEqual(['{F2}']);
    expect(hintKeys('A')).toEqual(['A']);
    expect(hintKeys('PgDn/PgUp')).toEqual(['{PgDn}', '{PgUp}']);
    expect(hintKeys('Enter on blank code')).toEqual(['{Enter}']);
    expect(hintKeys('Esc')).toEqual(['{Esc}']);
    expect(hintKeys('1-5')).toEqual([]);
    expect(hintKeys('Ctrl+W')).toEqual([]);
  });

  it('every key it gives is a valid key sequence (invariant)', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 30 }), (s) => {
        for (const k of hintKeys(s)) expect(() => parseKeys(k)).not.toThrow();
      }),
    );
  });
});

describe('screenActions on real Shifa screens', () => {
  it('the main menu: the four menu items, never Exit, and no field', () => {
    const acts = screenActions(shifa('menu/MENU'));
    expect(acts.map((a) => (a.kind === 'menu' ? `${a.keys} ${a.label}` : a.kind))).toEqual([
      '1 New Bill',
      '2 Stock',
      '3 Customers',
      '4 Daily Report',
    ]);
    expect(acts.some((a) => a.kind === 'fill')).toBe(false);
  });

  it('a bar menu (Iqra): each item by arrows from the highlighted one, then Enter', () => {
    const m = analyzeScreen(gridFromCells(scrCells('iqra/menu/MENU')));
    const acts = screenActions(m).filter((a) => a.kind === 'menu');
    expect(acts.length).toBeGreaterThanOrEqual(3);
    expect(acts[0]!.kind === 'menu' && acts[0]!.keys).toBe('{Enter}');
    expect(acts[1]!.kind === 'menu' && acts[1]!.keys).toBe('{Down}{Enter}');
    expect(acts.map((a) => a.kind === 'menu' && a.label).join(' ')).not.toMatch(EXIT_WORDS);
    // The arrow hints are not tried on their own.
    expect(
      screenActions(m).some((a) => a.kind === 'hint' && ['{Up}', '{Down}'].includes(a.keys)),
    ).toBe(false);
  });

  it('a Y/N question (Barkat): only Yes then No, as the app waits for nothing else', () => {
    const m = analyzeScreen(gridFromCells(scrCells('barkat/sale-ok/CONFIRM')));
    expect(screenActions(m).map((a) => a.kind === 'hint' && [a.keys, a.save])).toEqual([
      ['Y', true],
      ['N', false],
    ]);
    expect(screenActions(m)[0]).toMatchObject({
      label: 'Y: SAVE SALE OF RS 450.00 FOR P003? (Y/N)',
    });
  });

  it('a bill with its totals: Save first; Esc is never an exploring action', () => {
    const acts = screenActions(shifa('bill-small/TOTALS'));
    expect(acts).toEqual([
      { kind: 'hint', id: 'hint:{F2}', keys: '{F2}', label: 'F2=Save bill', save: true },
    ]);
  });

  it('the stock list: its paging keys', () => {
    expect(screenActions(shifa('stock/STOCK1')).map((a) => a.kind === 'hint' && a.keys)).toEqual([
      '{PgDn}',
      '{PgUp}',
    ]);
  });

  it('the customer list: Add first (it may save), then the paging keys', () => {
    expect(
      screenActions(shifa('customers/CUSTS')).map((a) => a.kind === 'hint' && a.label),
    ).toEqual(['A=Add customer', 'PgDn/PgUp=Page', 'PgDn/PgUp=Page']);
  });
});

describe('activeField', () => {
  it('is the empty input box the app waits on, with its label and width', () => {
    expect(activeField(shifa('bill-small/LINES'))).toMatchObject({
      label: 'Code',
      length: 6,
      kind: 'reverse',
    });
  });

  it('none on a menu', () => {
    expect(activeField(shifa('menu/MENU'))).toBeNull();
  });
});

describe('EXIT_WORDS', () => {
  it('knows the ways out of a DOS program, and nothing else', () => {
    for (const w of ['Exit', '5  Exit', 'Quit', 'Logout', 'Exit to DOS'])
      expect(EXIT_WORDS.test(w), w).toBe(true);
    for (const w of ['New Bill', 'Stock', 'Daily Report', 'Text', 'Existing'])
      expect(EXIT_WORDS.test(w), w).toBe(false);
  });
});

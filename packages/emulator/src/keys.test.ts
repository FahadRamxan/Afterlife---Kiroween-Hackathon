import { describe, expect, it } from 'vitest';
import { KEY_NAMES, KeyParseError, jsdosKeys, parseKeys, printKeys } from './keys';

describe('parseKeys', () => {
  it('reads the example from the plan', () => {
    expect(parseKeys('1{Enter}PANADOL{Tab}2{F2}')).toEqual([
      { kind: 'text', text: '1' },
      { kind: 'key', key: 'Enter', mods: [] },
      { kind: 'text', text: 'PANADOL' },
      { kind: 'key', key: 'Tab', mods: [] },
      { kind: 'text', text: '2' },
      { kind: 'key', key: 'F2', mods: [] },
    ]);
  });

  it.each([
    ['{Esc}', 'Esc'],
    ['{F1}', 'F1'],
    ['{F12}', 'F12'],
    ['{Up}', 'Up'],
    ['{Down}', 'Down'],
    ['{Left}', 'Left'],
    ['{Right}', 'Right'],
    ['{PgUp}', 'PgUp'],
    ['{PgDn}', 'PgDn'],
    ['{Home}', 'Home'],
    ['{End}', 'End'],
    ['{Ins}', 'Ins'],
    ['{Del}', 'Del'],
    ['{Backspace}', 'Backspace'],
  ])('reads %s', (seq, key) => {
    expect(parseKeys(seq)).toEqual([{ kind: 'key', key, mods: [] }]);
  });

  it('reads Alt, Ctrl and Shift combinations, in a fixed order', () => {
    expect(parseKeys('{Alt+X}{Ctrl+C}{Shift+Tab}{Alt+Ctrl+Del}{ctrl+alt+del}')).toEqual([
      { kind: 'key', key: 'X', mods: ['Alt'] },
      { kind: 'key', key: 'C', mods: ['Ctrl'] },
      { kind: 'key', key: 'Tab', mods: ['Shift'] },
      { kind: 'key', key: 'Del', mods: ['Ctrl', 'Alt'] },
      { kind: 'key', key: 'Del', mods: ['Ctrl', 'Alt'] },
    ]);
  });

  it('key names are case-insensitive and print in one spelling', () => {
    expect(printKeys(parseKeys('{enter}{ESC}{pgdn}{f3}'))).toBe('{Enter}{Esc}{PgDn}{F3}');
  });

  it('{{} and {}} type a literal brace; spaces are text', () => {
    expect(parseKeys('A{{}B{}} C')).toEqual([{ kind: 'text', text: 'A{B} C' }]);
  });

  it.each([
    ['an unknown key', '{Foo}', /unknown key "Foo" at 0/],
    ['an unclosed brace', 'AB{Enter', /unclosed "\{" at 2/],
    ['a stray closing brace', 'AB}C', /stray "\}" at 2/],
    ['a modifier with no key', '{Alt+}', /no key after the modifiers at 0/],
    ['a repeated modifier', '{Alt+Alt+X}', /repeats Alt at 0/],
    ['a character DOS keyboards do not have', 'café', /cannot type "é" at 3/],
    ['an empty key', '{}', /empty \{\} at 0/],
  ])('refuses %s', (_label, seq, message) => {
    expect(() => parseKeys(seq)).toThrow(KeyParseError);
    expect(() => parseKeys(seq)).toThrow(message);
  });

  it('knows every key it prints', () => {
    for (const k of KEY_NAMES)
      expect(parseKeys(`{${k}}`)).toEqual([{ kind: 'key', key: k, mods: [] }]);
  });
});

describe('jsdosKeys (js-dos key codes, GLFW numbering)', () => {
  it('types lower case plainly and upper case with Shift', () => {
    expect(jsdosKeys(parseKeys('aB1'))).toEqual([[65], [340, 66], [49]]);
  });

  it('types shifted symbols with Shift on the US keyboard', () => {
    expect(jsdosKeys(parseKeys('!:?'))).toEqual([
      [340, 49],
      [340, 59],
      [340, 47],
    ]);
  });

  it('maps named keys and combinations', () => {
    expect(jsdosKeys(parseKeys('{Enter}{Esc}{F2}{PgDn}{Alt+X}{Ctrl+Alt+Del}'))).toEqual([
      [257],
      [256],
      [291],
      [267],
      [342, 88],
      [341, 342, 261],
    ]);
  });
});

import { printKeys } from '@afterlife/emulator';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { keyFromEvent, thumbnailSize } from './seance';

const ev = (
  key: string,
  mods: Partial<{ ctrlKey: boolean; altKey: boolean; shiftKey: boolean; metaKey: boolean }> = {},
) => ({
  key,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  metaKey: false,
  ...mods,
});

describe('keyFromEvent (a key pressed on the DOS screen)', () => {
  it.each([
    ['Enter', '{Enter}'],
    ['Escape', '{Esc}'],
    ['Tab', '{Tab}'],
    ['Backspace', '{Backspace}'],
    ['Delete', '{Del}'],
    ['Insert', '{Ins}'],
    ['Home', '{Home}'],
    ['End', '{End}'],
    ['PageUp', '{PgUp}'],
    ['PageDown', '{PgDn}'],
    ['ArrowUp', '{Up}'],
    ['ArrowDown', '{Down}'],
    ['ArrowLeft', '{Left}'],
    ['ArrowRight', '{Right}'],
    ['F1', '{F1}'],
    ['F12', '{F12}'],
    ['2', '2'],
    ['a', 'a'],
    ['P', 'P'],
    [' ', ' '],
    ['{', '{{}'],
  ])('%j is %s', (key, seq) => {
    expect(printKeys([keyFromEvent(ev(key))!])).toBe(seq);
  });

  it('Ctrl and Alt combinations', () => {
    expect(printKeys([keyFromEvent(ev('x', { altKey: true }))!])).toBe('{Alt+X}');
    expect(printKeys([keyFromEvent(ev('C', { ctrlKey: true, shiftKey: true }))!])).toBe(
      '{Ctrl+Shift+C}',
    );
    expect(printKeys([keyFromEvent(ev('F3', { shiftKey: true }))!])).toBe('{Shift+F3}');
  });

  it('ignores keys DOS cannot get: modifiers alone, the system key, non-ASCII', () => {
    for (const k of ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Unidentified', 'é', 'ش'])
      expect(keyFromEvent(ev(k)), k).toBeNull();
    expect(keyFromEvent(ev('r', { metaKey: true }))).toBeNull();
  });

  it('every printable ASCII key is typed as itself', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0x20, max: 0x7e }), (c) => {
        const ch = String.fromCharCode(c);
        expect(keyFromEvent(ev(ch))).toEqual({ kind: 'text', text: ch });
      }),
    );
  });
});

describe('thumbnailSize', () => {
  it('keeps the 8:5 shape of a 640x400 or 720x400 screen', () => {
    expect(thumbnailSize(640, 400, 160)).toEqual({ width: 160, height: 100 });
    expect(thumbnailSize(720, 400, 160)).toEqual({ width: 160, height: 89 });
  });
});

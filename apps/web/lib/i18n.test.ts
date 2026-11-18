import fc from 'fast-check';
import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../messages/en.json';
import ur from '../messages/ur.json';
import { DEFAULT_LOCALE, LOCALES, dirFor, isLocale, resolveLocale } from './i18n';

function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object' ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

function values(obj: object): unknown[] {
  return Object.values(obj).flatMap((v) => (v && typeof v === 'object' ? values(v) : [v]));
}

describe('locales', () => {
  it('supports English and Urdu, English by default', () => {
    expect(LOCALES).toEqual(['en', 'ur']);
    expect(DEFAULT_LOCALE).toBe('en');
  });

  it('isLocale only accepts known locales', () => {
    expect(isLocale('ur')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });

  it('Urdu is right-to-left, English left-to-right', () => {
    expect(dirFor('ur')).toBe('rtl');
    expect(dirFor('en')).toBe('ltr');
  });
});

describe('resolveLocale', () => {
  it('prefers the cookie', () => {
    expect(resolveLocale('ur', 'en-US,en;q=0.9')).toBe('ur');
    expect(resolveLocale('en', 'ur-PK')).toBe('en');
  });

  it('falls back to Accept-Language, then English', () => {
    expect(resolveLocale(undefined, 'ur-PK,ur;q=0.9,en;q=0.8')).toBe('ur');
    expect(resolveLocale('xx', 'fr-FR')).toBe('en');
    expect(resolveLocale(undefined, undefined)).toBe('en');
  });

  it('property: always returns a supported locale', () => {
    fc.assert(
      fc.property(fc.option(fc.string()), fc.option(fc.string()), (cookie, header) => {
        expect(LOCALES).toContain(resolveLocale(cookie ?? undefined, header ?? undefined));
      }),
    );
  });
});

describe('messages', () => {
  it('Urdu has exactly the same keys as English', () => {
    expect(keys(ur).sort()).toEqual(keys(en).sort());
  });

  it('no message is empty', () => {
    for (const v of [...values(en), ...values(ur)]) {
      expect(typeof v).toBe('string');
      expect((v as string).trim()).not.toBe('');
    }
  });

  it('Urdu messages are actually in Urdu script', () => {
    expect(ur.nav.graveyard).toMatch(/[\u0600-\u06FF]/);
    expect(ur.home.tagline).toMatch(/[\u0600-\u06FF]/);
  });

  it('no message lost its characters to a bad encoding ("??" or U+FFFD)', () => {
    for (const v of [...values(en), ...values(ur)]) {
      expect(v as string).not.toMatch(/\?\?|\uFFFD/);
    }
  });

  it('upload counts read right for one and for many', () => {
    // A real app often has a one-record settings table: "(1 records)" was wrong.
    const enT = createTranslator({ locale: 'en', messages: en, namespace: 'graveyard.upload' });
    const urT = createTranslator({ locale: 'ur', messages: ur, namespace: 'graveyard.upload' });
    expect(enT('tableCaption', { file: 'SETTINGS.DBF', count: 1 })).toBe('SETTINGS.DBF (1 record)');
    expect(enT('tableCaption', { file: 'MEDICINE.DBF', count: 40 })).toBe(
      'MEDICINE.DBF (40 records)',
    );
    const found = (t: typeof enT, count: number) =>
      t.markup('found', { name: 'SHIFA.EXE', count, program: (c) => c });
    expect(found(enT, 1)).toBe('Found SHIFA.EXE and 1 DBF file.');
    expect(found(enT, 4)).toBe('Found SHIFA.EXE and 4 DBF files.');
    // Urdu has its own word for one file, so "1" is not just the plural sentence with a 1 in it.
    expect(found(urT, 1)).toContain('1 DBF');
    expect(found(urT, 1).replace('1 DBF', '4 DBF')).not.toBe(found(urT, 4));
  });
});

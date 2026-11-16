import fc from 'fast-check';
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
});

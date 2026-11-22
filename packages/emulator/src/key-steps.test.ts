// @spec archaeologist-completion#3.2 The keys of a probe, in the steps a person types them in.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseKeys, printKeys } from './keys';
import { keySteps } from './key-steps';

describe('keySteps', () => {
  it('splits a filled-in macro after each key that is not text', () => {
    expect(keySteps('C0001{Enter}PAN500{Enter}2{Enter}{Enter}{F2}')).toEqual([
      'C0001{Enter}',
      'PAN500{Enter}',
      '2{Enter}',
      '{Enter}',
      '{F2}',
    ]);
    expect(keySteps('A{Enter}AHMED')).toEqual(['A{Enter}', 'AHMED']);
    expect(keySteps('')).toEqual([]);
  });

  it('typing the steps one after the other presses exactly the macro’s keys (round-trip)', () => {
    const key = fc.oneof(
      fc.stringMatching(/^[A-Z0-9 ]{1,6}$/),
      fc.constantFrom('{Enter}', '{F2}', '{Esc}', '{Tab}'),
    );
    fc.assert(
      fc.property(fc.array(key, { maxLength: 12 }), (parts) => {
        const keys = printKeys(parseKeys(parts.join('')));
        const steps = keySteps(keys);
        expect(printKeys(parseKeys(steps.join('')))).toBe(keys);
        // Each step ends with its one key that is not text, except a last step of text only.
        for (const s of steps.slice(0, -1)) expect(parseKeys(s).at(-1)!.kind).not.toBe('text');
      }),
    );
  });
});

// The property examples quoted in .kiro/steering/testing-rule.md.
// tests/testing-rule.test.ts checks the doc quotes this file verbatim, so the examples always run.
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

// Tiny functions the examples test. Real ones live in the packages.
const encode = (s: string) => new TextEncoder().encode(s);
const decode = (b: Uint8Array) => new TextDecoder().decode(b);

const paisa = (rupees: number) => Math.round(rupees * 100);
const gstTruncated = (amountPaisa: number) => Math.trunc((amountPaisa * 17) / 100);
// Independent version: split into whole rupees and paisa (a = 100q + r).
const gstReference = (amountPaisa: number) => {
  const rupees = Math.trunc(amountPaisa / 100);
  const rest = amountPaisa % 100;
  return rupees * 17 + Math.trunc((rest * 17) / 100);
};

describe('testing-rule examples', () => {
  it('round-trip', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        expect(decode(encode(s))).toBe(s);
      }),
    );
  });

  it('invariant', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (amount) => {
        const gst = gstTruncated(amount);
        expect(Number.isInteger(gst)).toBe(true);
        expect(gst).toBeLessThanOrEqual((amount * 17) / 100);
        expect(gst).toBeGreaterThan((amount * 17) / 100 - 1);
      }),
    );
  });

  it('differential', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 10_000_000 }), (amount) => {
        expect(gstTruncated(amount)).toBe(gstReference(amount));
      }),
    );
  });

  it('helpers behave on a fixed example', () => {
    expect(paisa(5000.06)).toBe(500006);
    expect(gstTruncated(500006)).toBe(85001);
  });
});

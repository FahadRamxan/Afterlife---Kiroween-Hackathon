// @spec exorcist#3.1 The Exorcism tab's data (Prompt 75): the findings, the ghosts left, a choice.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExorcismsSchema, decideExorcism, getExorcisms, sinceText } from './exorcism';

const finding = {
  code: 'two-digit-year:medicine.expiry',
  smell: 'two-digit-year',
  severity: 'high',
  target: 'medicine.expiry',
  titleEn: 'Medicine expiry is compared with two-digit years',
  titleUr: 'دو ہندسوں والا سال',
  en: 'The old app compares EXPIRY with two-digit years.',
  ur: 'پرانی ایپ',
  since: 1998,
  evidence: [
    {
      kind: 'observation',
      ref: 'o1',
      text: 'ORS001 ... EXPIRED',
      screen: ['STOCK', 'ORS001 30/06/00 EXPIRED'],
    },
  ],
  decision: 'pending',
  decidedAt: null,
  fixable: true,
  why: null,
  fixEn: 'EXPIRY is compared with four-digit years',
  fixUr: 'چار ہندسے',
};

afterEach(() => vi.unstubAllGlobals());

describe('the exorcism client', () => {
  it('reads the findings and the ghosts left', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ findings: [finding], remaining: 1 }))),
    );
    const r = await getExorcisms('http://api', '0192b6a0-0000-7000-8000-000000000001');
    expect(r).toEqual({ ok: true, findings: [finding], remaining: 1 });
    expect(
      ExorcismsSchema.safeParse({ findings: [{ ...finding, severity: 'spooky' }], remaining: 1 })
        .success,
    ).toBe(false);
  });

  it('sends a choice to the finding, its code in the URL', async () => {
    const f = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ decision: 'fix', soulVersion: 3, changed: true, proving: true }),
        ),
    );
    vi.stubGlobal('fetch', f);
    const r = await decideExorcism('http://api', 'p1', 'two-digit-year:medicine.expiry', 'fix');
    expect(r).toEqual({ ok: true, decision: 'fix', soulVersion: 3, changed: true, proving: true });
    expect(f).toHaveBeenCalledWith(
      'http://api/api/projects/p1/exorcisms/two-digit-year%3Amedicine.expiry',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ decision: 'fix' }) }),
    );
  });

  it('says why a choice was refused', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: 'ALREADY_DECIDED',
              message: 'This finding was already decided: keep',
            }),
            { status: 409 },
          ),
      ),
    );
    expect(await decideExorcism('http://api', 'p1', 'x', 'fix')).toEqual({
      ok: false,
      message: 'This finding was already decided: keep',
    });
  });

  it('"since 1998", or nothing when the year is not known', () => {
    expect(sinceText(1998)).toBe('since 1998');
    expect(sinceText(null)).toBe('');
  });
});

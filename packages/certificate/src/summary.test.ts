// @spec rebirth-certificate#3.1 The certificate in words, and as a PDF (Prompt 72).
import fc from 'fast-check';
import { beforeAll, describe, expect, it } from 'vitest';
import { newSigningKey, signCertificate, type SignedCertificate } from './certificate';
import { certificateLines, certificatePdf } from './summary';
import { samplePayload } from './testing';

let cert: SignedCertificate;
beforeAll(async () => {
  const key = await newSigningKey();
  cert = await signCertificate(await samplePayload(key.keyId), key);
});
const URL_ = 'https://afterlife.example/verify/0192b6a0-0000-7000-8000-000000000001';
const text = (pdf: Uint8Array) => new TextDecoder().decode(pdf);

describe('certificateLines', () => {
  it('says what was proved, in plain English', () => {
    const lines = certificateLines(cert.payload);
    expect(lines.find((l) => l.label === 'App')!.value).toBe('Shifa Medical Store (sample app)');
    expect(lines.find((l) => l.label === 'Proof')!.value).toBe(
      '200 cases, 188 the same, 0 differences, 12 skipped (seed 1998)',
    );
    expect(lines.find((l) => l.label === 'Data')!.value).toBe(
      '2 totals reconciled, every one matching',
    );
    expect(lines.find((l) => l.label === '  MEDICINE.DBF stock value')!.value).toBe(
      '81234.50 -> 81234.50',
    );
    expect(lines.find((l) => l.label === 'Accepted divergences')!.value).toMatch(/^none/);
  });

  it('names each accepted divergence', () => {
    const lines = certificateLines({
      ...cert.payload,
      acceptedDivergences: [{ id: 'y2k-expiry', text: 'Fixed the Y2K expiry check' }],
    });
    expect(lines.find((l) => l.label === 'Accepted divergences')!.value).toBe(
      'Fixed the Y2K expiry check',
    );
  });
});

describe('certificatePdf', () => {
  it('is a PDF with the lines, the URL to check it at and the signature', () => {
    const pdf = text(certificatePdf(cert, URL_));
    expect(pdf.startsWith('%PDF-1.4\n')).toBe(true);
    expect(pdf.endsWith('%%EOF\n')).toBe(true);
    expect(pdf).toContain('(REBIRTH CERTIFICATE) Tj');
    expect(pdf).toContain('Shifa Medical Store');
    expect(pdf).toContain(`Check it at ${URL_}`);
    expect(pdf).toContain(cert.signature.slice(0, 40));
  });

  it('every cross-reference points at its object, on any app name (invariant)', () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 300 }),
        fc.integer({ min: 0, max: 200 }),
        (name, extra) => {
          const p = {
            ...cert.payload,
            app: { ...cert.payload.app, name },
            reconciliation: {
              ...cert.payload.reconciliation,
              lines: Array.from({ length: extra }, (_, i) => ({
                ...cert.payload.reconciliation.lines[0]!,
                table: `T${i}.DBF`,
              })),
            },
          };
          const bytes = certificatePdf({ ...cert, payload: p }, URL_);
          const pdf = text(bytes);
          // 7-bit only: its length in characters is its length in bytes.
          expect(bytes.length).toBe(pdf.length);
          const xref = Number(/startxref\n(\d+)\n%%EOF\n$/.exec(pdf)![1]);
          expect(pdf.slice(xref, xref + 4)).toBe('xref');
          const offsets = [...pdf.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) =>
            Number(m[1]),
          );
          offsets.forEach((o, i) =>
            expect(pdf.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`),
          );
          // Pages: as many as the lines need.
          const count = Number(/\/Count (\d+)/.exec(pdf)![1]);
          expect(count).toBe((pdf.match(/\/Type \/Page /g) ?? []).length);
        },
      ),
    );
  });
});

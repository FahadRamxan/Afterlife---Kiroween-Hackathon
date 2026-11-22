// What a Rebirth Certificate says, in words (Prompt 72): the lines /verify shows on its paper and
// writes into its PDF. The PDF is written by hand (Courier, A4, one page per 60 lines), as the
// receipt's is: no PDF library, and every character 7-bit so the byte offsets are exact. It
// carries the signature and key, so a printed copy can still be checked by hand.
import type { CertificatePayload, SignedCertificate } from './certificate';

export type CertificateLine = { label: string; value: string };

const n = (x: number) => new Intl.NumberFormat('en-US').format(x);

/** The certificate in plain English, line by line. */
export function certificateLines(p: CertificatePayload): CertificateLine[] {
  const differ = p.proof.failed;
  return [
    { label: 'Certificate', value: p.id },
    { label: 'Issued', value: `${p.issuedAt.slice(0, 10)} ${p.issuedAt.slice(11, 19)} UTC` },
    {
      label: 'App',
      value: `${p.app.name} (${p.app.source === 'graveyard' ? 'sample app' : 'uploaded'})`,
    },
    { label: 'Soul', value: `version ${p.soul.version}, SHA-256 ${p.soul.sha256}` },
    {
      label: 'Proof',
      value: `${n(p.proof.cases)} cases, ${n(p.proof.passed)} the same, ${n(differ)} ${differ === 1 ? 'difference' : 'differences'}, ${n(p.proof.skipped)} skipped (seed ${p.proof.seed})`,
    },
    {
      label: 'Data',
      value: `${p.reconciliation.lines.length} totals reconciled${p.reconciliation.matches ? ', every one matching' : ''}`,
    },
    ...p.reconciliation.lines.map((l) => ({
      label: `  ${l.table} ${l.total}`,
      value: `${l.before} -> ${l.after}${l.ok ? '' : ' (does not match)'}`,
    })),
    {
      label: 'Accepted divergences',
      value: p.acceptedDivergences.length
        ? p.acceptedDivergences.map((d) => d.text).join('; ')
        : 'none: the reborn app does exactly what the old app did',
    },
    { label: 'Issuer', value: `${p.issuer.name}, key ${p.issuer.keyId}` },
  ];
}

/** Text for a PDF string: 7-bit only (other characters become ?), with ( ) \ escaped. */
function pdfString(s: string): string {
  const ascii = [...s]
    .map((c) => (c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127 ? c : '?'))
    .join('');
  return `(${ascii.replace(/[\\()]/g, (m) => `\\${m}`)})`;
}

/** Splits a line to at most `width` characters, words kept whole where they fit. */
function wrap(line: string, width: number): string[] {
  const out: string[] = [];
  let rest = line;
  while (rest.length > width) {
    const cut = rest.lastIndexOf(' ', width);
    const at = cut > width / 2 ? cut : width;
    out.push(rest.slice(0, at));
    rest = `    ${rest.slice(at).trimStart()}`;
  }
  out.push(rest);
  return out;
}

const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 56;
const SIZE = 9;
const LEADING = 12;
const COLUMNS = 84;
const PER_PAGE = 60;

/** The certificate as an A4 PDF: its lines, the URL to check it at, and the signature. */
export function certificatePdf(cert: SignedCertificate, verifyUrl: string): Uint8Array {
  const text = [
    'REBIRTH CERTIFICATE',
    'Software that outlives its source code.',
    '',
    ...certificateLines(cert.payload).map((l) => `${l.label}: ${l.value}`),
    '',
    `Check it at ${verifyUrl}`,
    `Signed with ${cert.algorithm} over its ${cert.canonicalization} canonical JSON.`,
    `Public key ${cert.publicKey}`,
    `Signature ${cert.signature}`,
  ].flatMap((l) => wrap(l, COLUMNS));
  const pages: string[][] = [];
  for (let i = 0; i < text.length; i += PER_PAGE) pages.push(text.slice(i, i + PER_PAGE));
  // Objects: 1 catalog, 2 pages, 3 font, then a page and its contents for each page.
  const objects: string[] = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${pages.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>',
  ];
  pages.forEach((lines, i) => {
    const stream = [
      'BT',
      `/F1 ${SIZE} Tf`,
      `${LEADING} TL`,
      `${MARGIN} ${HEIGHT - MARGIN - SIZE} Td`,
      ...lines.map((l, j) => `${j ? 'T* ' : ''}${pdfString(l)} Tj`),
      'ET',
    ].join('\n');
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${WIDTH} ${HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    );
  });
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) pdf += `${String(o).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}

'use client';
import {
  certificateLines,
  certificatePdf,
  verifyCertificateText,
  type CertificatePayload,
  type SignedCertificate,
} from '@afterlife/certificate';
import { Button, CertificateFrame } from '@afterlife/ui';
import { useTranslations } from 'next-intl';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';

type State =
  | { phase: 'checking' }
  | { phase: 'valid'; payload: CertificatePayload; text: string; svg: string; url: string }
  | { phase: 'invalid'; reason: string }
  | { phase: 'missing' }
  | { phase: 'unavailable'; message: string };

const download = (bytes: Uint8Array | string, name: string, type: string) => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([bytes as BlobPart], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

/**
 * /verify/<certificate id> (Prompt 72): the certificate fetched from the API and checked here, in
 * the browser, against the key the issuer publishes. Nothing the server says about it is taken on
 * trust: a changed byte shows as not valid. A valid one is shown on bone paper with its seal, a QR
 * code of this page, and a PDF to keep.
 */
export function VerifyCertificate({ certId }: { certId: string }) {
  const t = useTranslations('verify');
  const [state, setState] = useState<State>({ phase: 'checking' });
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [c, k] = await Promise.all([
          fetch(`${API}/api/certificates/${certId}`),
          fetch(`${API}/.well-known/afterlife-key`),
        ]);
        if (c.status === 404) return alive && setState({ phase: 'missing' });
        if (!c.ok || !k.ok)
          return alive && setState({ phase: 'unavailable', message: t('unavailable') });
        const text = await c.text();
        const { publicKey } = (await k.json()) as { publicKey: string };
        const v = await verifyCertificateText(text, publicKey);
        if (!alive) return;
        if (!v.ok) return setState({ phase: 'invalid', reason: t(`reason.${v.reason}`) });
        const url = window.location.href.split('#')[0]!;
        const svg = await QRCode.toString(url, {
          type: 'svg',
          margin: 1,
          errorCorrectionLevel: 'M',
        });
        if (alive) setState({ phase: 'valid', payload: v.payload, text, svg, url });
      } catch {
        if (alive) setState({ phase: 'unavailable', message: t('unavailable') });
      }
    })();
    return () => {
      alive = false;
    };
  }, [certId, t]);

  if (state.phase === 'checking')
    return (
      <p role="status" className="mt-4 text-bone/70">
        {t('checking')}
      </p>
    );
  if (state.phase === 'missing' || state.phase === 'unavailable')
    return (
      <p role="alert" data-testid="verify-result" data-valid="unknown" className="mt-4">
        {state.phase === 'missing' ? t('emptyBody', { certId }) : state.message}
      </p>
    );
  if (state.phase === 'invalid')
    return (
      <div
        role="alert"
        data-testid="verify-result"
        data-valid="false"
        className="mt-4 rounded-lg bg-blood p-4 text-lg font-semibold text-graveyard"
      >
        <p>{t('invalid')}</p>
        <p className="mt-1 text-base font-normal">{state.reason}</p>
      </div>
    );
  const cert = JSON.parse(state.text) as SignedCertificate;
  return (
    <div className="mt-4 space-y-4">
      <p
        role="status"
        data-testid="verify-result"
        data-valid="true"
        className="rounded-lg border border-ectoplasm/60 p-3 text-ectoplasm"
      >
        {t('valid', { keyId: state.payload.issuer.keyId })}
      </p>
      <CertificateFrame title={t('paperTitle')}>
        <p className="text-center font-serif">{state.payload.app.name}</p>
        <dl
          lang="en"
          dir="ltr"
          data-testid="certificate-lines"
          className="mt-4 space-y-1 font-mono text-sm"
        >
          {/* On a phone (the QR code opens this page on one) each value goes under its label: two
              columns there left the values a few letters wide, broken mid-word. */}
          {certificateLines(state.payload).map((l, i) => (
            <div key={i} className="grid grid-cols-1 gap-x-2 sm:grid-cols-[14rem_1fr]">
              <dt className="whitespace-pre text-graveyard/70">{l.label}</dt>
              <dd className="[overflow-wrap:anywhere]">{l.value}</dd>
            </div>
          ))}
        </dl>
        <figure className="mt-6 w-36">
          <div
            role="img"
            aria-label={t('qr')}
            data-testid="certificate-qr"
            className="bg-bone"
            dangerouslySetInnerHTML={{ __html: state.svg }}
          />
          <figcaption className="mt-1 text-xs text-graveyard/70">{t('qrCaption')}</figcaption>
        </figure>
      </CertificateFrame>
      <div className="flex flex-wrap gap-3">
        <Button
          onClick={() =>
            download(
              certificatePdf(cert, state.url),
              `rebirth-certificate-${certId}.pdf`,
              'application/pdf',
            )
          }
        >
          {t('pdf')}
        </Button>
        <Button
          variant="secondary"
          onClick={() =>
            download(state.text, `rebirth-certificate-${certId}.json`, 'application/json')
          }
        >
          {t('file')}
        </Button>
      </div>
    </div>
  );
}

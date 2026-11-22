'use client';
import { Button } from '@afterlife/ui';
import { receiptPdf, receiptWhatsApp, type Receipt } from '@afterlife/vessel';
import { useTranslations } from 'next-intl';
import { ReceiptPaper } from './ReceiptPaper';

/** The PDF's file name: after the receipt's first value (the bill number). */
export const receiptFileName = (r: Receipt) =>
  `receipt-${(r.header[0]?.value ?? 'bill').replace(/[^A-Za-z0-9-]+/g, '-') || 'bill'}.pdf`;

/**
 * The receipt of the bill just saved (Prompt 61), with three ways to give it to the customer:
 * print it on the shop's 80 mm printer, send it on WhatsApp, or save it as a PDF. All three work
 * offline except WhatsApp itself; the PDF is made on the phone.
 */
export function VesselReceipt({ receipt }: { receipt: Receipt }) {
  const t = useTranslations('vessel.receipt');
  function download() {
    const bytes = receiptPdf(receipt);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = receiptFileName(receipt);
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <section
      aria-labelledby="vessel-receipt-title"
      data-testid="vessel-receipt"
      className="vessel-receipt space-y-3 rounded-lg border border-bone/15 p-3"
    >
      <h3 id="vessel-receipt-title" className="text-base font-semibold">
        {t('title')}
      </h3>
      <ReceiptPaper receipt={receipt} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={() => window.print()} className="min-h-12">
          {t('print')}
        </Button>
        <Button asChild variant="secondary" className="min-h-12">
          <a href={receiptWhatsApp(receipt)} target="_blank" rel="noopener noreferrer">
            {t('whatsapp')}
          </a>
        </Button>
        <Button type="button" variant="secondary" onClick={download} className="min-h-12">
          {t('pdf')}
        </Button>
      </div>
    </section>
  );
}

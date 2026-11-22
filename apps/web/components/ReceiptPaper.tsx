import type { Receipt } from '@afterlife/vessel';

/**
 * A receipt on paper (Prompt 61): the bill as the old app showed it, in its fields and order. The
 * words are the old app's own (English), so the paper is left to right whatever the page's
 * language. It is what prints (globals.css: 80 mm, nothing else on the page).
 */
export function ReceiptPaper({ receipt }: { receipt: Receipt }) {
  const strong = receipt.totals.length - 1;
  return (
    <div
      data-testid="receipt-paper"
      className="vessel-receipt-paper mx-auto w-full max-w-sm rounded-md bg-bone p-4 font-mono text-xs text-graveyard"
      lang="en"
      dir="ltr"
    >
      <p className="text-center text-sm font-semibold">{receipt.shop}</p>
      {receipt.header.length ? (
        <dl className="mt-2 space-y-0.5">
          {receipt.header.map((h, i) => (
            <div key={i} className="flex gap-1">
              {h.label ? <dt>{h.label}:</dt> : null}
              <dd>{h.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {receipt.columns.length ? (
        <table className="mt-2 w-full border-y border-dashed border-graveyard/60">
          <thead>
            <tr>
              {receipt.columns.map((c, i) => (
                <th
                  key={i}
                  scope="col"
                  className={c.align === 'right' ? 'px-0.5 text-right' : 'px-0.5 text-left'}
                >
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {receipt.rows.map((row, r) => (
              <tr key={r} className="align-top">
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={
                      receipt.columns[i]?.align === 'right'
                        ? 'px-0.5 text-right tabular-nums'
                        : 'px-0.5'
                    }
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {receipt.totals.length ? (
        <dl className="mt-2 space-y-0.5">
          {receipt.totals.map((x, i) => (
            <div
              key={i}
              className={i === strong ? 'flex justify-between font-bold' : 'flex justify-between'}
            >
              <dt>{x.label}</dt>
              <dd className="tabular-nums">{x.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}

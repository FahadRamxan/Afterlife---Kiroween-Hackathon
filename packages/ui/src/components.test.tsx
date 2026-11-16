import fc from 'fast-check';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  Button,
  Card,
  CertificateFrame,
  CRTFrame,
  DiffBadge,
  GhostCursor,
  ProgressCandle,
  Tombstone,
  candlePercent,
  cn,
} from './index';

const html = (el: ReactElement) => renderToStaticMarkup(el);

describe('cn', () => {
  it('merges conflicting Tailwind classes, last wins', () => {
    const isHidden = Math.random() > 2; // always false, but not a constant to the linter
    expect(cn('px-2 text-bone', isHidden && 'hidden', 'px-4')).toBe('text-bone px-4');
  });
});

describe('Button', () => {
  it('renders a button with the primary variant by default', () => {
    const out = html(<Button>Raise</Button>);
    expect(out).toMatch(/^<button/);
    expect(out).toContain('bg-ectoplasm');
    expect(out).toContain('type="button"');
  });

  it('supports danger and asChild', () => {
    expect(html(<Button variant="danger">Fix</Button>)).toContain('bg-blood');
    const link = html(
      <Button asChild>
        <a href="/graveyard">Go</a>
      </Button>,
    );
    expect(link).toMatch(/^<a [^>]*href="\/graveyard"/);
  });
});

describe('Card', () => {
  it('renders its children', () => {
    expect(html(<Card>hello</Card>)).toContain('hello');
  });
});

describe('Tombstone', () => {
  it('shows the name and born-died years', () => {
    const out = html(<Tombstone name="Shifa Medical Store" born={1998} died={2009} />);
    expect(out).toContain('Shifa Medical Store');
    expect(out).toContain('1998\u20132009');
  });
});

describe('CRTFrame', () => {
  it('marks itself as the live legacy screen and has scanlines', () => {
    const out = html(<CRTFrame label="Shifa 1998">C:\&gt;</CRTFrame>);
    expect(out).toContain('aria-label="Shifa 1998"');
    expect(out).toContain('crt-scanlines');
    expect(out).toContain('crt-glow');
  });
});

describe('GhostCursor', () => {
  it('sits on the given text cell and is hidden from screen readers', () => {
    const out = html(<GhostCursor col={10} row={4} />);
    expect(out).toContain('aria-hidden="true"');
    expect(out).toContain('left:10ch');
    expect(out).toContain('top:calc(4 * var(--cell-h, 1.25em))');
  });
});

describe('DiffBadge', () => {
  it.each([
    ['inserted', 'bg-ectoplasm', 'Inserted'],
    ['deleted', 'bg-blood', 'Deleted'],
    ['changed', 'bg-candle', 'Changed'],
    ['same', 'bg-bone', 'No change'],
  ] as const)('%s uses %s and says "%s"', (kind, cls, label) => {
    const out = html(<DiffBadge kind={kind} count={3} />);
    expect(out).toContain(cls);
    expect(out).toContain(label);
    expect(out).toContain('3');
  });
});

describe('ProgressCandle', () => {
  it('is an accessible progressbar', () => {
    const out = html(<ProgressCandle value={1284} max={2000} label="Proof cases" />);
    expect(out).toContain('role="progressbar"');
    expect(out).toContain('aria-valuenow="1284"');
    expect(out).toContain('aria-valuemax="2000"');
    expect(out).toContain('aria-label="Proof cases"');
  });

  it('property: candlePercent is always within 0..100 and monotonic in value', () => {
    fc.assert(
      fc.property(
        fc.double({ noNaN: true }),
        fc.double({ noNaN: true }),
        fc.double({ min: 0.001, max: 1e9, noNaN: true }),
        (a, b, max) => {
          const pa = candlePercent(a, max);
          const pb = candlePercent(b, max);
          expect(pa).toBeGreaterThanOrEqual(0);
          expect(pa).toBeLessThanOrEqual(100);
          if (a <= b) expect(pa).toBeLessThanOrEqual(pb);
        },
      ),
    );
  });

  it('candlePercent handles a zero or negative max', () => {
    expect(candlePercent(5, 0)).toBe(0);
    expect(candlePercent(5, -1)).toBe(0);
  });
});

describe('CertificateFrame', () => {
  it('renders a titled certificate with a seal', () => {
    const out = html(<CertificateFrame title="Certificate of Rebirth">body</CertificateFrame>);
    expect(out).toContain('Certificate of Rebirth');
    expect(out).toContain('data-seal');
    expect(out).toContain('body');
  });
});

import { diffTables, type DbfField, type DbfRecord } from '@afterlife/dbf';
import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { DbfDiffView, DbfTable } from './index';

const html = (el: ReactElement) => renderToStaticMarkup(el);
const F: DbfField[] = [
  { name: 'CODE', type: 'C', length: 6, decimals: 0 },
  { name: 'QTY', type: 'N', length: 5, decimals: 0 },
  { name: 'PRICE', type: 'N', length: 8, decimals: 2 },
];
const r = (CODE: string, QTY: string, deleted = false): DbfRecord => ({
  deleted,
  values: { CODE, QTY, PRICE: '12.50' },
});
const many = Array.from({ length: 200 }, (_, i) => r(`M${String(i).padStart(3, '0')}`, String(i)));

describe('DbfTable', () => {
  const out = html(<DbfTable caption="MEDICINE.DBF" fields={F} records={many} />);

  it('is an ARIA grid that announces every row, even the ones not rendered', () => {
    expect(out).toContain('role="grid"');
    expect(out).toContain('aria-label="MEDICINE.DBF"');
    expect(out).toContain('aria-rowcount="201"'); // header + 200 records
    expect(out).toContain('aria-colcount="4"'); // # + 3 fields
  });

  it('shows each field name with its dBASE type', () => {
    for (const label of ['CODE', 'C(6)', 'QTY', 'N(5)', 'PRICE', 'N(8,2)'])
      expect(out).toContain(label);
  });

  it('is virtualised: renders far fewer rows than it has', () => {
    const rendered = (out.match(/role="row"/g) ?? []).length - 1;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(40);
  });

  it('marks deleted records the dBASE way', () => {
    const d = html(<DbfTable caption="T" fields={F} records={[r('A1', '1', true)]} />);
    expect(d).toContain('line-through');
    expect(d).toContain('deleted');
  });

  it('right-aligns numbers', () => {
    expect(out).toMatch(/class="[^"]*text-right[^"]*"[^>]*>12\.50</);
  });
});

describe('DbfDiffView', () => {
  const before = { fields: F, records: [r('A1', '240'), r('B1', '180'), r('C1', '5')] };
  const after = {
    fields: F,
    records: [r('A1', '236'), r('B1', '180'), r('C1', '5', true), r('D1', '9')],
  };
  const out = html(
    <DbfDiffView
      caption="MEDICINE.DBF"
      before={before}
      after={after}
      diff={diffTables(before, after)}
    />,
  );

  it('has a legend with the counts', () => {
    expect(out).toMatch(/Inserted<span>1<\/span>/);
    expect(out).toMatch(/Deleted<span>1<\/span>/);
    expect(out).toMatch(/Changed<span>1<\/span>/);
  });

  it('colours rows by kind: inserted teal, deleted red and struck through', () => {
    expect(out).toContain('data-kind="inserted"');
    expect(out).toContain('data-kind="deleted"');
    expect(out).toMatch(/data-kind="deleted"[^>]*class="[^"]*line-through/);
  });

  it('gives a changed cell an old -> new tooltip, linked for screen readers', () => {
    expect(out).toContain('role="tooltip"');
    expect(out).toContain('240 → 236');
    expect(out).toMatch(/aria-describedby="[^"]+"/);
  });

  it('says in text what each coloured row is, not only by colour', () => {
    // A trailing space keeps the label apart from the value: "inserted 5".
    expect(out).toMatch(/class="sr-only">inserted </);
    expect(out).toMatch(/class="sr-only">deleted </);
  });
});

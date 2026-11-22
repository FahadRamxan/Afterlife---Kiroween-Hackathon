// @spec undertaker#1.2 The recorded runs include the undertake step (Prompt 64): the real
// pipeline moved every record of each sample app's data files, none rejected.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

type Rec = {
  steps: {
    step: string;
    status: string;
    output: {
      written?: boolean;
      rejected?: unknown[];
      tables?: {
        file: string;
        read: number;
        deleted: number;
        migrated: number;
        rejected: number;
      }[];
      reconciliation?: { matches: boolean; lines: { table: string; total: string; ok: boolean }[] };
    } | null;
  }[];
};
const rec = (app: string) =>
  JSON.parse(
    readFileSync(resolve(__dirname, `../apps/worker/recorded/${app}.json`), 'utf8'),
  ) as Rec;

describe('the recorded undertake step', () => {
  it.each([
    ['shifa', ['MEDICINE.DBF', 'CUSTOMER.DBF', 'BILLS.DBF', 'BILLITEM.DBF']],
    ['iqra', ['STUDENT.DBF', 'PAYMENT.DBF', 'FEES.DBF']],
    ['barkat', ['PARTY.DBF', 'LEDGER.DBF']],
  ])('%s: every live record of its data files crossed', (app, files) => {
    const step = rec(app).steps.find((s) => s.step === 'undertake')!;
    expect(step.status).toBe('done');
    expect(step.output).toMatchObject({ written: true, rejected: [] });
    const tables = step.output!.tables!;
    expect(tables.map((t) => t.file).sort()).toEqual([...files].sort());
    for (const t of tables) {
      expect(t.migrated, t.file).toBe(t.read - t.deleted);
      expect(t.migrated, t.file).toBeGreaterThan(0);
    }
    // @spec undertaker#3.2 Prompt 65: what the real step wrote reconciles with the old data.
    const report = step.output!.reconciliation!;
    expect(report.matches).toBe(true);
    expect(report.lines.length).toBeGreaterThanOrEqual(files.length);
    for (const f of files)
      expect(report.lines.find((l) => l.table === f && l.total === 'records')!.ok, f).toBe(true);
  });
});

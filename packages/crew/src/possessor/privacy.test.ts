// Review 41-50: a real shop's customers are not sent to the model. Names, phones, addresses and
// CNICs are masked in what the Possessor shows the model (and so in the logged request too).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FakeEmulator, buildBundle } from '@afterlife/emulator';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm } from '../llm/runtime';
import { isPersonalField, redactor } from './privacy';
import { llmValueChooser, readSamples, valuePrompt, type ValueContext } from './values';

const DIST = resolve(__dirname, '../../../../samples/graveyard/dist/shifa');
const file = (n: string) => new Uint8Array(readFileSync(resolve(DIST, n)));

async function shifaSamples() {
  const emu = new FakeEmulator();
  await emu.boot(
    buildBundle({
      executable: 'SHIFA.EXE',
      files: {
        'SHIFA.EXE': file('SHIFA.EXE'),
        'MEDICINE.DBF': file('MEDICINE.DBF'),
        'CUSTOMER.DBF': file('CUSTOMER.DBF'),
      },
    }),
  );
  return readSamples(emu);
}

describe('isPersonalField', () => {
  it('a phone, address, CNIC or email is personal anywhere; a name only in a table of people', () => {
    expect(isPersonalField('CUSTOMER.DBF', 'NAME')).toBe(true);
    expect(isPersonalField('PARTY.DBF', 'NAME')).toBe(true);
    expect(isPersonalField('STUDENT.DBF', 'FATHER')).toBe(true);
    expect(isPersonalField('CUSTOMER.DBF', 'PHONE')).toBe(true);
    expect(isPersonalField('BILLS.DBF', 'MOBILE_NO')).toBe(true);
    expect(isPersonalField('PARTY.DBF', 'ADDRESS')).toBe(true);
    expect(isPersonalField('STAFF.DBF', 'CNIC')).toBe(true);
    // A medicine's name is the shop's stock, not a person.
    expect(isPersonalField('MEDICINE.DBF', 'NAME')).toBe(false);
    expect(isPersonalField('CUSTOMER.DBF', 'CUST_ID')).toBe(false);
    expect(isPersonalField('MEDICINE.DBF', 'PRICE')).toBe(false);
  });
});

describe('what the model is shown', () => {
  it("has none of Shifa's customer names or phones, in the data files or on the screen", async () => {
    const samples = await shifaSamples();
    const customers = samples.find((s) => s.file === 'CUSTOMER.DBF')!;
    const real = customers.personalValues ?? [];
    expect(real.length).toBeGreaterThan(5);
    const screen = [
      ' SHIFA MEDICAL STORE  v2.3          CUSTOMERS                          15/07/98',
      ...customers.records.map((r) => ` ${r.CUST_ID}  ${r.NAME!.padEnd(25)} ${r.PHONE}`),
    ];
    const ctx: ValueContext = {
      field: { label: 'Code', length: 6, row: 21, col: 7, kind: 'reverse' },
      title: 'CUSTOMERS',
      screen,
      samples,
      tried: [],
    };
    const prompt = valuePrompt(ctx);
    for (const v of real) expect(prompt, v).not.toContain(v);
    expect(prompt).toContain('[NAME]');
    expect(prompt).toContain('[PHONE]');
    // The shop's own data stays: medicine codes and names, and customer ids.
    expect(prompt).toContain('PAN500');
    expect(prompt).toContain('PANADOL 500MG STRIP');
    expect(prompt).toContain('C0001');
  });

  it('nor in the request the runtime logs', async () => {
    const samples = await shifaSamples();
    const real = samples.flatMap((s) => s.personalValues ?? []);
    const client = new FakeLlmClient([fakeToolUse('answer', { value: 'PAN500' })]);
    const log = new MemoryLlmCallLog();
    const llm = new CrewLlm({ client, log, projectId: 'p', budgetTokens: 1e6 });
    const screen = samples
      .find((s) => s.file === 'CUSTOMER.DBF')!
      .records.map((r) => `${r.NAME} ${r.PHONE}`);
    await llmValueChooser(llm).choose({
      field: { label: 'Code', length: 6, row: 21, col: 7, kind: 'reverse' },
      title: 'NEW BILL',
      screen,
      samples,
      tried: [],
    });
    const logged = JSON.stringify(log.calls);
    for (const v of real) expect(logged, v).not.toContain(v);
  });

  it('phone numbers and CNICs are masked even when no data file names them (invariant)', () => {
    const redact = redactor([]);
    fc.assert(
      fc.property(
        fc.stringMatching(/^03\d{2}-?\d{7}$/),
        fc.stringMatching(/^\d{5}-\d{7}-\d$/),
        fc.constantFrom('Call', 'Phone:', 'ID', ''),
        (phone, cnic, word) => {
          const out = redact(`${word} ${phone} and ${cnic}`);
          expect(out).not.toContain(phone);
          expect(out).not.toContain(cnic);
        },
      ),
    );
    // Amounts, dates and bill numbers are not phone numbers.
    expect(redact('TOTAL 6843815.55 on 15/07/98, bill 9807-0001')).toBe(
      'TOTAL 6843815.55 on 15/07/98, bill 9807-0001',
    );
  });
});

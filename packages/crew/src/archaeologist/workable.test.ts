// @spec learned-certificates#2.1 Rules an action cannot work out are rejected (Prompt 81).
import type { Rule, Soul } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { workableRules } from './workable';
const f = (name: string, type: 'C' | 'N' | 'D' = 'N') => ({ name, type, length: 10, decimals: 0 });
/** Barkat's learned Soul: a sale on credit types the party, the amount and a note. */
const BARKAT = {
  entities: [
    {
      id: 'ledger',
      name: 'Ledger',
      file: 'LEDGER.DBF',
      key: ['ENTRY'],
      fields: [
        f('ENTRY'),
        f('PARTY_ID', 'C'),
        f('TX_DATE', 'D'),
        f('KIND', 'C'),
        f('AMOUNT'),
        f('NOTE', 'C'),
        f('BALANCE'),
      ],
      foreignKeys: [
        { fields: ['PARTY_ID'], references: { entity: 'party', fields: ['PARTY_ID'] } },
      ],
      counters: [{ field: 'ENTRY', pattern: 'n' }],
    },
    {
      id: 'party',
      name: 'Party',
      file: 'PARTY.DBF',
      key: ['PARTY_ID'],
      fields: [f('PARTY_ID', 'C'), f('LIMIT'), f('BALANCE'), f('LAST_PAY', 'D')],
      foreignKeys: [],
      counters: [],
    },
  ],
  actions: [
    {
      id: 'sale-on-credit',
      name: 'Sale on credit',
      screen: 'fp_sale',
      keys: '{@PARTY_ID}{Enter}{@AMOUNT}{Enter}{@NOTE}{Enter}Y',
      effects: [
        {
          kind: 'insert',
          entity: 'ledger',
          fields: ['ENTRY', 'PARTY_ID', 'TX_DATE', 'KIND', 'AMOUNT', 'NOTE', 'BALANCE'],
        },
        { kind: 'update', entity: 'party', fields: ['BALANCE', 'LAST_PAY'] },
      ],
    },
  ],
} as unknown as Pick<Soul, 'entities' | 'actions'>;
const rule = (id: string, target: string, expression: string): Rule =>
  ({ id, kind: 'effect', target, en: '', ur: '', expression, evidence: [], confidence: 1 }) as Rule;
describe('workableRules', () => {
  it('rejects party.balance = ledger.balance: one unknown copied into another', () => {
    const r = workableRules(
      [
        rule('tx-date', 'ledger.tx_date', 'today'),
        rule('last-pay', 'party.last_pay', 'today'),
        rule('balance', 'party.balance', 'ledger.balance'),
      ],
      BARKAT,
    );
    expect(r.kept.map((x) => x.id)).toEqual(['tx-date', 'last-pay']);
    expect(r.rejected).toEqual([
      {
        rule: 'balance',
        reason:
          'Sale on credit cannot work out ledger.balance: it is not typed and no rule gives it',
      },
    ]);
  });
  it('keeps a rule that reads what is typed, what another rule gives, and the existing record', () => {
    const r = workableRules(
      [
        rule('ledger-balance', 'ledger.balance', 'party.balance + ledger.amount'),
        rule('party-balance', 'party.balance', 'ledger.balance'),
      ],
      BARKAT,
    );
    expect(r.kept.map((x) => x.id)).toEqual(['ledger-balance', 'party-balance']);
    expect(r.rejected).toEqual([]);
  });
  it('a rule left out takes the rules that needed it with it', () => {
    const r = workableRules(
      [
        rule('ledger-balance', 'ledger.balance', 'ledger.kind'),
        rule('party-balance', 'party.balance', 'ledger.balance'),
      ],
      BARKAT,
    );
    expect(r.kept).toEqual([]);
    expect(r.rejected.map((x) => x.rule)).toEqual(['ledger-balance', 'party-balance']);
  });
});

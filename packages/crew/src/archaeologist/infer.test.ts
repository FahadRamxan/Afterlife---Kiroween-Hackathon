import { describe, expect, it } from 'vitest';
import { FakeLlmClient, fakeToolUse } from '../llm/fake';
import { MemoryLlmCallLog } from '../llm/log';
import { CrewLlm } from '../llm/runtime';
import type { LlmRequest } from '../llm/types';
import { inferRules } from './infer';
import { shifaEntities, shifaRun } from './testing/graveyard-runs';

const ENTITIES = shifaEntities();
const RUNS = [shifaRun('bill-small'), shifaRun('bill-discount'), shifaRun('bill-5000')];

/** A fake model that proposes the given candidates per target, and rules that never fit otherwise. */
function model(proposals: Record<string, string[] | 'bad'>) {
  const client = new FakeLlmClient((req: LlmRequest) => {
    const target = /Effect: ([a-z_]+\.[a-z_]+)/.exec(JSON.stringify(req.messages))![1]!;
    const p = proposals[target] ?? ['1', '2', '3'];
    // 'bad': an answer that never passes the schema (two candidates).
    const exprs = p === 'bad' ? ['1', '2'] : p;
    return fakeToolUse('answer', {
      candidates: exprs.map((expression) => ({ expression, why: `the ${target} rule` })),
    });
  });
  return {
    client,
    llm: new CrewLlm({ client, log: new MemoryLlmCallLog(), projectId: 'p', budgetTokens: 1e7 }),
  };
}

describe('inferRules', () => {
  it('keeps, per value, the simplest candidate that explains every observation', async () => {
    const { llm } = model({
      'bill.gst': [
        'round((bill.subtotal - bill.discount) * 0.17, 2)',
        'trunc((bill.subtotal - bill.discount) * 0.17, 2)',
        'trunc(bill.subtotal * 0.17, 2)',
      ],
      'bill.discount': [
        'if bill.subtotal >= 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
        'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
        '0',
      ],
      'medicine.qty': ['medicine.qty - 1', 'medicine.qty - bill_item.qty', 'medicine.qty'],
    });
    const found: string[] = [];
    const logs: string[] = [];
    const r = await inferRules(llm, ENTITIES, RUNS, {
      found: (rule) => void found.push(rule.target!),
      log: (m) => void logs.push(m),
    });
    expect(r.rules.map((x) => [x.target, x.kind, x.expression])).toEqual([
      [
        'bill.discount',
        'compute',
        'if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0',
      ],
      ['bill.gst', 'compute', 'trunc((bill.subtotal - bill.discount) * 0.17, 2)'],
      ['medicine.qty', 'effect', 'medicine.qty - bill_item.qty'],
    ]);
    expect(found).toEqual(['bill.discount', 'bill.gst', 'medicine.qty']);
    expect(r.rules[1]).toMatchObject({ id: 'bill-gst', en: 'the bill.gst rule', ur: '' });
    expect(r.rules[1]!.evidence).toEqual(['bill-small', 'bill-discount', 'bill-5000']);
    // The other values (subtotal, total, the bill line's price and amount) had no fitting rule.
    expect(r.unexplained).toEqual(
      expect.arrayContaining([
        'bill.subtotal',
        'bill.total',
        'bill_item.amount',
        'bill_item.price',
      ]),
    );
    expect(logs.some((m) => m.startsWith('bill.gst = trunc'))).toBe(true);
  });

  it('a model answer that never fits the schema leaves that value unexplained', async () => {
    const { llm } = model({ 'bill.gst': 'bad' });
    const r = await inferRules(llm, ENTITIES, RUNS, { maxTargets: 3 });
    expect(r.targets).toBe(3);
    expect(r.unexplained).toContain('bill.gst');
    expect(r.rules).toEqual([]);
  });

  it('looks at no more than maxTargets values, and says so', async () => {
    const { llm, client } = model({});
    const logs: string[] = [];
    const r = await inferRules(llm, ENTITIES, RUNS, {
      maxTargets: 2,
      log: (m) => void logs.push(m),
    });
    expect(r.targets).toBe(2);
    expect(client.requests).toHaveLength(2);
    expect(logs[0]).toMatch(/values were written; rules for the first 2/);
  });

  it('a stopped run stops', async () => {
    const { llm } = model({});
    const ac = new AbortController();
    ac.abort(new Error('stopped'));
    await expect(inferRules(llm, ENTITIES, RUNS, { signal: ac.signal })).rejects.toThrow('stopped');
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { candidateLines, getRuleTargets, verifyRule } from './rule-check-client';

const answer = (status: number, body: unknown): typeof fetch =>
  (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;

const VERIFICATION = {
  projectId: 'p',
  target: 'bill.gst',
  effects: 3,
  observations: 3,
  checks: [
    {
      expression: 'round(x, 2)',
      nodes: 3,
      explained: 2,
      total: 3,
      misses: [{ observation: 'o', expected: '14.87', got: '14.88' }],
    },
  ],
  selected: null,
  alsoFit: [],
  probes: [{ target: 'bill.gst', field: 'bill.subtotal', values: ['5000', '5001'], text: 'Try' }],
};

describe('rule check client', () => {
  it('reads the targets and a verification', async () => {
    const t = await getRuleTargets(
      'http://api/',
      'p',
      answer(200, { observations: 2, targets: [] }),
    );
    expect(t).toEqual({ ok: true, value: { observations: 2, targets: [] } });
    const v = await verifyRule('http://api', 'p', 'bill.gst', ['1'], answer(200, VERIFICATION));
    expect(v.ok && v.value.checks[0]!.misses[0]!.got).toBe('14.88');
  });

  it('passes on the API’s message, and says when it does not answer', async () => {
    expect(
      await getRuleTargets('http://api', 'p', answer(503, { message: 'This API has no database' })),
    ).toEqual({ ok: false, message: 'This API has no database' });
    const down = (async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await verifyRule('http://api', 'p', 'bill.gst', ['1'], down)).toEqual({
      ok: false,
      message: 'The API did not answer',
    });
    expect(await getRuleTargets('http://api', 'p', answer(200, { nope: 1 }))).toMatchObject({
      ok: false,
    });
  });

  it('sends the target and candidates as JSON', async () => {
    let sent: RequestInit | undefined;
    const spy = (async (_url: string, init: RequestInit) => {
      sent = init;
      return new Response(JSON.stringify(VERIFICATION), { status: 200 });
    }) as unknown as typeof fetch;
    await verifyRule('http://api', 'p', 'bill.gst', ['a', 'b'], spy);
    expect(sent?.method).toBe('POST');
    expect(JSON.parse(String(sent?.body))).toEqual({ target: 'bill.gst', candidates: ['a', 'b'] });
  });
});

describe('candidateLines', () => {
  it('one per line, without blanks or repeats', () => {
    expect(candidateLines(' a \n\n b\r\na\n')).toEqual(['a', 'b']);
  });

  it('never more than 10, none blank, none repeated (invariant)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ maxLength: 8 }), { maxLength: 30 }), (lines) => {
        const out = candidateLines(lines.join('\n'));
        expect(out.length).toBeLessThanOrEqual(10);
        expect(new Set(out).size).toBe(out.length);
        for (const s of out) expect(s.trim()).toBe(s);
        for (const s of out) expect(s).not.toBe('');
      }),
    );
  });
});

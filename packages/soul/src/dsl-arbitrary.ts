// fast-check arbitraries for rule expression ASTs (Prompt 42): parse(print(ast)) == ast.
import fc from 'fast-check';
import type { Expr } from './dsl';

const KEYWORDS = new Set(['if', 'then', 'else', 'and', 'or', 'not', 'true', 'false']);
const name = fc.stringMatching(/^[a-z][a-z0-9_]{0,6}$/).filter((n) => !KEYWORDS.has(n));
const numText = fc.oneof(
  fc.nat({ max: 100_000 }).map(String),
  fc.tuple(fc.nat({ max: 9999 }), fc.stringMatching(/^[0-9]{1,3}$/)).map(([i, f]) => `${i}.${f}`),
);
const str = fc.string({ maxLength: 8 }).filter((s) => !s.includes('\n'));

const FNS = [
  'round',
  'trunc',
  'floor',
  'ceil',
  'min',
  'max',
  'abs',
  'addDays',
  'daysBetween',
  'weeksBetween',
  'year',
  'month',
  'day',
];
const AGG = ['sum', 'count', 'any', 'all'];
const BIN = ['+', '-', '*', '/', '%', '=', '!=', '<', '<=', '>', '>=', 'and', 'or'] as const;

export const exprArbitrary: fc.Arbitrary<Expr> = fc.letrec<{ e: Expr }>((tie) => ({
  e: fc.oneof(
    { depthSize: 'small', withCrossShrink: true },
    numText.map((value): Expr => ({ type: 'num', value })),
    str.map((value): Expr => ({ type: 'str', value })),
    fc.boolean().map((value): Expr => ({ type: 'bool', value })),
    fc.array(name, { minLength: 1, maxLength: 3 }).map((path): Expr => ({ type: 'ref', path })),
    fc
      .record({ op: fc.constantFrom('-' as const, 'not' as const), arg: tie('e') })
      .map((x): Expr => ({ type: 'unary', ...x })),
    fc
      .record({ op: fc.constantFrom(...BIN), left: tie('e'), right: tie('e') })
      .map((x): Expr => ({ type: 'binary', ...x })),
    fc
      .record({ cond: tie('e'), then: tie('e'), else: tie('e') })
      .map((x): Expr => ({ type: 'if', ...x })),
    fc
      .record({ fn: fc.constantFrom(...FNS), args: fc.array(tie('e'), { maxLength: 3 }) })
      .map((x): Expr => ({ type: 'call', ...x })),
    fc
      .record({ fn: fc.constantFrom(...AGG), list: tie('e'), param: name, body: tie('e') })
      .map(({ fn, list, param, body }): Expr => ({
        type: 'call',
        fn,
        args: [list, { type: 'lambda', param, body }],
      })),
  ),
})).e;

// Try a rule expression on some values (the Playground's rule tryout, Prompt 42). Values are JSON;
// a date is {"date": "YYYY-MM-DD"}. Never throws.
import { DslDate, DslError, D, dslDate, evaluate, parseExpr, type Env } from './dsl';

export type TryResult =
  | {
      ok: true;
      value: string;
      kind: 'number' | 'text' | 'true or false' | 'date' | 'list' | 'record';
    }
  | { ok: false; where: 'expression' | 'values' | 'evaluation'; message: string };

/** JSON with {"date": ...} objects turned into dates. */
function dates(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(dates);
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    if (keys.length === 1 && keys[0] === 'date' && typeof o.date === 'string')
      return dslDate(o.date);
    return Object.fromEntries(keys.map((k) => [k, dates(o[k])]));
  }
  return v;
}

export function tryRule(expression: string, valuesJson: string): TryResult {
  let ast;
  try {
    ast = parseExpr(expression);
  } catch (e) {
    return { ok: false, where: 'expression', message: (e as Error).message };
  }
  let env: Env;
  try {
    const raw = JSON.parse(valuesJson || '{}') as unknown;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return { ok: false, where: 'values', message: 'The values must be a JSON object' };
    env = dates(raw) as Env;
  } catch (e) {
    return { ok: false, where: 'values', message: (e as Error).message };
  }
  try {
    const v = evaluate(ast, env);
    if (v instanceof D) return { ok: true, value: v.toString(), kind: 'number' };
    if (typeof v === 'string') return { ok: true, value: v, kind: 'text' };
    if (typeof v === 'boolean') return { ok: true, value: String(v), kind: 'true or false' };
    if (v instanceof DslDate) return { ok: true, value: v.iso, kind: 'date' };
    return { ok: true, value: JSON.stringify(v), kind: Array.isArray(v) ? 'list' : 'record' };
  } catch (e) {
    if (e instanceof DslError) return { ok: false, where: 'evaluation', message: e.message };
    return { ok: false, where: 'evaluation', message: 'The rule could not be evaluated' };
  }
}

// The rule expression language (Prompt 42): small and safe. A hand-written Pratt parser, a printer
// that gives back what the parser reads, and an evaluator on decimal numbers (decimal.js): money
// never goes through a JS float. No eval, no Function, no network; names resolve only to what the
// caller passed in, never to prototypes or globals.
//
//   if bill.subtotal > 5000 then trunc(bill.subtotal * 0.10, 2) else 0
//   sum(items, x => x.qty * x.price)        medicine.expiry >= today
import DecimalBase from 'decimal.js';

/** Our own Decimal: 40 digits, half-up, so nothing changes decimal.js for anyone else. */
export const D = DecimalBase.clone({ precision: 40, rounding: DecimalBase.ROUND_HALF_UP });
type Dec = InstanceType<typeof D>;

export type Expr =
  | { type: 'num'; value: string }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ref'; path: string[] }
  | { type: 'unary'; op: '-' | 'not'; arg: Expr }
  | { type: 'binary'; op: BinaryOp; left: Expr; right: Expr }
  | { type: 'if'; cond: Expr; then: Expr; else: Expr }
  | { type: 'call'; fn: string; args: Expr[] }
  | { type: 'lambda'; param: string; body: Expr };

export type BinaryOp =
  '+' | '-' | '*' | '/' | '%' | '=' | '!=' | '<' | '<=' | '>' | '>=' | 'and' | 'or';

export class DslError extends Error {
  override name = 'DslError';
}

export const MAX_SOURCE = 2000;
const MAX_DEPTH = 64;
const MAX_STEPS = 100_000;
const KEYWORDS = new Set(['if', 'then', 'else', 'and', 'or', 'not', 'true', 'false']);
const AGGREGATES = new Set(['sum', 'count', 'any', 'all']);
const FORBIDDEN = new Set(['__proto__', 'prototype', 'constructor']);

// ---- Tokens

type Tok = { kind: 'num' | 'str' | 'name' | 'op' | 'end'; text: string; at: number };

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const fail = (msg: string, at: number): never => {
    throw new DslError(`${msg} at column ${at + 1}`);
  };
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    const at = i;
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      out.push({ kind: 'num', text: m[0], at });
      i += m[0].length;
    } else if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ kind: 'name', text: m[0], at });
      i += m[0].length;
    } else if (c === "'") {
      let s = '';
      i++;
      for (;;) {
        if (i >= src.length) fail('A string is not closed', at);
        const ch = src[i]!;
        if (ch === '\\' && i + 1 < src.length) {
          s += src[i + 1];
          i += 2;
        } else if (ch === "'") {
          i++;
          break;
        } else {
          s += ch;
          i++;
        }
      }
      out.push({ kind: 'str', text: s, at });
    } else {
      const two = src.slice(i, i + 2);
      if (['<=', '>=', '!=', '=>'].includes(two)) {
        out.push({ kind: 'op', text: two, at });
        i += 2;
      } else if ('+-*/%()=<>,.'.includes(c)) {
        out.push({ kind: 'op', text: c, at });
        i++;
      } else fail(`Unexpected ${JSON.stringify(c)}`, at);
    }
  }
  out.push({ kind: 'end', text: '', at: src.length });
  return out;
}

// ---- Parser (precedence climbing). Higher binds tighter.

const PREC: Record<BinaryOp, number> = {
  or: 1,
  and: 2,
  '=': 4,
  '!=': 4,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};
const NOT = 3;
const NEG = 7;

export function parseExpr(src: string): Expr {
  if (src.length > MAX_SOURCE)
    throw new DslError(`The expression is too long (over ${MAX_SOURCE} characters)`);
  const toks = tokenize(src);
  let p = 0;
  let depth = 0;
  let lambdaOk = false;
  const peek = () => toks[p]!;
  const fail = (msg: string, t = peek()): never => {
    throw new DslError(`${msg} at column ${t.at + 1}`);
  };
  const isOp = (text: string) => peek().kind === 'op' && peek().text === text;
  const isWord = (text: string) => peek().kind === 'name' && peek().text === text;
  const expectOp = (text: string) => {
    if (!isOp(text)) fail(`Expected "${text}"`);
    p++;
  };
  const expectWord = (text: string) => {
    if (!isWord(text)) fail(`Expected "${text}"`);
    p++;
  };
  const binOp = (): BinaryOp | null => {
    const t = peek();
    if (t.kind === 'op' && t.text in PREC && t.text !== '=>') return t.text as BinaryOp;
    if (t.kind === 'name' && (t.text === 'and' || t.text === 'or')) return t.text;
    return null;
  };

  function expr(min: number): Expr {
    if (++depth > MAX_DEPTH) fail('The expression is too deep');
    try {
      let left = prefix(min);
      for (;;) {
        const op = binOp();
        if (!op || PREC[op] < min) break;
        const prec = PREC[op];
        p++;
        // Comparisons do not chain: "a < b < c" is refused.
        const right = expr(prec + 1);
        left = { type: 'binary', op, left, right };
        if (prec === 4 && binOp() && PREC[binOp()!] === 4)
          fail('Comparisons do not chain: add brackets');
      }
      return left;
    } finally {
      depth--;
    }
  }

  function prefix(min: number): Expr {
    if (isWord('if')) {
      if (min > 0) {
        // An if inside an operator needs brackets; parse it anyway at the lowest level.
      }
      p++;
      const cond = expr(0);
      expectWord('then');
      const then = expr(0);
      expectWord('else');
      return { type: 'if', cond, then, else: expr(0) };
    }
    if (isWord('not')) {
      p++;
      return { type: 'unary', op: 'not', arg: expr(NOT) };
    }
    if (isOp('-')) {
      p++;
      return { type: 'unary', op: '-', arg: expr(NEG) };
    }
    return primary();
  }

  function primary(): Expr {
    const t = peek();
    if (t.kind === 'num') {
      p++;
      return { type: 'num', value: t.text };
    }
    if (t.kind === 'str') {
      p++;
      return { type: 'str', value: t.text };
    }
    if (isOp('(')) {
      p++;
      const e = expr(0);
      expectOp(')');
      return e;
    }
    if (t.kind === 'name') {
      if (t.text === 'true' || t.text === 'false') {
        p++;
        return { type: 'bool', value: t.text === 'true' };
      }
      if (KEYWORDS.has(t.text)) fail(`"${t.text}" cannot start a value`);
      p++;
      if (isOp('=>')) {
        if (!lambdaOk) fail('"x => ..." works only inside sum, count, any or all', t);
        p++;
        lambdaOk = false;
        return { type: 'lambda', param: t.text, body: expr(0) };
      }
      if (isOp('(')) {
        p++;
        const args: Expr[] = [];
        const agg = AGGREGATES.has(t.text);
        if (!isOp(')'))
          for (;;) {
            lambdaOk = agg && args.length === 1;
            args.push(expr(0));
            lambdaOk = false;
            if (isOp(',')) p++;
            else break;
          }
        expectOp(')');
        return { type: 'call', fn: t.text, args };
      }
      const path = [t.text];
      while (isOp('.')) {
        p++;
        const n = peek();
        if (n.kind !== 'name' || KEYWORDS.has(n.text)) fail('Expected a field name after "."');
        path.push(n.text);
        p++;
      }
      return { type: 'ref', path };
    }
    if (t.kind === 'end') fail('The expression ends too early');
    return fail(`Unexpected "${t.text}"`);
  }

  const e = expr(0);
  if (peek().kind !== 'end') fail(`Unexpected "${peek().text}"`);
  return e;
}

// ---- Printer: the shortest text the parser reads back as the same AST.

function precOf(e: Expr): number {
  if (e.type === 'binary') return PREC[e.op];
  if (e.type === 'unary') return e.op === 'not' ? NOT : NEG;
  if (e.type === 'if') return 0;
  return 9;
}

export function printExpr(e: Expr): string {
  const wrap = (x: Expr, needParens: boolean) => (needParens ? `(${printExpr(x)})` : printExpr(x));
  switch (e.type) {
    case 'num':
      return e.value;
    case 'str':
      return `'${e.value.replace(/[\\']/g, (c) => `\\${c}`)}'`;
    case 'bool':
      return String(e.value);
    case 'ref':
      return e.path.join('.');
    case 'lambda':
      return `${e.param} => ${printExpr(e.body)}`;
    case 'call':
      return `${e.fn}(${e.args.map(printExpr).join(', ')})`;
    case 'if':
      return `if ${printExpr(e.cond)} then ${printExpr(e.then)} else ${printExpr(e.else)}`;
    case 'unary':
      return e.op === 'not'
        ? `not ${wrap(e.arg, precOf(e.arg) < NOT)}`
        : `-${wrap(e.arg, precOf(e.arg) < NEG)}`;
    case 'binary': {
      const prec = PREC[e.op];
      const cmp = prec === 4;
      const l = wrap(e.left, cmp ? precOf(e.left) <= prec : precOf(e.left) < prec);
      const r = wrap(e.right, precOf(e.right) <= prec);
      return `${l} ${e.op} ${r}`;
    }
  }
}

// ---- Values

/** A date (no time): what a DBF D field holds. */
export class DslDate {
  constructor(readonly iso: string) {}
  get days(): number {
    return (
      Date.UTC(+this.iso.slice(0, 4), +this.iso.slice(5, 7) - 1, +this.iso.slice(8, 10)) /
      86_400_000
    );
  }
  toJSON() {
    return { date: this.iso };
  }
}

/** A date from `YYYY-MM-DD` or a DBF's `YYYYMMDD`. */
export function dslDate(s: string): DslDate {
  const m = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
  const iso = m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (!m || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso)
    throw new DslError(`Not a date: ${s}`);
  return new DslDate(iso);
}

type Val = Dec | string | boolean | DslDate | Val[] | { [k: string]: unknown };
/**
 * What an expression is evaluated against: plain data. Numbers may be strings ("6000.00"), but
 * digits with a leading zero ("0012", "03001234567") stay text: they are codes and phone numbers,
 * and "0012" is not the code "12".
 */
export type Env = Record<string, unknown>;

const isDec = (v: unknown): v is Dec => v instanceof D;
const NUMERIC = /^-?(0|[1-9]\d*)(\.\d+)?$/;

/** A value from the caller, in our types: numbers (and number-like strings) become decimals. */
function lift(v: unknown): Val {
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new DslError('Not a finite number');
    return new D(String(v));
  }
  if (typeof v === 'string') return NUMERIC.test(v) ? new D(v) : v;
  if (typeof v === 'boolean' || v instanceof DslDate) return v;
  if (v instanceof DecimalBase) return new D(v.toString());
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  throw new DslError('A value is missing (null or undefined)');
}

const kind = (v: Val) =>
  isDec(v)
    ? 'a number'
    : typeof v === 'string'
      ? 'text'
      : typeof v === 'boolean'
        ? 'true or false'
        : v instanceof DslDate
          ? 'a date'
          : Array.isArray(v)
            ? 'a list'
            : 'a record';

function asNum(v: Val, what: string): Dec {
  if (!isDec(v)) throw new DslError(`${what} needs a number, not ${kind(v)}`);
  return v;
}
function asBool(v: Val, what: string): boolean {
  if (typeof v !== 'boolean') throw new DslError(`${what} needs true or false, not ${kind(v)}`);
  return v;
}
function asDate(v: Val, what: string): DslDate {
  if (!(v instanceof DslDate)) throw new DslError(`${what} needs a date, not ${kind(v)}`);
  return v;
}
function asList(v: Val, what: string): unknown[] {
  if (!Array.isArray(v)) throw new DslError(`${what} needs a list, not ${kind(v)}`);
  return v;
}

function field(obj: Val, key: string, path: string): Val {
  if (
    FORBIDDEN.has(key) ||
    !obj ||
    typeof obj !== 'object' ||
    Array.isArray(obj) ||
    isDec(obj) ||
    obj instanceof DslDate ||
    !Object.hasOwn(obj, key)
  )
    throw new DslError(`${path} has no field ${key}`);
  return lift((obj as Record<string, unknown>)[key]);
}

function compare(a: Val, b: Val): number {
  if (isDec(a) && isDec(b)) return a.cmp(b);
  if (typeof a === 'string' && typeof b === 'string') return a < b ? -1 : a > b ? 1 : 0;
  if (a instanceof DslDate && b instanceof DslDate)
    return a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0;
  if (typeof a === 'boolean' && typeof b === 'boolean') return a === b ? 0 : a ? 1 : -1;
  throw new DslError(`Cannot compare ${kind(a)} with ${kind(b)}`);
}

const places = (args: Val[], fn: string) => {
  const n = args[1] === undefined ? new D(0) : asNum(args[1], fn);
  if (!n.isInteger() || n.lt(0) || n.gt(20)) throw new DslError(`${fn} takes 0 to 20 places`);
  return n.toNumber();
};

/** Evaluates an expression against `env`. Same input, same answer, every time. */
export function evaluate(e: Expr, env: Env): Val {
  let steps = 0;
  const scopes: Record<string, Val>[] = [];

  const run = (x: Expr): Val => {
    if (++steps > MAX_STEPS)
      throw new DslError('The rule takes too much work (over 100,000 steps)');
    switch (x.type) {
      case 'num':
        return new D(x.value);
      case 'str':
        return x.value;
      case 'bool':
        return x.value;
      case 'ref': {
        const [head, ...rest] = x.path;
        let v: Val | undefined;
        for (let i = scopes.length - 1; i >= 0 && v === undefined; i--)
          if (Object.hasOwn(scopes[i]!, head!)) v = scopes[i]![head!];
        if (v === undefined) {
          if (FORBIDDEN.has(head!) || !Object.hasOwn(env, head!))
            throw new DslError(`Nothing is called ${head}`);
          v = lift(env[head!]);
        }
        let path = head!;
        for (const k of rest) {
          v = field(v, k, path);
          path += `.${k}`;
        }
        return v;
      }
      case 'unary': {
        const v = run(x.arg);
        return x.op === 'not' ? !asBool(v, 'not') : asNum(v, '-').neg();
      }
      case 'if':
        return asBool(run(x.cond), 'if') ? run(x.then) : run(x.else);
      case 'lambda':
        throw new DslError('"x => ..." works only inside sum, count, any or all');
      case 'binary': {
        if (x.op === 'and') return asBool(run(x.left), 'and') && asBool(run(x.right), 'and');
        if (x.op === 'or') return asBool(run(x.left), 'or') || asBool(run(x.right), 'or');
        const a = run(x.left);
        const b = run(x.right);
        switch (x.op) {
          case '+':
            if (typeof a === 'string' && typeof b === 'string') return a + b;
            return asNum(a, '+').plus(asNum(b, '+'));
          case '-':
            return asNum(a, '-').minus(asNum(b, '-'));
          case '*':
            return asNum(a, '*').times(asNum(b, '*'));
          case '/':
          case '%': {
            const d = asNum(b, x.op);
            if (d.isZero()) throw new DslError('Division by zero');
            return x.op === '/' ? asNum(a, '/').div(d) : asNum(a, '%').mod(d);
          }
          case '=':
            return compare(a, b) === 0;
          case '!=':
            return compare(a, b) !== 0;
          case '<':
            return compare(a, b) < 0;
          case '<=':
            return compare(a, b) <= 0;
          case '>':
            return compare(a, b) > 0;
          case '>=':
            return compare(a, b) >= 0;
        }
      }
    }
    return call(x);
  };

  const call = (x: Extract<Expr, { type: 'call' }>): Val => {
    const arity = (min: number, max = min) => {
      if (x.args.length < min || x.args.length > max)
        throw new DslError(
          `${x.fn} takes ${min === max ? min : `${min} to ${max}`} values, not ${x.args.length}`,
        );
    };
    if (AGGREGATES.has(x.fn)) {
      arity(x.fn === 'count' ? 1 : 2, 2);
      const list = asList(run(x.args[0]!), x.fn);
      const lam = x.args[1];
      if (lam && lam.type !== 'lambda')
        throw new DslError(`${x.fn} needs "x => ..." as its second value`);
      const each = (item: unknown): Val => {
        if (!lam) return true;
        scopes.push({ [lam.param]: lift(item) });
        try {
          return run(lam.body);
        } finally {
          scopes.pop();
        }
      };
      if (x.fn === 'sum')
        return list.reduce<Dec>((s, it) => s.plus(asNum(each(it), 'sum')), new D(0));
      if (x.fn === 'count') return new D(list.filter((it) => asBool(each(it), 'count')).length);
      if (x.fn === 'any') return list.some((it) => asBool(each(it), 'any'));
      return list.every((it) => asBool(each(it), 'all'));
    }
    const args = x.args.map(run);
    const rounding = (mode: DecimalBase.Rounding) => {
      arity(1, 2);
      return asNum(args[0]!, x.fn).toDecimalPlaces(places(args, x.fn), mode);
    };
    switch (x.fn) {
      case 'round':
        return rounding(D.ROUND_HALF_UP);
      case 'trunc':
        return rounding(D.ROUND_DOWN);
      case 'floor':
        return rounding(D.ROUND_FLOOR);
      case 'ceil':
        return rounding(D.ROUND_CEIL);
      case 'abs':
        arity(1);
        return asNum(args[0]!, 'abs').abs();
      case 'min':
      case 'max': {
        if (args.length === 0) throw new DslError(`${x.fn} needs at least one value`);
        const ns = args.map((a) => asNum(a, x.fn));
        return ns.reduce((m, n) => ((x.fn === 'min' ? n.lt(m) : n.gt(m)) ? n : m));
      }
      case 'addDays': {
        arity(2);
        const d = asDate(args[0]!, 'addDays');
        const n = asNum(args[1]!, 'addDays');
        if (!n.isInteger()) throw new DslError('addDays takes a whole number of days');
        // Past the year 9999 (or before year 0) is no date a DBF can hold, and JS Date fails.
        const ms = (d.days + n.toNumber()) * 86_400_000;
        const iso = Math.abs(ms) <= 8.64e15 ? new Date(ms).toISOString().slice(0, 10) : '';
        if (!/^\d{4}-\d{2}-\d{2}$/.test(iso))
          throw new DslError('addDays goes past the years 0 to 9999');
        return new DslDate(iso);
      }
      case 'daysBetween':
      case 'weeksBetween': {
        arity(2);
        const days = asDate(args[1]!, x.fn).days - asDate(args[0]!, x.fn).days;
        return x.fn === 'daysBetween'
          ? new D(days)
          : new D(days).div(7).toDecimalPlaces(0, D.ROUND_DOWN);
      }
    }
    throw new DslError(`No function ${x.fn}`);
  };

  return run(e);
}

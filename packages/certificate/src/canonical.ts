// RFC 8785 JSON Canonicalization Scheme (JCS), for signing (Prompt 71). The same value always gives
// the same bytes: object members sorted by their names' UTF-16 code units, no whitespace, strings
// escaped as ECMAScript's JSON.stringify does (which is what RFC 8785 specifies), numbers in their
// shortest ECMAScript form. What JSON cannot hold exactly (NaN, Infinity, undefined, functions,
// a lone surrogate in a string) is refused rather than written in some other way.

export class CanonicalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanonicalError';
  }
}

const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;

function str(s: string, at: string): string {
  if (LONE_SURROGATE.test(s))
    throw new CanonicalError(`${at}: a lone surrogate is not valid JSON text`);
  return JSON.stringify(s);
}

/** Compares by UTF-16 code units, as RFC 8785 sorts member names. */
const byCodeUnits = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function write(v: unknown, at: string): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'boolean':
      return v ? 'true' : 'false';
    case 'number':
      if (!Number.isFinite(v)) throw new CanonicalError(`${at}: ${v} is not a JSON number`);
      // ECMAScript's Number to string is RFC 8785's number form; -0 is written 0.
      return JSON.stringify(v);
    case 'string':
      return str(v, at);
    case 'object': {
      if (Array.isArray(v)) return `[${v.map((x, i) => write(x, `${at}[${i}]`)).join(',')}]`;
      const proto = Object.getPrototypeOf(v);
      if (proto !== Object.prototype && proto !== null)
        throw new CanonicalError(`${at}: only plain objects can be signed`);
      const entries = Object.entries(v as Record<string, unknown>);
      for (const [k, x] of entries)
        if (x === undefined) throw new CanonicalError(`${at}.${k}: undefined is not JSON`);
      return `{${entries
        .sort(([a], [b]) => byCodeUnits(a, b))
        .map(([k, x]) => `${str(k, at)}:${write(x, `${at}.${k}`)}`)
        .join(',')}}`;
    }
    default:
      throw new CanonicalError(`${at}: a ${typeof v} is not JSON`);
  }
}

/** The RFC 8785 canonical JSON text of `value`. */
export function canonicalize(value: unknown): string {
  return write(value, '$');
}

/** The canonical UTF-8 bytes: what is signed. */
export function canonicalBytes(value: unknown): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}

// An action's key macro (the Soul's `actions[].keys`): the keys the old app takes for the action,
// from its own screen, with placeholders for what the owner types. The Archaeologist writes it from
// the observations (inferActions); the Oracle and the probes fill it in to drive the old app.
//
//   {@CUST_ID}            the value of a field of the record the action writes (the bill)
//   {lines} ... {/lines}  the keys for each line, once per line
//   {#CODE}               inside {lines}: the value of a field of that line
//
// Everything else is the key language of @afterlife/emulator ("{Enter}", "{F2}", text).
// Shifa's bill: {@CUST_ID}{Enter}{lines}{#CODE}{Enter}{#QTY}{Enter}{/lines}{Enter}{F2}

export class MacroError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MacroError';
  }
}

type Part =
  | { kind: 'keys'; text: string }
  | { kind: 'field'; field: string }
  | { kind: 'line'; field: string }
  | { kind: 'lines'; parts: Part[] };

const TOKEN = /\{(@|#)([A-Z_][A-Z0-9_]{0,9})\}|\{(\/?)lines\}/g;

function parse(macro: string): Part[] {
  const root: Part[] = [];
  let into: Part[] = root;
  let open: Part[] | null = null;
  let at = 0;
  for (const m of macro.matchAll(TOKEN)) {
    if (m.index! > at) into.push({ kind: 'keys', text: macro.slice(at, m.index) });
    at = m.index! + m[0].length;
    if (m[1] === '@') {
      into.push({ kind: 'field', field: m[2]! });
    } else if (m[1] === '#') {
      if (!open) throw new MacroError(`{#${m[2]}} is only allowed inside {lines}`);
      into.push({ kind: 'line', field: m[2]! });
    } else if (m[3] === '') {
      if (open) throw new MacroError('{lines} cannot be inside {lines}');
      open = [];
      root.push({ kind: 'lines', parts: open });
      into = open;
    } else {
      if (!open) throw new MacroError('{/lines} without {lines}');
      open = null;
      into = root;
    }
  }
  if (open) throw new MacroError('{lines} is not closed');
  if (at < macro.length) into.push({ kind: 'keys', text: macro.slice(at) });
  return root;
}

/** The fields a macro asks for: of the record, and of each line. Checks the macro. */
export function macroFields(macro: string): { record: string[]; line: string[] } {
  const record: string[] = [];
  const line: string[] = [];
  const walk = (parts: Part[]) => {
    for (const p of parts)
      if (p.kind === 'field' && !record.includes(p.field)) record.push(p.field);
      else if (p.kind === 'line' && !line.includes(p.field)) line.push(p.field);
      else if (p.kind === 'lines') walk(p.parts);
  };
  walk(parse(macro));
  return { record, line };
}

/** A typed value in the key language: braces typed as braces. */
export const keyText = (v: string) => v.replace(/[{}]/g, (b) => `{${b}}`);

/** The keys for one action: the macro with the values filled in (a missing value is typed blank). */
export function expandMacro(
  macro: string,
  inputs: { values?: Record<string, string>; lines?: Record<string, string>[] },
): string {
  const out = (parts: Part[], line?: Record<string, string>): string =>
    parts
      .map((p) => {
        if (p.kind === 'keys') return p.text;
        if (p.kind === 'field') return keyText(inputs.values?.[p.field] ?? '');
        if (p.kind === 'line') return keyText(line?.[p.field] ?? '');
        return (inputs.lines ?? []).map((l) => out(p.parts, l)).join('');
      })
      .join('');
  return out(parse(macro));
}

/** True when the macro has placeholders (an old reference Soul may hold plain keys). */
export const isMacro = (keys: string) => /\{[@#][A-Z_]|\{\/?lines\}/.test(keys);

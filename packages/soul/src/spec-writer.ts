// The Soul as a Kiro spec (Prompt 43): requirements.md (user stories and EARS acceptance criteria
// from the rules), design.md (entities, screens, actions, the rule table with evidence),
// tasks.md, and .kiro/steering/legacy-behaviour.md for developers who carry on in Kiro.
// Deterministic: the same Soul always gives the same files.
import { parseExpr, printExpr, type Expr } from './dsl';
import type { Rule, Soul } from './ir';

export type SpecFiles = Record<string, string>;

const words = (path: string[]) => path.map((p) => p.replace(/_/g, ' ')).join(' ');
const code = (e: Expr) => `\`${printExpr(e)}\``;

/** A value inside a condition: a field reads as words, anything else as code. */
function operand(e: Expr): string {
  if (e.type === 'ref')
    return e.path.length === 1 && e.path[0] === 'today' ? 'today' : `the ${words(e.path)}`;
  if (e.type === 'num') return e.value;
  if (e.type === 'str') return `"${e.value}"`;
  if (e.type === 'bool') return String(e.value);
  return code(e);
}

const SAY: Record<string, [string, string]> = {
  // op: [as written, negated]
  '>': ['is over', 'is at most'],
  '>=': ['is at least', 'is under'],
  '<': ['is under', 'is at least'],
  '<=': ['is at most', 'is over'],
  '=': ['is', 'is not'],
  '!=': ['is not', 'is'],
};
const DATE_SAY: Record<string, [string, string]> = {
  '>': ['is after', 'is on or before'],
  '>=': ['is on or after', 'is before'],
  '<': ['is before', 'is on or after'],
  '<=': ['is on or before', 'is after'],
};
const looksLikeDate = (e: Expr) =>
  (e.type === 'ref' && /(date|expiry|today|due)/.test(e.path.join('.'))) ||
  (e.type === 'call' && e.fn === 'addDays');

/** A condition in plain English (or its opposite, with `negate`). */
export function describeCondition(e: Expr, negate = false): string {
  if (e.type === 'unary' && e.op === 'not') return describeCondition(e.arg, !negate);
  if (e.type === 'binary' && (e.op === 'and' || e.op === 'or')) {
    // De Morgan: not (a and b) is (not a) or (not b).
    const op = (e.op === 'and') !== negate ? 'and' : 'or';
    return `${describeCondition(e.left, negate)} ${op} ${describeCondition(e.right, negate)}`;
  }
  if (e.type === 'binary' && e.op in SAY) {
    const table =
      DATE_SAY[e.op] && (looksLikeDate(e.left) || looksLikeDate(e.right)) ? DATE_SAY : SAY;
    return `${operand(e.left)} ${table[e.op]![negate ? 1 : 0]} ${operand(e.right)}`;
  }
  if (e.type === 'bool') return String(e.value !== negate);
  return `${code(e)} is ${negate ? 'false' : 'true'}`;
}

const targetWords = (target: string) => `the ${target.replace(/[._]/g, ' ')}`;

/** The EARS acceptance criteria a rule gives. */
export function earsFor(rule: Rule, soul: Soul): string[] {
  const e = parseExpr(rule.expression);
  const target = rule.target ? targetWords(rule.target) : 'the value';
  switch (rule.kind) {
    case 'compute': {
      if (e.type !== 'if') return [`THE SYSTEM SHALL set ${target} to ${code(e)}.`];
      const out: string[] = [];
      const seen: Expr[] = [];
      let x: Expr = e;
      while (x.type === 'if') {
        const when = [
          ...seen.map((c) => describeCondition(c, true)),
          describeCondition(x.cond),
        ].join(' and ');
        out.push(`WHEN ${when} THE SYSTEM SHALL set ${target} to ${code(x.then)}.`);
        seen.push(x.cond);
        x = x.else;
      }
      out.push(
        `WHEN ${seen.map((c) => describeCondition(c, true)).join(' and ')} THE SYSTEM SHALL set ${target} to ${code(x)}.`,
      );
      return out;
    }
    case 'validate':
      return [
        `IF ${describeCondition(e, true)} THEN THE SYSTEM SHALL refuse the entry and leave the data unchanged.`,
      ];
    case 'effect': {
      const entity = rule.target?.split('.')[0]?.replace(/_/g, '-');
      const action = soul.actions.find((a) => a.effects.some((f) => f.entity === entity));
      const when = action ? `"${action.name}" is done` : 'the change is saved';
      return [`WHEN ${when} THE SYSTEM SHALL set ${target} to ${code(e)}.`];
    }
    case 'counter':
      return [`THE SYSTEM SHALL give ${target} the next value of ${code(e)}.`];
  }
}

const cell = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
const evidence = (r: Rule) =>
  r.evidence.length ? r.evidence.map((x) => `\`${x}\``).join(', ') : 'none yet';
const pct = (c: number) => `${Math.round(c * 100)}%`;

function requirements(soul: Soul): string {
  const lines = [
    '# Requirements',
    '',
    `The reborn ${soul.app.name} must behave exactly as the old one. Each requirement below is one rule the old app follows, from Soul version ${soul.version}.`,
    '',
  ];
  soul.rules.forEach((r, i) => {
    const n = i + 1;
    lines.push(
      `### Requirement ${n}: \`${r.id}\``,
      '',
      `**User story:** As the owner of ${soul.app.name}, I want the reborn app to keep this rule of the old one, so that my records come out the same.`,
      '',
      `**Rule:** ${r.en}`,
      ...(r.ur ? ['', `**اصول:** ${r.ur}`] : []),
      '',
      `**Evidence:** ${evidence(r)}. **Confidence:** ${pct(r.confidence)}.`,
      '',
      '#### Acceptance criteria',
      '',
      ...earsFor(r, soul).map((s, j) => `${n}.${j + 1}. ${s}`),
      '',
    );
  });
  if (!soul.rules.length) lines.push('No rules have been found yet.', '');
  return lines.join('\n');
}

function design(soul: Soul): string {
  const out = [
    '# Design',
    '',
    '## Overview',
    '',
    `${soul.app.name} is rebuilt from its Soul (version ${soul.version}, by ${soul.provenance.createdBy}, from ${soul.provenance.observationCount} observations). The rules are expressions in the Soul's rule language; they run with decimal arithmetic, never floating point.`,
    '',
    '## Entities',
    '',
  ];
  for (const e of soul.entities) {
    out.push(
      `### ${e.name} (\`${e.file}\`)`,
      '',
      '| Field | Type | Width | Decimals |',
      '| --- | --- | --- | --- |',
    );
    for (const f of e.fields) out.push(`| ${f.name} | ${f.type} | ${f.length} | ${f.decimals} |`);
    out.push('');
    if (e.key.length) out.push(`- Key: ${e.key.join(', ')}`);
    for (const fk of e.foreignKeys)
      out.push(
        `- ${fk.fields.join(', ')} refers to ${fk.references.entity} (${fk.references.fields.join(', ')})`,
      );
    for (const c of e.counters) out.push(`- ${c.field} is numbered by the app: \`${c.pattern}\``);
    out.push('');
  }
  out.push('## Screens', '');
  for (const s of soul.screens) {
    out.push(`### ${s.title || '(untitled)'} (\`${s.id}\`)`, '');
    for (const f of s.fields)
      out.push(
        `- ${f.label}: row ${f.row}, column ${f.col}, ${f.width} wide${f.binds ? `, ${f.binds.entity}.${f.binds.field}` : ''}`,
      );
    for (const n of s.navigation) {
      const to = soul.screens.find((x) => x.id === n.to);
      out.push(`- \`${n.keys}\` goes to ${to?.title || n.to}`);
    }
    out.push('');
  }
  out.push('## Actions', '');
  for (const a of soul.actions) {
    const effects = a.effects.map((f) => `${f.kind}s ${f.entity}`).join(', ');
    out.push(
      `- **${a.name}** (\`${a.keys}\` on ${soul.screens.find((s) => s.id === a.screen)?.title ?? a.screen}): ${effects}`,
    );
  }
  out.push(
    '',
    '## Rules',
    '',
    '| Id | Kind | Target | Expression | Confidence | Evidence |',
    '| --- | --- | --- | --- | --- | --- |',
    ...soul.rules.map(
      (r) =>
        `| \`${r.id}\` | ${r.kind} | ${r.target ?? ''} | \`${cell(r.expression)}\` | ${pct(r.confidence)} | ${evidence(r)} |`,
    ),
    '',
  );
  return out.join('\n');
}

function tasks(soul: Soul): string {
  const out: string[] = [];
  let n = 0;
  const reqOf = (id: string) => soul.rules.findIndex((r) => r.id === id) + 1;
  for (const e of soul.entities) {
    n++;
    out.push(
      `- [ ] ${n}. Model ${e.name} (${e.fields.length} fields from \`${e.file}\`) and load its old records`,
    );
  }
  for (const r of soul.rules) {
    n++;
    const k = reqOf(r.id);
    const crit = earsFor(r, soul)
      .map((_, j) => `${k}.${j + 1}`)
      .join(', ');
    out.push(
      `- [ ] ${n}. Implement \`${r.id}\``,
      `  - Write a property test that the new code and \`${cell(r.expression)}\` agree on generated inputs`,
      `  - _Requirements: ${crit}_`,
    );
  }
  for (const s of soul.screens) {
    n++;
    out.push(`- [ ] ${n}. Build the ${s.title || s.id} screen`);
  }
  return `${out.join('\n')}\n`;
}

function steering(soul: Soul): string {
  return [
    '---',
    'inclusion: always',
    '---',
    '',
    `# Legacy behaviour of ${soul.app.name}`,
    '',
    `This code replaces a DOS app whose source is lost. These rules were observed in the old app (Soul version ${soul.version}). Keep them exactly, including the odd ones: the shop depends on them. Change one only after a recorded keep-or-fix decision.`,
    '',
    ...soul.rules.map((r) => `- \`${r.id}\`: ${r.en} (\`${r.expression}\`)`),
    '',
    'Money is decimal, never floating point. Truncate where a rule truncates.',
    '',
  ].join('\n');
}

export function writeKiroSpec(soul: Soul): SpecFiles {
  const dir = `.kiro/specs/${soul.app.id}-rebirth`;
  return {
    [`${dir}/requirements.md`]: requirements(soul),
    [`${dir}/design.md`]: design(soul),
    [`${dir}/tasks.md`]: tasks(soul),
    '.kiro/steering/legacy-behaviour.md': steering(soul),
  };
}

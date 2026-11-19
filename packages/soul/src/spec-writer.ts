// The Soul as a Kiro spec (Prompt 43): requirements.md (user stories and EARS acceptance criteria
// from the rules), design.md (how the screens connect, the screens and actions, the entities, the
// rule table with evidence, one correctness property per rule), tasks.md (with Kiro's task
// dependency graph), and .kiro/steering/legacy-behaviour.md for developers who carry on in Kiro.
// The headings are the ones Kiro's own spec format check asks for (docs/kiro-formats.md), so Kiro
// shows no problems for these files. Deterministic: the same Soul always gives the same files.
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

/** Text from a Soul on one line, so it can't start a heading or a list item of its own. */
const oneLine = (s: string) => s.replace(/\s*[\r\n]+\s*/g, ' ');
const tidy = (r: Rule): Rule => ({ ...r, en: oneLine(r.en), ur: oneLine(r.ur) });
/** Requirement n's acceptance criteria as Kiro numbers them: n.1, n.2 and so on. */
const criteria = (rule: Rule, n: number, soul: Soul) =>
  earsFor(rule, soul)
    .map((_, j) => `${n}.${j + 1}`)
    .join(', ');

function glossary(soul: Soul): string[] {
  return [
    '## Glossary',
    '',
    `- **System**: the reborn ${oneLine(soul.app.name)}, built from this spec.`,
    '- **Old app**: the DOS program this spec replaces. Its source is lost.',
    `- **Soul**: Afterlife's record of the old app (version ${soul.version}): its data files, screens, actions and rules.`,
    ...soul.entities.map((e) => `- **${oneLine(e.name)}**: a record in \`${e.file}\`.`),
    '- **Evidence**: the recorded observations of the old app that show a rule.',
    '- **Confidence**: how sure the Soul is of a rule, from its evidence.',
    '',
  ];
}

// Kiro's spec format check asks for # Requirements Document, ## Introduction, ## Glossary and
// ## Requirements, then "### Requirement N: Title" blocks, each with **User Story:** and
// #### Acceptance Criteria (docs/kiro-formats.md).
function requirements(soul: Soul): string {
  const name = oneLine(soul.app.name);
  const lines = [
    '# Requirements Document',
    '',
    '## Introduction',
    '',
    `The reborn ${name} must behave exactly as the old one. Each requirement below is one rule the old app follows, from Soul version ${soul.version}.`,
    '',
    ...glossary(soul),
    '## Requirements',
    '',
  ];
  soul.rules.map(tidy).forEach((r, i) => {
    const n = i + 1;
    lines.push(
      `### Requirement ${n}: \`${r.id}\``,
      '',
      `**User Story:** As the owner of ${name}, I want the reborn app to keep this rule of the old one, so that my records come out the same.`,
      '',
      `**Rule:** ${r.en}`,
      ...(r.ur ? ['', `**اصول:** ${r.ur}`] : []),
      '',
      `**Evidence:** ${evidence(r)}. **Confidence:** ${pct(r.confidence)}.`,
      '',
      '#### Acceptance Criteria',
      '',
      ...earsFor(r, soul).map((s, j) => `${j + 1}. ${s}`),
      '',
    );
  });
  if (!soul.rules.length) lines.push('No rules have been found yet.', '');
  return lines.join('\n');
}

/** The action whose effects change an effect rule's entity. */
const actionFor = (rule: Rule, soul: Soul) => {
  const entity = rule.target?.split('.')[0]?.replace(/_/g, '-');
  return soul.actions.find((a) => a.effects.some((f) => f.entity === entity));
};

/** A rule as a correctness property: what the new code must do for all inputs. */
function propertyFor(rule: Rule, soul: Soul): string {
  const target = rule.target ? targetWords(rule.target) : 'the value';
  const expr = `\`${oneLine(rule.expression)}\``;
  switch (rule.kind) {
    case 'compute':
      return `For all inputs, the new code sets ${target} to the value of ${expr}.`;
    case 'validate':
      return `For all entries, the new code accepts an entry exactly when ${expr} holds, and otherwise refuses it and leaves the data unchanged.`;
    case 'effect': {
      const action = actionFor(rule, soul);
      const of = action ? ` of "${oneLine(action.name)}"` : '';
      return `For all saves${of}, the new code sets ${target} to the value of ${expr}.`;
    }
    case 'counter':
      return `For all new records, the new code gives ${target} the next value of ${expr}.`;
  }
}

/** A Mermaid label: quoted, with the characters Mermaid reads as syntax written as codes. */
const mermaidLabel = (s: string) =>
  `"${oneLine(s).replace(/#/g, '#35;').replace(/"/g, '#34;').replace(/</g, '#60;').replace(/>/g, '#62;')}"`;

/** How the screens connect: a Mermaid graph whose edges are the keys that move between them. */
function screenGraph(soul: Soul): string[] {
  const out = ['```mermaid', 'graph TD'];
  const nodes = new Map<string, string>();
  const node = (id: string, title: string) => {
    let n = nodes.get(id);
    if (!n) {
      n = `s${nodes.size}`;
      nodes.set(id, n);
      out.push(`  ${n}[${mermaidLabel(title)}]`);
    }
    return n;
  };
  for (const s of soul.screens) node(s.id, s.title || '(untitled)');
  for (const s of soul.screens)
    for (const n of s.navigation)
      out.push(`  ${node(s.id, s.id)} -->|${mermaidLabel(n.keys)}| ${node(n.to, n.to)}`);
  out.push('```');
  return out;
}

function testing(soul: Soul, rules: Rule[]): string[] {
  const observed = new Set(rules.flatMap((r) => r.evidence)).size;
  const which = rules.length === 1 ? 'Property 1 above' : `Properties 1 to ${rules.length} above`;
  return [
    rules.length
      ? `- Every rule has a property test (${which}): on generated inputs, the new code and the rule's expression must agree. Run each one at least 100 times.`
      : '- There are no rules yet, so there are no property tests yet.',
    ...(observed
      ? [
          `- The ${observed} observation${observed === 1 ? '' : 's'} given as evidence replay as example tests: the same keys on the same screen must change the data the same way.`,
        ]
      : []),
    `- The old records in the DBF files load into the new data models unchanged.`,
  ];
}

// Kiro's spec format check asks for ## Overview, ## Architecture, ## Components and Interfaces
// and ## Data Models, and recommends ## Correctness Properties ("### Property N: Title" with
// **Validates: Requirements X.Y**), ## Error Handling and ## Testing Strategy.
function design(soul: Soul): string {
  const name = oneLine(soul.app.name);
  const rules = soul.rules.map(tidy);
  const titleOf = (id: string) => oneLine(soul.screens.find((s) => s.id === id)?.title || id);
  const out = [
    `# Design Document: ${name}`,
    '',
    '## Overview',
    '',
    `${name} is rebuilt from its Soul (version ${soul.version}, by ${soul.provenance.createdBy}, from ${soul.provenance.observationCount} observations). The rules are expressions in the Soul's rule language; they run with decimal arithmetic, never floating point.`,
    '',
    '## Architecture',
    '',
    "The reborn app keeps the old app's shape: the same screens, over one data store for each old DBF file. An action takes a screen's inputs, runs its rules and writes the records it changes. Each rule stays a small expression, so the new code can be tested against it.",
    '',
  ];
  if (soul.screens.length)
    out.push(
      'How the screens connect, and the keys that move between them:',
      '',
      ...screenGraph(soul),
      '',
    );
  out.push('## Components and Interfaces', '', '### Screens', '');
  for (const s of soul.screens) {
    out.push(`#### ${oneLine(s.title) || '(untitled)'} (\`${s.id}\`)`, '');
    for (const f of s.fields)
      out.push(
        `- ${oneLine(f.label)}: row ${f.row}, column ${f.col}, ${f.width} wide${f.binds ? `, ${f.binds.entity}.${f.binds.field}` : ''}`,
      );
    for (const n of s.navigation) out.push(`- \`${n.keys}\` goes to ${titleOf(n.to)}`);
    out.push('');
  }
  if (!soul.screens.length) out.push('No screens have been recorded yet.', '');
  out.push('### Actions', '');
  for (const a of soul.actions) {
    const effects = a.effects.map((f) => `${f.kind}s ${f.entity}`).join(', ');
    out.push(`- **${oneLine(a.name)}** (\`${a.keys}\` on ${titleOf(a.screen)}): ${effects}`);
  }
  if (!soul.actions.length) out.push('No actions have been recorded yet.');
  out.push('', '## Data Models', '');
  for (const e of soul.entities) {
    out.push(
      `### ${oneLine(e.name)} (\`${e.file}\`)`,
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
  out.push(
    '## Rules',
    '',
    '| Id | Kind | Target | Expression | Confidence | Evidence |',
    '| --- | --- | --- | --- | --- | --- |',
    ...rules.map(
      (r) =>
        `| \`${r.id}\` | ${r.kind} | ${r.target ?? ''} | \`${cell(r.expression)}\` | ${pct(r.confidence)} | ${evidence(r)} |`,
    ),
    '',
    '## Correctness Properties',
    '',
    'Each rule is a property of the new code, checked on generated inputs against the rule itself.',
    '',
  );
  rules.forEach((r, i) =>
    out.push(
      `### Property ${i + 1}: \`${r.id}\``,
      '',
      propertyFor(r, soul),
      '',
      `**Validates: Requirements ${criteria(r, i + 1, soul)}**`,
      '',
    ),
  );
  if (!rules.length) out.push('No rules have been found yet.', '');
  const refusals = rules.filter((r) => r.kind === 'validate');
  out.push(
    '## Error Handling',
    '',
    refusals.length
      ? 'The old app refuses an entry that breaks one of these rules, and leaves the data unchanged. The new code must do the same:'
      : 'No rule that refuses an entry has been found yet.',
    '',
  );
  if (refusals.length) out.push(...refusals.map((r) => `- \`${r.id}\`: ${r.en}`), '');
  out.push('## Testing Strategy', '', ...testing(soul, rules), '');
  return out.join('\n');
}

// Kiro's spec format check asks for "# Implementation Plan" and ## Task Dependency Graph (a JSON
// block of waves), and recommends ## Overview, ## Tasks and ## Notes. As in Kiro's own plans, only
// leaf tasks (N.M) go in the waves: the data models first, then the rules, then their property
// tests, then the screens.
function tasks(soul: Soul): string {
  const name = oneLine(soul.app.name);
  const out: string[] = [];
  const waves: string[][] = [[], [], [], []];
  let n = 0;
  if (soul.entities.length) {
    n++;
    out.push(`- [ ] ${n}. Model the data and load the old records`);
    soul.entities.forEach((e, j) => {
      out.push(
        `  - [ ] ${n}.${j + 1} Model ${oneLine(e.name)} (${e.fields.length} fields from \`${e.file}\`) and load its old records`,
      );
      waves[0]!.push(`${n}.${j + 1}`);
    });
  }
  soul.rules.forEach((r, i) => {
    n++;
    const refs = criteria(r, i + 1, soul);
    out.push(
      `- [ ] ${n}. Implement \`${r.id}\``,
      `  - [ ] ${n}.1 Write the rule in the new code`,
      `    - _Requirements: ${refs}_`,
      `  - [ ] ${n}.2 Write a property test that the new code and \`${cell(r.expression)}\` agree on generated inputs`,
      `    - **Property ${i + 1}: \`${r.id}\`**`,
      `    - **Validates: Requirements ${refs}**`,
    );
    waves[1]!.push(`${n}.1`);
    waves[2]!.push(`${n}.2`);
  });
  if (soul.screens.length) {
    n++;
    out.push(`- [ ] ${n}. Build the screens`);
    soul.screens.forEach((s, j) => {
      out.push(`  - [ ] ${n}.${j + 1} Build the ${oneLine(s.title) || s.id} screen`);
      waves[3]!.push(`${n}.${j + 1}`);
    });
  }
  const graph = waves.filter((w) => w.length);
  return [
    `# Implementation Plan: ${name}`,
    '',
    '## Overview',
    '',
    `Rebuild ${name} from its Soul (version ${soul.version}): model the old data files and load their records, implement each rule with a property test, then build the screens.`,
    '',
    '## Tasks',
    '',
    ...out,
    '',
    '## Notes',
    '',
    "- Each rule's property test is how the new code is checked against the old app: keep it passing.",
    "- Keep the old app's odd behaviours too: see `.kiro/steering/legacy-behaviour.md`.",
    '- Each task points at the requirements it covers.',
    '',
    '## Task Dependency Graph',
    '',
    '```json',
    '{',
    '  "waves": [',
    ...graph.map(
      (w, id) =>
        `    { "id": ${id}, "tasks": [${w.map((t) => `"${t}"`).join(', ')}] }${id < graph.length - 1 ? ',' : ''}`,
    ),
    '  ]',
    '}',
    '```',
    '',
  ].join('\n');
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

// Prompt 43: the Soul as a Kiro spec. Golden files for Shifa (UPDATE_GOLDEN=1 rewrites them), and
// the EARS sentences the rules turn into.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { soulArbitrary } from './arbitrary';
import { parseExpr } from './dsl';
import { SHIFA_REFERENCE_SOUL } from './examples/shifa';
import { kiroProblems } from './kiro-format';
import { describeCondition, earsFor, writeKiroSpec } from './spec-writer';

const GOLDEN = resolve(__dirname, '__golden__/shifa');

const specProblems = (files: Record<string, string>) =>
  (['requirements', 'design', 'tasks'] as const).flatMap((kind) =>
    kiroProblems(kind, Object.entries(files).find(([k]) => k.endsWith(`/${kind}.md`))![1]).map(
      (p) => `${kind}.md:${p.line + 1} ${p.severity} ${p.rule}`,
    ),
  );

/** The task dependency graph's waves, and every leaf task (N.M) in the list. */
function wavesAndLeaves(tasks: string) {
  const json = /## Task Dependency Graph\n\n```json\n([\s\S]*?)```/.exec(tasks)![1]!;
  const waves = (JSON.parse(json) as { waves: { id: number; tasks: string[] }[] }).waves;
  const leaves = [...tasks.matchAll(/^ {2}- \[ \] (\d+\.\d+) /gm)].map((m) => m[1]!);
  return { waves, leaves };
}

describe("Kiro's spec format check", () => {
  it('the checker finds the problems Kiro showed for the first version of this spec', () => {
    // What Kiro listed in its Problems panel for docs/examples/shifa-kiro-spec on 2026-11-19.
    expect(
      kiroProblems(
        'requirements',
        '# Requirements\n\n### Requirement 1: `x`\n\n**User story:** y\n\n#### Acceptance criteria\n\n1.1. THE SYSTEM SHALL z.\n',
      ).map((p) => p.rule),
    ).toEqual([
      'requirements/missing-title',
      'requirements/missing-introduction',
      'requirements/missing-glossary',
      'requirements/missing-requirements-section',
      'requirements/missing-user-story',
    ]);
    expect(kiroProblems('design', '# Design\n\n## Overview\n\nx\n').map((p) => p.severity)).toEqual(
      ['error', 'error', 'error', 'warning', 'warning', 'warning'],
    );
    expect(kiroProblems('tasks', '- [ ] 1. x\n').map((p) => p.rule)).toEqual([
      'tasks/missing-implementation-plan',
      'tasks/missing-overview',
      'tasks/missing-tasks-section',
      'tasks/missing-notes',
      'tasks/missing-dependency-graph',
    ]);
  });

  it('finds no problems in the spec for Shifa', () => {
    expect(specProblems(writeKiroSpec(SHIFA_REFERENCE_SOUL))).toEqual([]);
  });

  it('property: any valid Soul with rules gives a spec with no problems, and one without rules only lacks properties', () => {
    fc.assert(
      fc.property(soulArbitrary, (s) => {
        expect(specProblems(writeKiroSpec(s))).toEqual(
          s.rules.length
            ? []
            : [expect.stringMatching(/ warning design\/empty-correctness-properties$/)],
        );
      }),
    );
  });

  it('property: every leaf task is in exactly one wave, the waves count up from 0, and each test runs after its code', () => {
    fc.assert(
      fc.property(soulArbitrary, (s) => {
        const tasks = Object.entries(writeKiroSpec(s)).find(([k]) => k.endsWith('tasks.md'))![1];
        const { waves, leaves } = wavesAndLeaves(tasks);
        expect(waves.map((w) => w.id)).toEqual(waves.map((_, i) => i));
        expect(waves.flatMap((w) => w.tasks).sort()).toEqual([...leaves].sort());
        const waveOf = new Map(waves.flatMap((w) => w.tasks.map((x) => [x, w.id] as const)));
        for (const [, parent] of tasks.matchAll(/^ {2}- \[ \] (\d+)\.2 Write a property test/gm))
          expect(waveOf.get(`${parent}.2`)!).toBeGreaterThan(waveOf.get(`${parent}.1`)!);
      }),
    );
  });

  it('every correctness property names the acceptance criteria it checks', () => {
    const files = writeKiroSpec(SHIFA_REFERENCE_SOUL);
    const design = files['.kiro/specs/shifa-rebirth/design.md']!;
    const req = files['.kiro/specs/shifa-rebirth/requirements.md']!;
    const criteria = new Set<string>();
    for (const block of req.split(/^### Requirement /m).slice(1)) {
      const n = /^(\d+):/.exec(block)![1];
      for (const [, k] of block.matchAll(/^(\d+)\. /gm)) criteria.add(`${n}.${k}`);
    }
    const cited = [...design.matchAll(/\*\*Validates: Requirements ([\d., ]+)\*\*/g)].flatMap((m) =>
      m[1]!.split(', '),
    );
    expect(new Set(cited)).toEqual(criteria);
  });
});

describe('writeKiroSpec', () => {
  const files = writeKiroSpec(SHIFA_REFERENCE_SOUL);

  it('writes a Kiro spec folder and a steering file', () => {
    expect(Object.keys(files).sort()).toEqual([
      '.kiro/specs/shifa-rebirth/design.md',
      '.kiro/specs/shifa-rebirth/requirements.md',
      '.kiro/specs/shifa-rebirth/tasks.md',
      '.kiro/steering/legacy-behaviour.md',
    ]);
  });

  for (const name of ['requirements.md', 'design.md', 'tasks.md', 'legacy-behaviour.md'])
    it(`golden: ${name} for Shifa`, () => {
      const key = Object.keys(files).find((k) => k.endsWith(`/${name}`))!;
      const path = resolve(GOLDEN, name);
      if (process.env.UPDATE_GOLDEN) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, files[key]!);
      }
      expect(files[key]).toBe(readFileSync(path, 'utf8'));
    });

  it('the steering file is always included, as Kiro steering needs', () => {
    expect(files['.kiro/steering/legacy-behaviour.md']).toMatch(/^---\ninclusion: always\n---\n/);
  });

  it('every rule becomes a numbered requirement, and every task points at its requirements', () => {
    const req = files['.kiro/specs/shifa-rebirth/requirements.md']!;
    for (const r of SHIFA_REFERENCE_SOUL.rules) expect(req).toContain(`\`${r.id}\``);
    const tasks = files['.kiro/specs/shifa-rebirth/tasks.md']!;
    expect(tasks).toMatch(/^- \[ \] 1\. /m);
    const reqs = [...req.matchAll(/^### Requirement (\d+)/gm)].map((m) => m[1]);
    for (const [, n] of tasks.matchAll(/_Requirements: (\d+)\.\d/g)) expect(reqs).toContain(n);
  });

  it('property: any valid Soul gives a spec, the same one every time, with every rule in it', () => {
    fc.assert(
      fc.property(soulArbitrary, (s) => {
        const a = writeKiroSpec(s);
        expect(writeKiroSpec(s)).toEqual(a);
        const req = Object.entries(a).find(([k]) => k.endsWith('requirements.md'))![1];
        for (const r of s.rules) expect(req).toContain(`\`${r.id}\``);
      }),
    );
  });
});

describe('EARS from rules', () => {
  const rule = (id: string) => SHIFA_REFERENCE_SOUL.rules.find((r) => r.id === id)!;

  it('a compute rule with a condition: one WHEN for each branch', () => {
    expect(earsFor(rule('discount-over-5000'), SHIFA_REFERENCE_SOUL)).toEqual([
      'WHEN the bill subtotal is over 5000 THE SYSTEM SHALL set the bill discount to `trunc(bill.subtotal * 0.10, 2)`.',
      'WHEN the bill subtotal is at most 5000 THE SYSTEM SHALL set the bill discount to `0`.',
    ]);
  });

  it('a compute rule without one: THE SYSTEM SHALL', () => {
    expect(earsFor(rule('gst-17-truncated'), SHIFA_REFERENCE_SOUL)).toEqual([
      'THE SYSTEM SHALL set the bill gst to `trunc((bill.subtotal - bill.discount) * 0.17, 2)`.',
    ]);
  });

  it('a validate rule: IF it is broken THEN THE SYSTEM SHALL refuse it', () => {
    expect(earsFor(rule('expired-batch-blocked'), SHIFA_REFERENCE_SOUL)).toEqual([
      'IF the medicine expiry is before today THEN THE SYSTEM SHALL refuse the entry and leave the data unchanged.',
    ]);
  });

  it('an effect rule: WHEN the action that changes it is done', () => {
    expect(earsFor(rule('stock-decrement'), SHIFA_REFERENCE_SOUL)).toEqual([
      'WHEN "Save a bill" is done THE SYSTEM SHALL set the medicine qty to `medicine.qty - item.qty`.',
    ]);
  });

  it('conditions read as English and negate correctly', () => {
    const d = (s: string, negate = false) => describeCondition(parseExpr(s), negate);
    expect(d('a.b >= 1 and c.d != 2')).toBe('the a b is at least 1 and the c d is not 2');
    expect(d('a.b >= 1 and c.d != 2', true)).toBe('the a b is under 1 or the c d is 2');
    expect(d('not x.y = 3', true)).toBe('the x y is 3');
    expect(d('any(items, i => i.qty > 2)')).toBe('`any(items, i => i.qty > 2)` is true');
  });
});

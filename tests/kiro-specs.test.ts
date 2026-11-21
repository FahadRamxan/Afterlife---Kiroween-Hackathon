// Every spec the repo is built from (.kiro/specs/<feature>/) opens in Kiro with no "Kiro Spec
// Format" problem: the same check the spec writer's tests run (packages/soul/src/kiro-format.ts).
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { kiroProblems } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';

const SPECS = resolve(__dirname, '../.kiro/specs');
const specs = existsSync(SPECS) ? readdirSync(SPECS).sort() : [];

describe('.kiro/specs', () => {
  it('has the specs of the phases built since the review of 51-60', () => {
    expect(specs.length).toBeGreaterThan(0);
  });

  for (const name of specs)
    it(`${name}: requirements, design and tasks with no format problem`, () => {
      const problems = (['requirements', 'design', 'tasks'] as const).flatMap((kind) => {
        const file = resolve(SPECS, name, `${kind}.md`);
        if (!existsSync(file)) return [`${kind}.md is missing`];
        return kiroProblems(kind, readFileSync(file, 'utf8')).map(
          (p) => `${kind}.md:${p.line + 1} ${p.severity} ${p.rule}`,
        );
      });
      expect(problems).toEqual([]);
    });

  for (const name of specs)
    it(`${name}: every requirement a task cites exists`, () => {
      const req = readFileSync(resolve(SPECS, name, 'requirements.md'), 'utf8');
      const have = new Set<string>();
      for (const block of req.split(/^### Requirement /m).slice(1)) {
        const n = /^(\d+):/.exec(block)?.[1];
        const count = (block.match(/^\d+\. /gm) ?? []).length;
        for (let i = 1; i <= count; i++) have.add(`${n}.${i}`);
      }
      const tasks = readFileSync(resolve(SPECS, name, 'tasks.md'), 'utf8');
      const cited = [...tasks.matchAll(/_Requirements: ([\d., ]+)_/g)].flatMap((m) =>
        m[1]!.split(',').map((x) => x.trim()),
      );
      expect(cited.filter((c) => !have.has(c))).toEqual([]);
    });
});

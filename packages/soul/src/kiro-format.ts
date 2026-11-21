// Kiro's spec format check, as Kiro IDE (November 2026) runs it. Shared by the spec writer's
// tests and tests/kiro-specs.test.ts, which checks the specs this repo is built from.
export type Problem = { severity: 'error' | 'warning'; rule: string; line: number };

/**
 * Kiro's own spec format check, rule for rule, as Kiro IDE (November 2026) runs it on
 * .kiro/specs/<name>/{requirements,design,tasks}.md: these are the "Kiro Spec Format" problems in
 * its Problems panel. A spec with none here opens in Kiro with no problems.
 */
export function kiroProblems(kind: 'requirements' | 'design' | 'tasks', text: string): Problem[] {
  const lines = text.split('\n');
  const t = (s: string) => s.trimEnd();
  const out: Problem[] = [];
  const add = (severity: Problem['severity'], rule: string, line = 0) =>
    out.push({ severity, rule, line });
  const need = (re: RegExp, severity: Problem['severity'], rule: string) =>
    lines.some((l) => re.test(t(l))) || add(severity, rule);
  const sectionEnd = (from: number, heading: RegExp) => {
    const end = lines.findIndex((l, j) => j > from && heading.test(l));
    return end === -1 ? lines.length : end;
  };
  if (kind === 'requirements') {
    need(/^# Requirements Document$/i, 'error', 'requirements/missing-title');
    need(/^## Introduction$/, 'error', 'requirements/missing-introduction');
    need(/^## Glossary$/, 'warning', 'requirements/missing-glossary');
    need(/^## Requirements$/, 'error', 'requirements/missing-requirements-section');
    lines.forEach((l, i) => {
      const ok = /^### Requirement \d+:/.test(l);
      if (/^### Requirement\b/.test(l) && !ok)
        add('error', 'requirements/malformed-requirement-heading', i);
      if (!ok) return;
      const block = lines.slice(i + 1, sectionEnd(i, /^### /));
      if (!block.some((x) => /\*\*User Story:\*\*/.test(x)))
        add('warning', 'requirements/missing-user-story', i);
      if (!block.some((x) => /^#### Acceptance Criteria$/i.test(t(x))))
        add('error', 'requirements/missing-acceptance-criteria', i);
    });
  }
  if (kind === 'design') {
    const sections = new Set(lines.map((l) => /^##\s+(.+)$/.exec(t(l))?.[1]?.toLowerCase()));
    const wanted = [
      ['overview', 'error', 'design/missing-overview'],
      ['architecture', 'error', 'design/missing-architecture'],
      ['components and interfaces', 'error', 'design/missing-components'],
      ['data models', 'error', 'design/missing-data-models'],
      ['correctness properties', 'warning', 'design/missing-correctness-properties'],
      ['error handling', 'warning', 'design/missing-error-handling'],
      ['testing strategy', 'warning', 'design/missing-testing-strategy'],
    ] as const;
    for (const [name, severity, rule] of wanted) if (!sections.has(name)) add(severity, rule);
    const at = lines.findIndex((l) => /^## Correctness Properties$/.test(t(l)));
    if (at !== -1) {
      const body = lines.slice(at + 1, sectionEnd(at, /^## /));
      const props: number[] = [];
      body.forEach((l, j) => {
        const ok = /^(?:### )?Property \d+:/.test(l);
        if (/^(?:### )?Property\b/.test(l) && !ok)
          add('error', 'design/malformed-property-heading', at + 1 + j);
        if (ok) props.push(j);
      });
      if (!props.length) add('warning', 'design/empty-correctness-properties', at);
      props.forEach((p, k) => {
        const own = body.slice(p + 1, props[k + 1] ?? body.length);
        if (!own.some((x) => /\*\*Validates:\s*Requirements\s+[\d.,\s]+\*\*/.test(x)))
          add('warning', 'design/missing-property-validates', at + 1 + p);
      });
    }
  }
  if (kind === 'tasks') {
    if (!lines.some((l) => /^# Implementation Plan/.test(l)))
      add('error', 'tasks/missing-implementation-plan');
    need(/^## Overview$/, 'warning', 'tasks/missing-overview');
    const at = lines.findIndex((l) => /^## Tasks$/.test(t(l)));
    if (at === -1) add('warning', 'tasks/missing-tasks-section');
    lines.forEach(
      (l, i) => /^#{2,3} Task \d+/.test(l) && add('error', 'tasks/invalid-task-heading', i),
    );
    if (at !== -1)
      for (let i = at + 1; i < sectionEnd(at, /^## /); i++) {
        const l = lines[i]!;
        const box = /^\s*- \[([ x~-])\]/.test(l);
        if (/^\s*- \[([^\] ])\]/.test(l) && !box) add('error', 'tasks/malformed-checkbox', i);
        if (!box) continue;
        const sub = /^\s*- \[([ x~-])\]\\?\*? \d+\.\d+/.test(l);
        if (/^\s/.test(l)) {
          if (!sub) add('error', 'tasks/invalid-subtask-line', i);
        } else if (!sub && !/^- \[([ x~-])\]\\?\*? \d+\./.test(l))
          add('error', 'tasks/invalid-task-line', i);
      }
    need(/^## Notes$/, 'warning', 'tasks/missing-notes');
    const graph = lines.findIndex((l) => /^## Task Dependency Graph$/.test(t(l)));
    if (graph === -1) add('error', 'tasks/missing-dependency-graph');
    else {
      const body = lines.slice(graph + 1, sectionEnd(graph, /^## /)).join('\n');
      const json = /```json\s*\n?([\s\S]*?)```/.exec(body)?.[1]?.trim();
      if (json === undefined) add('error', 'tasks/missing-dag-json', graph);
      else if (json === '') add('error', 'tasks/empty-dag-json', graph);
      else
        try {
          const g = JSON.parse(json) as { waves?: unknown };
          if (!Array.isArray(g.waves) || !g.waves.length)
            add('error', 'tasks/invalid-dag-structure', graph);
        } catch {
          add('error', 'tasks/invalid-dag-json', graph);
        }
    }
  }
  return out;
}

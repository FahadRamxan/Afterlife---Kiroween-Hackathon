// The Archaeologist's rules (Prompts 54 and 55, together): for each value the old app wrote, the
// model proposes candidates and the deterministic check keeps the simplest that explains every
// observation. Used by the worker's archaeology step and by `pnpm score:archaeology`.
import type { Entity, Rule } from '@afterlife/soul';
import type { CrewLlm } from '../llm/runtime';
import { LlmSchemaError } from '../llm/runtime';
import { effectsOf, hypothesesFor, type Effect, type EffectObservation } from './hypotheses';
import {
  selectRule,
  targetOf,
  type RuleProbe,
  type RuleProbeRunner,
  type Verification,
} from './verify';

/** At most this many values get rules per run: each costs one model call. */
export const MAX_RULE_TARGETS = 16;

export type InferOptions = {
  /** The app's date, for rules that use `today`. */
  today?: string;
  maxTargets?: number;
  signal?: AbortSignal;
  /** Runs probes in the old app; without it the probes are returned, not run. */
  probe?: RuleProbeRunner;
  log?: (message: string, level?: 'info' | 'warn') => Promise<void> | void;
  /** Called for each rule kept, with its verification (the worker emits `rule_found`). */
  found?: (rule: Rule, v: Verification & { candidates: number }) => Promise<void> | void;
};

export type Inferred = {
  rules: Rule[];
  probes: RuleProbe[];
  /** How many values were looked at. */
  targets: number;
  /** Values no candidate explained. */
  unexplained: string[];
};

export async function inferRules(
  llm: CrewLlm,
  entities: Entity[],
  observations: EffectObservation[],
  opts: InferOptions = {},
): Promise<Inferred> {
  const log = opts.log ?? (() => undefined);
  const byTarget = new Map<string, Effect[]>();
  for (const e of effectsOf(observations, entities)) {
    const list = byTarget.get(targetOf(e)) ?? [];
    list.push(e);
    byTarget.set(targetOf(e), list);
  }
  const rules: Rule[] = [];
  const probes: RuleProbe[] = [];
  const unexplained: string[] = [];
  // By name, in code-point order: stored observations (JSONB) do not keep a record's field
  // order, and a locale's order differs from machine to machine.
  const max = opts.maxTargets ?? MAX_RULE_TARGETS;
  const targets = [...byTarget].sort(([x], [y]) => (x < y ? -1 : x > y ? 1 : 0)).slice(0, max);
  if (byTarget.size > targets.length)
    await log(
      `${byTarget.size} values were written; rules for the first ${targets.length}`,
      'warn',
    );
  for (const [target, effects] of targets) {
    if (opts.signal?.aborted) throw opts.signal.reason;
    // The model sees a value that is not zero when there is one: a 0.00 discount says little.
    const shown = effects.find((e) => !/^-?0+(\.0+)?$/.test(e.after)) ?? effects[0]!;
    let candidates: { expression: string; why: string }[];
    try {
      candidates = (await hypothesesFor(shown, observations, llm, entities)).candidates;
    } catch (e) {
      if (e instanceof LlmSchemaError) {
        await log(`${target}: the model gave no usable candidates (${e.message})`, 'warn');
        unexplained.push(target);
        continue;
      }
      throw e;
    }
    const v = await selectRule(
      target,
      candidates.map((c) => c.expression),
      observations,
      entities,
      {
        ...(opts.today ? { today: opts.today } : {}),
        ...(opts.probe ? { probe: opts.probe } : {}),
      },
    );
    probes.push(...v.probes);
    if (!v.selected) {
      unexplained.push(target);
      const asks = v.probes.length
        ? `. Probes to run: ${v.probes.map((p) => p.text).join(' ')}`
        : '';
      await log(
        `${target}: none of ${candidates.length} candidates explains all ${v.effects} values${asks}`,
        'warn',
      );
      continue;
    }
    const sel = v.selected;
    const why = candidates.find((c) => c.expression === sel.expression)?.why.trim();
    const rule: Rule = {
      id: target.replace(/[._]/g, '-').slice(0, 48),
      kind: effects[0]!.kind === 'changed' ? 'effect' : 'compute',
      target,
      en: (why || `${target} is ${sel.expression}`).slice(0, 500),
      ur: '',
      expression: sel.expression,
      evidence: sel.evidence,
      confidence: sel.confidence,
    };
    rules.push(rule);
    await opts.found?.(rule, { ...v, candidates: candidates.length });
    await log(
      `${target} = ${sel.expression}: explains all ${v.effects} values in ${sel.evidence.length} observations (confidence ${Math.round(sel.confidence * 100)}%)`,
    );
  }
  return { rules, probes, targets: targets.length, unexplained };
}

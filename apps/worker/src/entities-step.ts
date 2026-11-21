// The Archaeologist's step (Prompts 53 to 55): the data files' entities, keys, foreign keys and
// counters, from the app's own files (read from its js-dos bundle, no emulator needed) and the
// project's observations. Then, with a model set up, the rules: for each value the old app wrote
// the model proposes candidates (Prompt 54), and each is checked against every observation; only
// one that explains all of them is kept, the simplest (Prompt 55). Stored as a Soul version.
import {
  CrewLlm,
  LlmBudgetError,
  PgLlmCallLog,
  detectEntities,
  inferActions,
  loadGraph,
  stepFromObservation,
  inferRules,
  type EffectObservation,
  type Inferred,
  type LlmClient,
  type TableInput,
} from '@afterlife/crew';
import { readDbf, type SnapshotDiff } from '@afterlife/dbf';
import { asc, eq, insertSoulVersion, observations, sessions, sql, type Db } from '@afterlife/db';
import { numberSoul, specRequirements, type Soul } from '@afterlife/soul';
import { graveyardDosTime, type EmulatorPool } from './possess';
import { probeRunner } from './probe-runner';
import { unzipSync } from 'fflate';
import type { StepContext, StepHandler } from './registry';

/** The .DBF files in a js-dos bundle (a zip), by their DOS name, upper case. */
export function bundleTables(bundle: Uint8Array): TableInput[] {
  const out: TableInput[] = [];
  for (const [path, bytes] of Object.entries(unzipSync(bundle))) {
    if (path.startsWith('.jsdos/') || !/\.DBF$/i.test(path)) continue;
    try {
      out.push({ file: path.split('/').at(-1)!.toUpperCase(), table: readDbf(bytes) });
    } catch {
      // A file the reader cannot read is left out; the others still give their entities.
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file));
}

/**
 * Screens found by possession: a Soul screen per fingerprint (the screens keys were pressed on,
 * where actions start, and the screens they led to), with its title.
 */
function screensOf(
  rows: {
    screenBefore: unknown;
    screenAfter: unknown;
    screenAfterFp: string;
    screenBeforeFp: string;
  }[],
): Soul['screens'] {
  const seen = new Map<string, string>();
  const title = (s: unknown) =>
    ((s as { model?: { title?: { name?: string } } })?.model?.title?.name ?? '')
      .trim()
      .slice(0, 80);
  for (const r of rows) {
    if (!seen.has(r.screenBeforeFp)) seen.set(r.screenBeforeFp, title(r.screenBefore));
    if (!seen.has(r.screenAfterFp)) seen.set(r.screenAfterFp, title(r.screenAfter));
  }
  return [...seen].map(([id, t]) => ({ id, title: t, fields: [], navigation: [] }));
}

export { MAX_RULE_TARGETS } from '@afterlife/crew';
export const NO_RULE_MODEL =
  'No language model is set up on this worker (LLM_PROVIDER=bedrock, with AWS credentials): the rules are found among short expressions over the fields, each checked against every observation';
export const MODEL_RULES =
  'The language model proposes candidate rules, with short expressions over the fields; each is checked against every observation';

export function entitiesStep(deps: {
  db: Db;
  /** The model that proposes candidate rules (LLM_PROVIDER); none: entities only. */
  llm?: LlmClient | null;
  budgetTokens?: number;
  /** The emulator, for the probes (bills the rules need to see) typed into the old app. */
  pool?: EmulatorPool;
  bundleFor: (
    p: StepContext['project'],
    projectId: string,
  ) => Promise<Uint8Array | null> | Uint8Array | null;
  now?: () => Date;
}): StepHandler {
  return async (ctx) => {
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle)
      return {
        status: 'skipped',
        reason: `There is no js-dos bundle for ${ctx.project.sourceApp} yet`,
      };
    const tables = bundleTables(bundle);
    if (!tables.length) return { status: 'skipped', reason: 'The app has no .DBF data files' };
    const rows = await deps.db
      .select({
        id: observations.id,
        keys: observations.keys,
        screenBefore: observations.screenBefore,
        dbfDiff: observations.dbfDiff,
        screenAfter: observations.screenAfter,
        screenAfterFp: observations.screenAfterFp,
        screenBeforeFp: observations.screenBeforeFp,
      })
      .from(observations)
      // Possession's observations, and those of the owner's séances on the project.
      .leftJoin(sessions, eq(sessions.id, observations.sessionId))
      .where(
        sql`${observations.projectId} = ${ctx.projectId} OR ${sessions.projectId} = ${ctx.projectId}`,
      )
      .orderBy(asc(observations.createdAt), asc(observations.seq));
    const entities = await detectEntities(
      tables,
      rows.map((r) => r.dbfDiff as SnapshotDiff),
    );
    const byId = new Map(entities.map((e) => [e.id, e]));
    for (const e of entities) {
      const parts = [
        e.key.length ? `key ${e.key.join(' + ')}` : 'no key',
        ...e.counters.map((c) => `counter ${c.field} ${c.pattern}`),
        ...e.foreignKeys.map(
          (fk) => `${fk.fields.join(' + ')} refers to ${byId.get(fk.references.entity)?.id}`,
        ),
      ];
      await ctx.log(`${e.file}: ${parts.join(', ')}`);
    }
    // What the owner does that writes data: the bill they save, the customer they add.
    const actions = inferActions(rows.map(stepFromObservation), entities);
    for (const a of actions)
      await ctx.log(
        `Action "${a.name}" on ${a.screen}: ${a.effects.map((e) => `${e.kind} ${e.entity}`).join(', ')}, keys ${a.keys}`,
      );
    const today = ctx.project.dosTime ?? graveyardDosTime(ctx.project);
    // The app's own records: a bill line's medicine is looked up in them, and probes priced.
    const records = Object.fromEntries(tables.map((t) => [t.file, t.table.records]));
    const llm = deps.llm
      ? new CrewLlm({
          client: deps.llm,
          log: new PgLlmCallLog(deps.db),
          projectId: ctx.projectId,
          budgetTokens: deps.budgetTokens ?? 200_000,
          signal: ctx.signal,
        })
      : null;
    await ctx.log(llm ? MODEL_RULES : NO_RULE_MODEL, llm ? 'info' : 'warn');
    const graph = deps.pool && actions.length ? await loadGraph(deps.db, ctx.projectId) : null;
    if (deps.pool && actions.length && !graph)
      await ctx.log('No screen graph is kept for this project, so the probes are not run', 'warn');
    let seq = 0;
    if (graph) {
      const [n] = await deps.db
        .select({ n: sql<number>`coalesce(max(${observations.seq}) + 1, 0)` })
        .from(observations)
        .where(eq(observations.projectId, ctx.projectId));
      seq = Number(n?.n ?? 0);
    }
    const draft = {
      schemaVersion: 1 as const,
      app: {
        id:
          ctx.project.sourceApp
            .replace(/[^a-z0-9-]/gi, '-')
            .toLowerCase()
            .slice(0, 64) || 'app',
        name: ctx.project.name.slice(0, 80),
      },
      version: 1,
      provenance: {
        createdAt: (deps.now ?? (() => new Date()))().toISOString(),
        createdBy: 'archaeologist' as const,
        projectId: ctx.projectId,
        observationCount: rows.length,
      },
      entities,
      screens: screensOf(rows),
      actions,
    };
    let found: Inferred | null = null;
    try {
      found = await inferRules(
        llm,
        entities,
        rows.map((r) => ({
          id: r.id,
          keys: r.keys,
          screenBefore: r.screenBefore as EffectObservation['screenBefore'],
          dbfDiff: r.dbfDiff as SnapshotDiff,
        })),
        {
          ...(today ? { today } : {}),
          tables: records,
          signal: ctx.signal,
          ...(graph && deps.pool
            ? {
                probe: probeRunner({
                  db: deps.db,
                  pool: deps.pool,
                  projectId: ctx.projectId,
                  bundle,
                  dosTime: today,
                  tables: records,
                  graph,
                  draft,
                  nextSeq: () => seq++,
                  log: (m, level) => ctx.log(m, level),
                  signal: ctx.signal,
                }),
              }
            : {}),
          log: (m, level) => ctx.log(m, level),
          found: (rule, v) =>
            ctx.emit('rule_found', {
              ruleId: rule.id,
              target: rule.target,
              expression: rule.expression,
              en: rule.en,
              confidence: rule.confidence,
              observations: rule.evidence.length,
              candidates: v.candidates,
              alsoFit: v.alsoFit,
              probes: v.probes.map((p) => p.text),
            }),
        },
      );
    } catch (e) {
      // A spent budget does not come back on a retry: keep the entities, say so.
      if (!(e instanceof LlmBudgetError)) throw e;
      await ctx.log(`Rules stopped: ${e.message}`, 'warn');
    }
    const rules = found?.rules ?? [];
    const soul: Soul = {
      ...draft,
      provenance: {
        ...draft.provenance,
        observationCount: rows.length + (found?.added.length ?? 0),
        note: rules.length
          ? `Entities from the data files; ${actions.length} actions and ${rules.length} rules, each rule checked against every observation${found?.probed.length ? ` (${found.probed.length} probes run in the old app)` : ''}.`
          : 'Entities, keys, foreign keys and counters from the data files and the observations. No rules yet.',
      },
      rules,
    };
    const version = await insertSoulVersion(deps.db, ctx.projectId, (v, parent) => {
      const stored = numberSoul(soul, ctx.projectId, v, parent);
      return { ir: stored, specMarkdown: specRequirements(stored) };
    });
    const output = {
      version,
      entities: entities.length,
      keys: entities.filter((e) => e.key.length).length,
      foreignKeys: entities.reduce((n, e) => n + e.foreignKeys.length, 0),
      counters: entities.reduce((n, e) => n + e.counters.length, 0),
      actions: actions.length,
      rules: rules.length,
      unexplained: found?.unexplained ?? [],
      probed: found?.probed.length ?? 0,
      probes: (found?.probes ?? []).map((p) => p.text),
    };
    await ctx.emit('soul_updated', { ...output, reason: rules.length ? 'rules' : 'entities' });
    return { status: 'done', output };
  };
}

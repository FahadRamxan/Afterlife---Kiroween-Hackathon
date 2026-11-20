// The Archaeologist's first step (Prompt 53): the data files' entities, keys, foreign keys and
// counters, from the app's own files (read from its js-dos bundle, no emulator needed) and the
// project's observations. Stored as a Soul version with no rules yet: the rules are Prompts 54
// and 55, and each Soul version after this one adds to it.
import { detectEntities, type TableInput } from '@afterlife/crew';
import { readDbf, type SnapshotDiff } from '@afterlife/dbf';
import { asc, eq, insertSoulVersion, observations, type Db } from '@afterlife/db';
import { numberSoul, specRequirements, type Soul } from '@afterlife/soul';
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

/** Screens found by possession: a Soul screen per fingerprint, with its title. */
function screensOf(rows: { screenAfter: unknown; screenAfterFp: string }[]): Soul['screens'] {
  const seen = new Map<string, string>();
  for (const r of rows) {
    if (seen.has(r.screenAfterFp)) continue;
    const title =
      (r.screenAfter as { model?: { title?: { name?: string } } })?.model?.title?.name ?? '';
    seen.set(r.screenAfterFp, title.trim().slice(0, 80));
  }
  return [...seen].map(([id, title]) => ({ id, title, fields: [], navigation: [] }));
}

export function entitiesStep(deps: {
  db: Db;
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
        dbfDiff: observations.dbfDiff,
        screenAfter: observations.screenAfter,
        screenAfterFp: observations.screenAfterFp,
      })
      .from(observations)
      .where(eq(observations.projectId, ctx.projectId))
      .orderBy(asc(observations.seq));
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
    const soul: Soul = {
      schemaVersion: 1,
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
        createdBy: 'archaeologist',
        projectId: ctx.projectId,
        observationCount: rows.length,
        note: 'Entities, keys, foreign keys and counters from the data files and the observations. No rules yet.',
      },
      entities,
      screens: screensOf(rows),
      actions: [],
      rules: [],
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
    };
    await ctx.emit('soul_updated', { ...output, reason: 'entities' });
    return { status: 'done', output };
  };
}

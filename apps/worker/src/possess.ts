// The possess step (Prompt 48): boot the old app in headless js-dos, then let the Possessor
// (@afterlife/crew) explore it. Every action is stored as an observation of the project and sent
// live: the screen it led to, and what it found. The screen graph is the step's output.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  CrewLlm,
  PgLlmCallLog,
  dataValueChooser,
  llmValueChooser,
  possess,
  saveGraph,
  strategyChooser,
  type LlmClient,
  type PossessorObservation,
  type SpeechClient,
  type ValueChooser,
} from '@afterlife/crew';
import { seanceGuide, type SeanceGuide } from './seance-guide';
import { SEED_PROJECTS, eq, observations, sql, type Db } from '@afterlife/db';
import {
  waitForStableScreen,
  type EmulatorController,
  type RecordOptions,
} from '@afterlife/emulator';
import { decodeScreen, toWire } from '@afterlife/screen';
import type { StepContext, StepHandler } from './registry';

/** The part of HeadlessPool this step needs (a fake in unit tests). */
export type EmulatorPool = {
  use<R>(
    bundle: Uint8Array,
    work: (emu: EmulatorController) => Promise<R>,
    boot?: { dosTime?: string },
  ): Promise<R>;
};

const GRAVEYARD = new Set<string>(SEED_PROJECTS.map((p) => p.sourceApp));

/**
 * The js-dos bundle of a Graveyard app, or null. Only the known ids are read, so nothing in a
 * project row can choose a path. Uploaded apps get their bundle from the database (Prompt 40).
 */
export function graveyardBundle(p: { source: string; sourceApp: string }): Uint8Array | null {
  if (p.source !== 'graveyard' || !GRAVEYARD.has(p.sourceApp)) return null;
  const file = new URL(`../../web/public/graveyard/${p.sourceApp}.jsdos`, import.meta.url);
  return new Uint8Array(readFileSync(fileURLToPath(file)));
}

/**
 * The DOS clock a Graveyard app was used at (its manifest's `dosTime`), or undefined. The séance
 * and the MCP server boot at it too, so dates on screen and in the data files are of the app's
 * own era (Iqra's late fees and Shifa's expiry check depend on it). Only the known ids are read.
 */
export function graveyardDosTime(p: { source: string; sourceApp: string }): string | undefined {
  if (p.source !== 'graveyard' || !GRAVEYARD.has(p.sourceApp)) return undefined;
  const file = new URL(`../../../samples/graveyard/${p.sourceApp}/manifest.json`, import.meta.url);
  return (JSON.parse(readFileSync(fileURLToPath(file), 'utf8')) as { dosTime?: string }).dosTime;
}

/** At most this many key sequences per possession (POSSESS_MAX_ACTIONS). */
export const DEFAULT_MAX_ACTIONS = 120;
/** Values typed into each field: the first, then boundary values (POSSESS_PROBES, Prompt 49). */
export const DEFAULT_PROBES = 3;

export function possessApp(deps: {
  pool: EmulatorPool;
  bundleFor: (
    p: StepContext['project'],
    projectId: string,
  ) => Promise<Uint8Array | null> | Uint8Array | null;
  /** The app's DOS clock: a Graveyard manifest's, or an upload's own (from its DBF headers). */
  dosTimeFor?: (
    p: StepContext['project'],
    projectId: string,
  ) => Promise<string | undefined> | string | undefined;
  /** Where observations are stored (none in unit tests). */
  db?: Db;
  /** The model that proposes field values; null: values from the app's data files. */
  llm?: LlmClient | null;
  budgetTokens?: number;
  maxActions?: number;
  probesPerField?: number;
  /** A fixed value chooser (tests). */
  values?: ValueChooser;
  /** How long a screen must be still before it counts (tests use a fake app that is instant). */
  record?: RecordOptions;
  /** Transcribes séance voice notes into hints (SPEECH_PROVIDER); null: none set up. */
  speech?: SpeechClient | null;
}): StepHandler {
  return async (ctx) => {
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle)
      return {
        status: 'skipped',
        reason: `There is no js-dos bundle for ${ctx.project.sourceApp} yet`,
      };
    // Without it js-dos keeps a clock of its own (Iqra, a 2001 app, showed 25-06-1998).
    const dosTime =
      ctx.project.dosTime ??
      (await (deps.dosTimeFor ?? graveyardDosTime)(ctx.project, ctx.projectId));
    const values =
      deps.values ??
      (deps.llm && deps.db
        ? strategyChooser(
            llmValueChooser(
              new CrewLlm({
                client: deps.llm,
                log: new PgLlmCallLog(deps.db),
                projectId: ctx.projectId,
                budgetTokens: deps.budgetTokens ?? 200_000,
                signal: ctx.signal,
              }),
            ),
          )
        : dataValueChooser);
    const db = deps.db;
    // A re-run adds to the project's observations; it does not replace them.
    let seq = 0;
    if (db) {
      const [row] = await db
        .select({ n: sql<number>`coalesce(max(${observations.seq}) + 1, 0)` })
        .from(observations)
        .where(eq(observations.projectId, ctx.projectId));
      seq = Number(row?.n ?? 0);
    }
    // The owner's séances on this project lead the way (Prompt 50).
    const guided: SeanceGuide = db
      ? await seanceGuide(db, ctx.projectId, deps.speech ?? null, ctx.signal)
      : { guide: [], seances: 0, notes: { transcribed: 0, reused: 0, untranscribed: 0 }, hints: 0 };
    if (guided.seances) {
      const steps = guided.guide.filter((g) => !g.home).length;
      await ctx.log(
        `Guided by ${guided.seances === 1 ? 'the owner’s séance' : `${guided.seances} séances of the owner`}: ${steps} steps first, then the gaps`,
      );
      const n = guided.notes;
      if (n.transcribed)
        await ctx.log(`Voice notes transcribed: ${n.transcribed}, giving ${guided.hints} hints`);
      if (n.reused)
        await ctx.log(`Voice notes transcribed before: ${n.reused}, ${guided.hints} hints`);
      if (n.untranscribed)
        await ctx.log(
          `${n.untranscribed} voice ${n.untranscribed === 1 ? 'note was' : 'notes were'} not transcribed: no speech service is set up`,
        );
    }
    await ctx.log(`Booting ${ctx.project.name} in headless js-dos`);
    const result = await deps.pool.use(
      bundle,
      async (emu) => {
        const readGrid = async () => {
          const shot = await emu.screenshot();
          const grid = decodeScreen(shot.rgba, shot.width, shot.height);
          return grid;
        };
        // The first screen with something on it, once it has settled.
        const r = await waitForStableScreen(emu, {
          maxWaitMs: 60_000,
          until: (s) => s.text.some((l) => l.trim() !== ''),
        });
        if (ctx.signal.aborted) throw ctx.signal.reason;
        await ctx.emit('screen', {
          fingerprint: r.screen.fingerprint,
          text: r.screen.text,
          grid: toWire(await readGrid()),
        });
        await ctx.log(
          `First screen: ${r.screen.text.find((l) => l.trim() !== '')?.trim() ?? '(blank)'}`,
        );
        await ctx.log(
          values.source === 'model'
            ? 'Exploring. The language model proposes the values typed into fields.'
            : 'Exploring. No language model is set up, so field values come from the data files.',
        );
        let last = r.screen.text.join('\n');
        const onObservation = async (o: PossessorObservation) => {
          // The stored row's id goes with the live event: the page fetches its data diff (Prompt 51).
          let id: string | undefined;
          if (db)
            [{ id }] = (await db
              .insert(observations)
              .values({
                projectId: ctx.projectId,
                seq: seq++,
                keys: o.keys,
                screenBeforeFp: o.screenBefore.fingerprint,
                screenAfterFp: o.screenAfter.fingerprint,
                screenBefore: o.screenBefore,
                screenAfter: o.screenAfter,
                dbfDiff: o.dbfDiff,
                durationMs: Math.max(0, Math.round(o.durationMs)),
                stable: o.stable,
                ...(o.hint ? { hint: { text: o.hint, from: 'seance' } } : {}),
              })
              .returning({ id: observations.id })) as [{ id: string }];
          await ctx.emit('observation', {
            ...(id ? { id } : {}),
            fromFingerprint: o.screenBefore.fingerprint,
            step: o.step,
            kind: o.kind,
            label: o.label,
            keys: o.keys,
            from: o.screenBefore.model.title?.name ?? '',
            to: o.screenAfter.model.title?.name ?? '',
            fingerprint: o.screenAfter.fingerprint,
            newScreen: o.newScreen,
            changed: o.changed,
            errors: o.errors,
            // What changed, only for an action that changed data: a few records (Prompt 51).
            ...(o.changed.length
              ? {
                  diff: {
                    tables: Object.fromEntries(
                      o.changed.map((f) => [f, o.dbfDiff.tables[f]!]).filter(([, t]) => t),
                    ),
                    unchanged: [],
                    addedTables: o.dbfDiff.addedTables,
                    removedTables: o.dbfDiff.removedTables,
                  },
                }
              : {}),
            ...(o.hint ? { hint: o.hint } : {}),
            screens: o.totals.screens,
            titles: o.totals.titles,
            saves: o.totals.saves,
            guided: o.totals.guided,
            refused: o.totals.refused,
          });
          // The live view gets the screen whenever it looks different.
          const now = o.screenAfter.text.join('\n');
          if (now !== last) {
            last = now;
            await ctx.emit('screen', {
              fingerprint: o.screenAfter.fingerprint,
              text: o.screenAfter.text,
              grid: toWire(await readGrid()),
            });
          }
        };
        return possess(emu, {
          values,
          ...(guided.guide.length ? { guide: guided.guide } : {}),
          maxActions: deps.maxActions ?? DEFAULT_MAX_ACTIONS,
          probesPerField: deps.probesPerField ?? DEFAULT_PROBES,
          // Probing a field often finds nothing new a few times in a row before it finds a rule.
          idleLimit: 40,
          ...(deps.record ? { record: deps.record } : {}),
          signal: ctx.signal,
          onObservation,
          onLog: (m) => ctx.log(m),
        });
      },
      dosTime ? { dosTime } : {},
    );
    if (ctx.signal.aborted) throw ctx.signal.reason;
    // Kept, and added to what earlier runs found (Prompt 52).
    const kept = db ? await saveGraph(db, ctx.projectId, result.graph) : result.graph;
    await ctx.log(
      `Possession ended (${result.stoppedBecause}): ${result.titles} screens (${result.screens} screen states), ${result.steps} actions, ${result.saves} that changed data`,
    );
    return {
      status: 'done',
      output: {
        screens: result.screens,
        titles: result.titles,
        steps: result.steps,
        saves: result.saves,
        stoppedBecause: result.stoppedBecause,
        firstChange: result.firstChange,
        refused: result.refused,
        guided: {
          seances: guided.seances,
          steps: guided.guide.filter((g) => !g.home).length,
          hints: guided.hints,
          notes: guided.notes,
        },
        values: values.source,
        graph: result.graph,
        keptScreens: kept.nodes.length,
      },
    };
  };
}

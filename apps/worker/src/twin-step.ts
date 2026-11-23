// The twin-replay step (Prompt 77): Ghost Twin's comparison. Each twin event the shop's capture
// tool sent is replayed in the reborn app (replayTwin in @afterlife/oracle) from the shop's own
// records, and its result kept: matched, mismatched or unknown. A change no action of the Soul
// explains goes to the Archaeologist as a new observation: the Soul keeps learning. Events that
// arrive while it runs are replayed before it ends.
import type { SnapshotDiff } from '@afterlife/dbf';
import { and, asc, desc, eq, observations, sql, souls, twinEvents, type Db } from '@afterlife/db';
import { replayTwin, type TwinOutcome } from '@afterlife/oracle';
import { SoulSchema } from '@afterlife/soul';
import { tablesFromBundle } from '@afterlife/vessel';
import type { StepContext, StepHandler } from './registry';

const NO_SCREEN = { fingerprint: 'fp_0000000000000000', text: [], model: null, cursor: null };

export function twinReplayStep(deps: {
  db: Db;
  bundleFor: (p: StepContext['project'], projectId: string) => Promise<Uint8Array | null>;
}): StepHandler {
  return async (ctx) => {
    const [row] = await deps.db
      .select({ version: souls.version, ir: souls.ir })
      .from(souls)
      .where(eq(souls.projectId, ctx.projectId))
      .orderBy(desc(souls.version))
      .limit(1);
    if (!row) return { status: 'skipped', reason: 'This project has no Soul yet' };
    const soul = SoulSchema.parse(row.ir);
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle)
      return { status: 'skipped', reason: 'There are no data files for this project yet' };
    const records = Object.fromEntries(
      Object.entries(tablesFromBundle(bundle, soul)).map(([f, t]) => [f.toUpperCase(), t.records]),
    );
    const counts = { replayed: 0, matched: 0, mismatched: 0, unknown: 0 };
    // Again while new events came in during the run.
    for (let round = 0; round < 10; round++) {
      ctx.signal.throwIfAborted();
      const rows = await deps.db
        .select()
        .from(twinEvents)
        .where(eq(twinEvents.projectId, ctx.projectId))
        .orderBy(asc(twinEvents.seq));
      const pending = new Set(rows.filter((r) => r.newResult === null).map((r) => r.seq));
      if (!pending.size) break;
      // Every event in order, so the twin's records are the shop's when each pending one comes.
      const results = await replayTwin(
        soul,
        records,
        rows.map((r) => ({
          seq: r.seq,
          occurredAt: r.occurredAt.toISOString(),
          diff: (r.event as { diff: SnapshotDiff }).diff,
        })),
        { today: (e) => e.occurredAt.slice(0, 10) },
      );
      for (const res of results.filter((x) => pending.has(x.seq))) {
        const ev = rows.find((r) => r.seq === res.seq)!;
        await store(deps.db, ctx, ev.id, ev.event, res);
        counts.replayed++;
        counts[res.outcome]++;
      }
    }
    await ctx.log(
      counts.replayed
        ? `Twin: ${counts.replayed} replayed, ${counts.matched} matched, ${counts.mismatched} mismatched, ${counts.unknown} unknown`
        : 'Twin: nothing new to replay',
      counts.mismatched ? 'warn' : 'info',
    );
    return { status: 'done', output: { soulVersion: row.version, ...counts } };
  };
}

async function store(db: Db, ctx: StepContext, id: string, event: unknown, r: TwinOutcome) {
  const result = {
    outcome: r.outcome,
    ...(r.actionId ? { actionId: r.actionId } : {}),
    ...(r.inputs ? { inputs: r.inputs } : {}),
    ...(r.effects ? { effects: r.effects } : {}),
    ...(r.differences ? { differences: r.differences.slice(0, 50) } : {}),
    ...(r.reason ? { reason: r.reason } : {}),
  };
  await db
    .update(twinEvents)
    .set({
      newResult: result,
      matched: r.outcome === 'unknown' ? null : r.outcome === 'matched',
    })
    .where(eq(twinEvents.id, id));
  if (r.outcome === 'unknown') {
    // New evidence for the Archaeologist, once per event.
    const hint = {
      from: 'twin',
      text: `twin event ${r.seq}: ${r.reason ?? 'no action explains it'}`,
    };
    const [had] = await db
      .select({ id: observations.id })
      .from(observations)
      .where(
        and(
          eq(observations.projectId, ctx.projectId),
          sql`${observations.hint}->>'text' = ${hint.text}`,
        ),
      )
      .limit(1);
    if (!had) {
      const [{ next }] = (await db
        .select({ next: sql<number>`coalesce(max(${observations.seq}), -1) + 1` })
        .from(observations)
        .where(eq(observations.projectId, ctx.projectId))) as [{ next: number }];
      await db.insert(observations).values({
        projectId: ctx.projectId,
        seq: Number(next),
        keys: '',
        screenBeforeFp: NO_SCREEN.fingerprint,
        screenAfterFp: NO_SCREEN.fingerprint,
        screenBefore: NO_SCREEN,
        screenAfter: NO_SCREEN,
        dbfDiff: (event as { diff: SnapshotDiff }).diff,
        durationMs: 0,
        stable: true,
        hint,
      });
    }
  }
  await ctx.emit('twin', {
    stage: 'replayed',
    seq: r.seq,
    outcome: r.outcome,
    ...(r.actionId ? { actionId: r.actionId } : {}),
    ...(r.differences?.length ? { differences: r.differences.slice(0, 5) } : {}),
    ...(r.reason ? { reason: r.reason } : {}),
  });
}

// The rebirth step (Prompt 63): the Surgeon compiles the project's newest Soul into the reborn
// app. It runs on a copy of the old app's records (the Vessel's own records are the server's and
// the phones'; this never writes to them), and its report is the step's output: the Vessel URL,
// the actions published, the rules compiled and each smoke test.
import { operate } from '@afterlife/crew';
import { latestSoulRow, type Db } from '@afterlife/db';
import { MemoryEntityStore, seedStore } from '@afterlife/vessel';
import { SoulSchema } from '@afterlife/soul';
import { graveyardDosTime } from './possess';
import type { StepContext, StepHandler } from './registry';

export const NO_ACTIONS = 'The Soul has no actions yet, so there is no app to publish';

export function rebirthStep(deps: {
  db: Db;
  bundleFor: (p: StepContext['project'], projectId: string) => Promise<Uint8Array | null>;
}): StepHandler {
  return async (ctx) => {
    const row = await latestSoulRow(deps.db, ctx.projectId);
    if (!row) return { status: 'skipped', reason: 'This project has no Soul yet' };
    const bundle = await deps.bundleFor(ctx.project, ctx.projectId);
    if (!bundle)
      return {
        status: 'skipped',
        reason: 'The records of an uploaded app come with the Undertaker',
      };
    const store = new MemoryEntityStore();
    // Only what a valid Soul names; an invalid one is the Surgeon's to report.
    const parsed = SoulSchema.safeParse(row.ir);
    // Nothing to compile yet (a short possession saved nothing): not a failure of the Surgeon.
    if (parsed.success && !parsed.data.actions.length)
      return { status: 'skipped', reason: NO_ACTIONS };
    if (parsed.success) await seedStore(store, bundle, parsed.data);
    const today =
      (ctx.project.dosTime ?? graveyardDosTime(ctx.project) ?? '').slice(0, 10) ||
      new Date().toISOString().slice(0, 10);
    const url = `/vessel/${ctx.projectId}`;
    const r = await operate(row.ir, store, { today, url });
    const failed = r.compiled.filter((c) => !c.ok);
    await ctx.log(`Compiled ${r.compiled.length} rules of Soul version ${row.version}`);
    for (const c of failed) await ctx.log(`Rule ${c.id} does not compile: ${c.error}`, 'warn');
    for (const s of r.smoke)
      await ctx.log(
        s.ok
          ? `Smoke test "${s.name}": went through (${Object.entries(s.wrote ?? {})
              .map(([f, n]) => `${f} ${n}`)
              .join(', ')})`
          : `Smoke test "${s.name}": ${s.error ?? `refused: ${(s.refused ?? []).join('; ')}`}`,
        s.ok ? 'info' : 'warn',
      );
    for (const p of r.problems) await ctx.log(p, 'warn');
    // Not reborn yet (Prompt 81): when every action left out is only waiting for a rule the old
    // app's arithmetic needs, nothing is wrong with the step: it says so, and the data still moves
    // and the Exorcist still looks. Any other reason is a failure.
    if (!r.published && r.smoke.length && r.smoke.every((s) => s.ok || s.notReborn)) {
      await ctx.log(`Nothing is reborn yet: ${r.problems.join('; ')}`, 'warn');
      return {
        status: 'done',
        output: {
          url: null,
          soulVersion: row.version,
          published: false,
          actions: r.smoke.map((s) => ({ id: s.actionId, name: s.name, ok: s.ok })),
          rules: { compiled: r.compiled.length, failed: failed.length },
          problems: r.problems,
          config: null,
          smoke: r.smoke,
          compiled: r.compiled,
        },
      };
    }
    if (!r.published) return { status: 'failed', reason: r.problems.join('; ') };
    const published = r.config!.actions.length;
    await ctx.log(
      `Reborn: ${published} ${published === 1 ? 'action' : 'actions'} published at ${url}`,
    );
    return {
      status: 'done',
      output: {
        url,
        soulVersion: row.version,
        published: true,
        actions: r.smoke.map((s) => ({ id: s.actionId, name: s.name, ok: s.ok })),
        rules: { compiled: r.compiled.length, failed: failed.length },
        problems: r.problems,
        config: r.config,
        smoke: r.smoke,
        compiled: r.compiled,
      },
    };
  };
}

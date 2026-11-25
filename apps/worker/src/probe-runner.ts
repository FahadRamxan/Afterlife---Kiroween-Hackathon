// The Possessor running the Archaeologist's probes (review of 51-60, finding 3). For each bill the
// planner works out (a subtotal of exactly 5000), it boots the old app fresh, takes it to the
// action's screen by the stored screen graph, types the action's macro filled in with the plan,
// and keeps every step as an observation, as possession does. The Archaeologist then checks the
// new observations like the others: the old app's own numbers decide.
import {
  probePlanner,
  replayPath,
  type EffectObservation,
  type RuleProbe,
  type ScreenGraphJson,
} from '@afterlife/crew';
import type { DbfRecord, SnapshotDiff } from '@afterlife/dbf';
import { observations, type Db } from '@afterlife/db';
import { keySteps, recordAction, waitForStableScreen, type Observation } from '@afterlife/emulator';
import { expandMacro, type Rule, type Soul } from '@afterlife/soul';
import { MemoryEntityStore, type ActionInputs } from '@afterlife/vessel';
import type { EmulatorPool } from './possess';

/** At most this many bills are typed per round (each boots the app). */
export const MAX_PROBE_BILLS = 8;

const changed = (d: SnapshotDiff) =>
  Object.values(d.tables).some((t) => t.inserted.length || t.updated.length || t.deleted.length);

export type ProbeRunDeps = {
  db: Db;
  pool: EmulatorPool;
  projectId: string;
  bundle: Uint8Array;
  dosTime: string | undefined;
  /** The old app's records (from its bundle): the planner previews bills on them. */
  tables: Record<string, DbfRecord[]>;
  graph: ScreenGraphJson;
  /** The Soul so far: its entities and actions (the rules come with each round). */
  draft: Omit<Soul, 'rules'>;
  /** The next observation's seq. */
  nextSeq: () => number;
  log: (m: string, level?: 'info' | 'warn') => Promise<void>;
  signal?: AbortSignal;
  /** Types one bill into the old app (tests give a fake; by default a freshly booted emulator). */
  type?: (action: Soul['actions'][number], inputs: ActionInputs) => Promise<Observation[]>;
};

/** Types one planned bill into a freshly booted old app. Gives the steps it observed. */
export async function typeBill(
  d: Pick<ProbeRunDeps, 'pool' | 'bundle' | 'graph' | 'dosTime' | 'signal'>,
  action: Soul['actions'][number],
  inputs: ActionInputs,
): Promise<Observation[]> {
  return d.pool.use(
    d.bundle,
    async (emu) => {
      const first = await waitForStableScreen(emu, {
        maxWaitMs: 60_000,
        until: (s) => s.text.some((l) => l.trim() !== ''),
      });
      await replayPath(emu, d.graph, first.screen.fingerprint, action.screen);
      const steps: Observation[] = [];
      for (const k of keySteps(expandMacro(action.keys, inputs))) {
        if (d.signal?.aborted) throw d.signal.reason;
        steps.push(await recordAction(emu, k));
      }
      return steps;
    },
    d.dosTime ? { dosTime: d.dosTime } : {},
  );
}

/**
 * Runs the probes: plans each value's bills on the old app's records with the rules found so far,
 * types them into the old app until one saves, and stores the steps as observations. Gives the
 * observations that changed data, for the Archaeologist to check.
 */
export function probeRunner(d: ProbeRunDeps) {
  // A bill already typed, in this round or an earlier one, is not typed again (a GST of 2.12 is
  // the bill of 12.50): if the old app saved it, the value is seen; if not, the next plan is tried.
  const done = new Map<string, boolean>();
  return async (probes: RuleProbe[], rules: Rule[]): Promise<EffectObservation[]> => {
    const soul: Soul = { ...d.draft, rules };
    const store = new MemoryEntityStore();
    for (const [file, records] of Object.entries(d.tables)) await store.load(file, records);
    const today = (d.dosTime ?? '').slice(0, 10);
    const plan = await probePlanner(soul, store, today);
    const out: EffectObservation[] = [];
    const type = d.type ?? ((a: Soul['actions'][number], i: ActionInputs) => typeBill(d, a, i));
    let typed = 0;
    for (const probe of probes)
      for (const p of await plan(probe)) {
        const action = soul.actions.find((a) => a.id === p.actionId)!;
        for (const inputs of p.inputs) {
          const id = `${p.actionId} ${JSON.stringify(inputs)}`;
          if (done.get(id)) break;
          if (done.has(id)) continue;
          if (typed >= MAX_PROBE_BILLS) return out;
          done.set(id, false);
          typed++;
          const lines = (inputs.lines ?? []).map((l) => Object.values(l).join(' x ')).join(', ');
          let steps: Observation[];
          try {
            steps = await type(action, inputs);
          } catch (e) {
            if (d.signal?.aborted) throw e;
            await d.log(
              `Probe ${probe.field} = ${p.value} (${lines}) could not be typed: ${(e as Error).message}`,
              'warn',
            );
            continue;
          }
          let saved = false;
          for (const o of steps) {
            const [row] = await d.db
              .insert(observations)
              .values({
                projectId: d.projectId,
                seq: d.nextSeq(),
                keys: o.keys,
                screenBeforeFp: o.screenBefore.fingerprint,
                screenAfterFp: o.screenAfter.fingerprint,
                screenBefore: o.screenBefore,
                screenAfter: o.screenAfter,
                dbfDiff: o.dbfDiff,
                durationMs: Math.max(0, Math.round(o.durationMs)),
                stable: o.stable,
                hint: { text: `probe: ${probe.field} = ${p.value}`, from: 'probe' },
              })
              .returning({ id: observations.id });
            if (changed(o.dbfDiff)) {
              saved = true;
              out.push({
                id: row!.id,
                keys: o.keys,
                screenBefore: o.screenBefore,
                dbfDiff: o.dbfDiff,
              });
            }
          }
          await d.log(
            saved
              ? `Probe ${probe.field} = ${p.value}: typed ${lines} into the old app, which saved it`
              : `Probe ${probe.field} = ${p.value}: the old app did not save ${lines}`,
            saved ? 'info' : 'warn',
          );
          if (saved) {
            done.set(id, true);
            break;
          }
        }
      }
    return out;
  };
}

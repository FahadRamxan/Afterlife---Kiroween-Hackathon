// Ghost Twin's replay (Prompt 77): for each change the shop's old app made (a twin event), work out
// which action it was from the shape of its diff, give the reborn app the same inputs, and compare
// what it would do with what the old app did. The Vessel's records follow the old app's: after
// each event the old app's own change is applied, so one mismatch does not throw off the rest.
import type { DbfRecord, DbfValue, SnapshotDiff } from '@afterlife/dbf';
import { macroFields, type Soul } from '@afterlife/soul';
import { MemoryEntityStore, actionForm, createVessel, type ActionInputs } from '@afterlife/vessel';
import { effectDifferences, type Difference } from './compare';

export type TwinInput = { seq: number; occurredAt: string; diff: SnapshotDiff };
export type TwinOutcome = {
  seq: number;
  outcome: 'matched' | 'mismatched' | 'unknown';
  actionId?: string;
  inputs?: ActionInputs;
  /** What the reborn app would have written. */
  effects?: SnapshotDiff;
  differences?: Difference[];
  reason?: string;
};

const str = (v: DbfValue | undefined) => (v === null || v === undefined ? '' : String(v).trim());
const touched = (diff: SnapshotDiff, kind: 'inserted' | 'updated' | 'deleted') =>
  new Set(
    Object.entries(diff.tables)
      .filter(([, t]) => t[kind].length)
      .map(([f]) => f),
  );
const same = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));

/** The actions whose effects have this diff's shape: the same files written, the ones updated among theirs. */
export function candidateActions(soul: Soul, diff: SnapshotDiff): string[] {
  const inserted = touched(diff, 'inserted');
  const updated = touched(diff, 'updated');
  const fileOf = (id: string) => soul.entities.find((e) => e.id === id)?.file;
  return soul.actions
    .filter((a) => {
      const ins = new Set(
        a.effects.filter((x) => x.kind === 'insert').map((x) => fileOf(x.entity)!),
      );
      const upd = new Set(
        a.effects.filter((x) => x.kind === 'update').map((x) => fileOf(x.entity)!),
      );
      return (
        same(ins, inserted) &&
        [...updated].every((f) => upd.has(f)) &&
        (ins.size > 0 || updated.size > 0)
      );
    })
    .map((a) => a.id);
}

/** The inputs the owner typed for this action, read back from what the old app wrote. */
export function inputsFromDiff(
  soul: Soul,
  actionId: string,
  diff: SnapshotDiff,
): ActionInputs | null {
  const action = soul.actions.find((a) => a.id === actionId);
  if (!action) return null;
  let form;
  try {
    form = actionForm(soul, actionId);
  } catch {
    return null;
  }
  const typed = macroFields(action.keys);
  const header = diff.tables[form.header.entity.file]?.inserted[0]?.values;
  if (!header) return null;
  const values = Object.fromEntries(
    typed.record.filter((f) => f in header).map((f) => [f, str(header[f])]),
  );
  if (!form.line) return { values };
  const lines = [...(diff.tables[form.line.entity.file]?.inserted ?? [])]
    .sort((a, b) => a.recno - b.recno)
    .map((r) =>
      Object.fromEntries(typed.line.filter((f) => f in r.values).map((f) => [f, str(r.values[f])])),
    );
  return { values, lines };
}

/** Replays the shop's events, in order, in a Vessel that starts from `records` and follows the old app. */
export async function replayTwin(
  soul: Soul,
  records: Record<string, DbfRecord[]>,
  events: TwinInput[],
  opts: { today: (e: TwinInput) => string },
): Promise<TwinOutcome[]> {
  const store = new MemoryEntityStore();
  for (const [f, r] of Object.entries(records)) await store.load(f, r);
  const out: TwinOutcome[] = [];
  for (const e of [...events].sort((a, b) => a.seq - b.seq)) {
    const vessel = createVessel(soul, store, { today: () => opts.today(e) });
    const candidates = candidateActions(soul, e.diff);
    let result: TwinOutcome;
    if (!candidates.length) {
      const files = [
        ...new Set([
          ...touched(e.diff, 'inserted'),
          ...touched(e.diff, 'updated'),
          ...touched(e.diff, 'deleted'),
        ]),
      ];
      result = {
        seq: e.seq,
        outcome: 'unknown',
        reason: `No action of the Soul changes ${files.join(', ') || 'these files'} this way`,
      };
    } else {
      let best: TwinOutcome | null = null;
      for (const actionId of candidates) {
        const inputs = inputsFromDiff(soul, actionId, e.diff);
        if (!inputs) continue;
        const r = await vessel.previewAction(actionId, inputs);
        if (r.ok) {
          const differences = effectDifferences(e.diff, r.effects);
          const tried: TwinOutcome = {
            seq: e.seq,
            outcome: differences.length ? 'mismatched' : 'matched',
            actionId,
            inputs,
            effects: r.effects,
            ...(differences.length ? { differences } : {}),
          };
          if (!differences.length) {
            best = tried;
            break;
          }
          if (!best || (best.differences?.length ?? Infinity) > differences.length) best = tried;
        } else if (!best) {
          best = {
            seq: e.seq,
            outcome: 'mismatched',
            actionId,
            inputs,
            reason: `The reborn app refuses it: ${r.refused.map((x) => x.message).join('; ')}`,
          };
        }
      }
      result = best ?? {
        seq: e.seq,
        outcome: 'unknown',
        reason: 'Its inputs cannot be read from the change',
      };
    }
    out.push(result);
    // The twin follows the shop: the old app's own change, whatever the reborn app would have done.
    try {
      await store.commit(e.diff);
    } catch (err) {
      out[out.length - 1] = {
        ...result,
        reason: `${result.reason ? `${result.reason}. ` : ''}The records no longer follow the old app's: ${(err as Error).message}`,
      };
    }
  }
  return out;
}

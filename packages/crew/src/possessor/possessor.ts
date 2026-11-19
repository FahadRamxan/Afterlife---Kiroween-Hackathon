// The Possessor (Prompt 48, crew.md): drives the old app's keyboard and maps every screen.
// 1. read the screen (ScreenModel)
// 2. pick the next untried action on it (frontier: fill the waiting field, keys that may save,
//    menu items, other keys); when this screen has none left, walk the screen graph to the nearest
//    screen that has some, or go back with Esc
// 3. ask the value chooser (the LLM) only for what to type into a field
// 4. record the observation (keys, screens before and after, the data diff)
// 5. add the edge to the screen graph
// It stops when nothing new has been found for `idleLimit` actions, the action budget is used up,
// or every reachable screen has been tried. Menu items and keys that leave the program are never
// pressed, and Esc is never pressed on the first screen.
import {
  observeScreen,
  recordAction,
  type EmulatorController,
  type Observation,
  type ObservedScreen,
  type RecordOptions,
} from '@afterlife/emulator';
import { screenActions, type PossessAction } from './actions';
import { ScreenGraph, type ScreenGraphJson } from './graph';
import { readSamples, type DataSample, type ValueChooser } from './values';

/** Why a step was taken: exploring, walking back to a screen, going back, or a guided replay. */
export type StepKind = 'explore' | 'walk' | 'back' | 'guide';

export type PossessorObservation = Observation & {
  /** From 1. */
  step: number;
  kind: StepKind;
  /** What it was, in a few words ("2 Stock", "F2=Save bill", "Code = PAN500", "Esc"). */
  label: string;
  /** The screen after had never been seen before. */
  newScreen: boolean;
  /** Data files whose records changed. */
  changed: string[];
  /** Error lines the app showed after the keys (the status line in red). */
  errors: string[];
  /** So far, this step included: screens found, and actions that changed data. */
  totals: { screens: number; saves: number };
};

export type StopReason = 'explored' | 'idle' | 'budget' | 'stuck' | 'aborted';

export type PossessResult = {
  graph: ScreenGraphJson;
  steps: number;
  screens: number;
  /** Actions that changed a data file. */
  saves: number;
  stoppedBecause: StopReason;
  /** The step at which each kind of data change was first seen ("BILLS.DBF:inserted": 9). */
  firstChange: Record<string, number>;
  /** Each error the app showed, once, with the step and the action that caused it. */
  refused: { text: string; step: number; label: string }[];
};

export type PossessOptions = {
  values: ValueChooser;
  /** At most this many key sequences in all (default 80). */
  maxActions?: number;
  /** Stop after this many actions in a row found nothing new (default 20). */
  idleLimit?: number;
  record?: RecordOptions;
  signal?: AbortSignal;
  onObservation?: (o: PossessorObservation) => Promise<void> | void;
  onLog?: (message: string) => Promise<void> | void;
  /**
   * Key sequences to press first, in order, before exploring (a séance's recorded path, Prompt
   * 50). A sequence that would leave the program is skipped.
   */
  guide?: { keys: string; label?: string }[];
  /**
   * How many values to type into each field (Prompt 49): the first to get through, then
   * boundary values once the screen has nothing else left to try. Default 1.
   */
  probesPerField?: number;
};

const tableChanges = (o: Observation): string[] =>
  Object.entries(o.dbfDiff.tables).flatMap(([file, t]) => [
    ...(t.inserted.length ? [`${file}:inserted`] : []),
    ...(t.deleted.length ? [`${file}:deleted`] : []),
    ...(t.updated.length ? [`${file}:changed`] : []),
  ]);

const title = (s: ObservedScreen) => s.model.title?.name?.trim() || '(no title)';
const lines = (s: ObservedScreen) => s.text.map((l) => l.trimEnd()).filter((l) => l.trim() !== '');

export async function possess(
  emu: EmulatorController,
  opts: PossessOptions,
): Promise<PossessResult> {
  const maxActions = opts.maxActions ?? 80;
  const idleLimit = opts.idleLimit ?? 20;
  const probesPerField = Math.max(1, opts.probesPerField ?? 1);
  const refused: PossessResult['refused'] = [];
  const log = async (m: string) => {
    await opts.onLog?.(m);
  };
  let screen = await observeScreen(emu);
  const graph = new ScreenGraph(screen.fingerprint, title(screen));
  /** The newest model of each screen: what its untried actions are worked out from. */
  const models = new Map<string, ObservedScreen>([[screen.fingerprint, screen]]);
  const tried = new Map<string, Set<string>>();
  const typed = new Map<string, string[]>();
  const seenChanges = new Map<string, number>();
  const seenErrors = new Set<string>();
  let samples: DataSample[] | null = null;
  let steps = 0;
  let idle = 0;
  let saves = 0;

  const untried = (fp: string): PossessAction[] => {
    const m = models.get(fp);
    if (!m) return [];
    const done = tried.get(fp) ?? new Set();
    const all = screenActions(m.model, m.text);
    const left = all.filter((a) => !done.has(a.id));
    if (left.length) return left;
    // Everything else here is tried: the field again, with the next boundary value (Prompt 49).
    const fill = all.find((a) => a.kind === 'fill');
    const n = fill ? (typed.get(`${fp}:${fill.id}`)?.length ?? 0) : 0;
    const probeId = fill ? `${fill.id}#${n}` : '';
    // A probe can be given up like any other action (a walk to its screen that no longer works).
    return fill && n < probesPerField && !done.has(probeId) ? [{ ...fill, id: probeId }] : [];
  };
  const mark = (fp: string, id: string) => tried.set(fp, (tried.get(fp) ?? new Set()).add(id));

  /** Presses keys and records it. False when the budget is used up or the run was stopped. */
  const act = async (
    keys: string,
    kind: StepKind,
    label: string,
  ): Promise<PossessorObservation> => {
    const obs = await recordAction(emu, keys, opts.record);
    steps++;
    const before = screen.fingerprint;
    screen = obs.screenAfter;
    models.set(screen.fingerprint, screen);
    graph.edge(before, screen.fingerprint, obs.keys);
    const newScreen = graph.visit(screen.fingerprint, title(screen), steps);
    const changes = tableChanges(obs);
    const changed = [...new Set(changes.map((c) => c.split(':')[0]!))];
    const errors = obs.screenAfter.model.messages
      .filter((m) => m.kind === 'error')
      .map((m) => m.text.trim());
    let found = newScreen;
    for (const c of changes)
      if (!seenChanges.has(c)) {
        seenChanges.set(c, steps);
        found = true;
      }
    for (const e of errors)
      if (!seenErrors.has(e)) {
        seenErrors.add(e);
        refused.push({ text: e, step: steps, label });
        found = true;
      }
    if (changed.length) saves++;
    idle = found ? 0 : idle + 1;
    const o: PossessorObservation = {
      ...obs,
      step: steps,
      kind,
      label,
      newScreen,
      changed,
      errors,
      totals: { screens: graph.nodes.size, saves },
    };
    await opts.onObservation?.(o);
    if (newScreen) await log(`New screen: ${title(screen)}`);
    if (changed.length) await log(`${label} changed ${changed.join(', ')}`);
    for (const e of errors) await log(`The app said: ${e}`);
    return o;
  };

  const stopNow = (): StopReason | null => {
    if (opts.signal?.aborted) return 'aborted';
    if (steps >= maxActions) return 'budget';
    if (idle >= idleLimit) return 'idle';
    return null;
  };

  /** Esc, and Enter when Esc did nothing (a "press any key" notice). False when stuck. */
  const back = async (): Promise<boolean> => {
    const from = screen.fingerprint;
    await act('{Esc}', 'back', 'Esc');
    if (screen.fingerprint !== from || stopNow()) return true;
    await act('{Enter}', 'back', 'Enter');
    return screen.fingerprint !== from;
  };

  const result = (stoppedBecause: StopReason): PossessResult => ({
    graph: graph.toJSON(),
    steps,
    screens: graph.nodes.size,
    saves,
    stoppedBecause,
    firstChange: Object.fromEntries(seenChanges),
    refused,
  });

  // A séance's path first (Prompt 50): the owner knows the way to the screens that matter.
  for (const g of opts.guide ?? []) {
    const stop = stopNow();
    if (stop) return result(stop);
    await act(g.keys, 'guide', g.label ?? g.keys);
  }

  for (;;) {
    const stop = stopNow();
    if (stop) return result(stop);
    const here = untried(screen.fingerprint);
    const next = here[0];
    if (next) {
      mark(screen.fingerprint, next.id);
      if (next.kind === 'fill') {
        samples ??= await readSamples(emu);
        const key = `${screen.fingerprint}:${next.id.split('#')[0]}`;
        const chosen = await opts.values.choose({
          field: next.field,
          title: title(screen),
          screen: lines(screen),
          samples,
          tried: typed.get(key) ?? [],
        });
        const { value, why } =
          typeof chosen === 'string' ? { value: chosen, why: undefined } : chosen;
        typed.set(key, [...(typed.get(key) ?? []), value]);
        const label =
          `${next.field.label || 'field'} = ${value === '' ? '(blank)' : value}` +
          (why && why !== 'typical' ? ` (${why})` : '');
        await act(value.replaceAll('{', '{{}') + '{Enter}', 'explore', label);
      } else
        await act(
          next.keys,
          'explore',
          next.kind === 'menu' ? `${next.keys} ${next.label}` : next.label,
        );
      continue;
    }
    // Nothing left here: the nearest screen that still has something, by the keys that led there.
    const path = graph.pathTo(screen.fingerprint, (fp) => untried(fp).length > 0);
    if (path && path.length <= 8) {
      for (const e of path) {
        if (stopNow()) break;
        await act(e.keys, 'walk', `walk: ${e.keys}`);
        if (screen.fingerprint !== e.to) break; // the app went elsewhere; decide again from here
      }
      // A path that does not lead where it did before (its screen needed some state) is dropped.
      if (screen.fingerprint !== path.at(-1)!.to) {
        const target = path.at(-1)!.to;
        for (const a of untried(target)) mark(target, a.id);
      }
      continue;
    }
    if (screen.fingerprint === graph.root) return result('explored');
    if (!(await back())) {
      await log(`Esc and Enter do nothing on ${title(screen)}`);
      return result('stuck');
    }
  }
}

// Getting back to any screen the Possessor found (Prompt 52): the Oracle and Ghost Twin need to
// reach a screen quickly. `replayPath` presses the shortest key path in the screen graph from
// where the app is to the target, checking the screen after every step. An edge that led
// elsewhere this time (its keys needed some state: a code already on the bill) is set aside and
// the path is planned again from where the app is now.
import {
  observeScreen,
  recordAction,
  type EmulatorController,
  type RecordOptions,
} from '@afterlife/emulator';
import type { GraphEdge, ScreenGraphJson } from './graph';

export class ReplayError extends Error {
  override readonly name = 'ReplayError';
  constructor(
    message: string,
    readonly at: string,
    readonly pressed: string[],
  ) {
    super(message);
  }
}

/** The shortest path of edges from `from` to `to`, leaving out `skip` edges. Null if none. */
export function shortestPath(
  graph: Pick<ScreenGraphJson, 'edges'>,
  from: string,
  to: string,
  skip: Set<string> = new Set(),
): GraphEdge[] | null {
  if (from === to) return [];
  const out = new Map<string, GraphEdge[]>();
  for (const e of graph.edges) {
    if (e.from === e.to || skip.has(edgeId(e))) continue;
    out.set(e.from, [...(out.get(e.from) ?? []), e]);
  }
  // The edge seen most often first, so the surest way wins a tie.
  for (const list of out.values()) list.sort((a, b) => b.count - a.count);
  const prev = new Map<string, GraphEdge>();
  const seen = new Set([from]);
  const queue = [from];
  while (queue.length) {
    const at = queue.shift()!;
    for (const e of out.get(at) ?? []) {
      if (seen.has(e.to)) continue;
      seen.add(e.to);
      prev.set(e.to, e);
      if (e.to === to) {
        const path: GraphEdge[] = [];
        for (let n = to; n !== from; n = prev.get(n)!.from) path.unshift(prev.get(n)!);
        return path;
      }
      queue.push(e.to);
    }
  }
  return null;
}

export const edgeId = (e: Pick<GraphEdge, 'from' | 'to' | 'keys'>) =>
  `${e.from}\u0000${e.keys}\u0000${e.to}`;

export type ReplayResult = { pressed: string[]; replanned: number };

/**
 * Takes the app from the screen it shows to the `to` screen, by the graph's shortest key path.
 * Throws ReplayError (with where it got to) when no path is left. `from` is checked first: the
 * app must be on it.
 */
export async function replayPath(
  emu: EmulatorController,
  graph: Pick<ScreenGraphJson, 'edges'>,
  from: string,
  to: string,
  opts: { record?: RecordOptions; maxSteps?: number } = {},
): Promise<ReplayResult> {
  let at = (await observeScreen(emu)).fingerprint;
  if (at !== from) throw new ReplayError(`The app is on ${at}, not on ${from}`, at, []);
  const pressed: string[] = [];
  const skip = new Set<string>();
  let replanned = 0;
  const maxSteps = opts.maxSteps ?? 4 * graph.edges.length + 4;
  while (at !== to) {
    const path = shortestPath(graph, at, to, skip);
    if (!path) throw new ReplayError(`No key path from ${at} to ${to}`, at, pressed);
    for (const e of path) {
      if (pressed.length >= maxSteps)
        throw new ReplayError(`Gave up after ${pressed.length} key sequences`, at, pressed);
      const o = await recordAction(emu, e.keys, opts.record);
      pressed.push(e.keys);
      at = o.screenAfter.fingerprint;
      if (at !== e.to) {
        // This edge needs a state the app is not in now: plan again from here without it.
        skip.add(edgeId(e));
        replanned++;
        break;
      }
    }
  }
  return { pressed, replanned };
}

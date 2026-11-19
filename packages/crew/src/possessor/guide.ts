// Guided possession (Prompt 50): a séance is the owner working the old app by hand, one keystroke
// at a time. The Possessor first walks the owner's path, then explores the gaps. Keys typed into
// one field ("P", "A", "N", "5", "0", "0", "{Enter}") become one step ("PAN500{Enter}"), as the
// Possessor would type them. The owner's voice notes are matched to the actions they spoke over.
import { parseKeys, printKeys } from '@afterlife/emulator';
import type { SpeechSegment } from '../speech/types';

/** What the guide needs of a séance action (an observation, as stored). */
export type SeanceAction = {
  keys: string;
  screenBefore: { fingerprint: string };
  screenAfter: { fingerprint: string };
  /** When it was pressed, in ms from the séance's start (null for séances recorded before). */
  atMs?: number | null;
};

export type GuideStep = {
  keys: string;
  label: string;
  /** The séance actions it is made of (their indexes). */
  from: number[];
  /** What the owner said while doing it. */
  hint?: string;
};

const isTyping = (keys: string): boolean => {
  const s = parseKeys(keys);
  return (
    s.length > 0 && s.every((k) => k.kind === 'text' || (k.kind === 'key' && k.key === 'Backspace'))
  );
};

/**
 * The owner's path as steps. A run of typing on one screen joins the key that ends it (Enter,
 * Tab) into one step; a key that moves to another screen is a step of its own.
 */
export function guideFromSeance(
  actions: SeanceAction[],
  hints: (string | undefined)[] = [],
): GuideStep[] {
  const steps: GuideStep[] = [];
  let typed: { keys: string; from: number[] } | null = null;
  const flush = () => {
    if (!typed) return;
    steps.push({ keys: typed.keys, label: `owner typed ${typed.keys}`, from: typed.from });
    typed = null;
  };
  actions.forEach((a, i) => {
    const same = a.screenBefore.fingerprint === a.screenAfter.fingerprint;
    if (isTyping(a.keys) && same) {
      typed = typed
        ? {
            keys: printKeys([...parseKeys(typed.keys), ...parseKeys(a.keys)]),
            from: [...typed.from, i],
          }
        : { keys: a.keys, from: [i] };
      return;
    }
    if (typed) {
      // The key that ends the typing (Enter) goes with it: one step, as the Possessor types.
      steps.push({
        keys: printKeys([...parseKeys(typed.keys), ...parseKeys(a.keys)]),
        label: `owner typed ${typed.keys} then ${a.keys}`,
        from: [...typed.from, i],
      });
      typed = null;
      return;
    }
    steps.push({ keys: a.keys, label: `owner pressed ${a.keys}`, from: [i] });
  });
  flush();
  for (const s of steps) {
    const said = [...new Set(s.from.map((i) => hints[i]).filter((h): h is string => !!h))];
    if (said.length) s.hint = said.join(' ');
  }
  return steps;
}

/**
 * Which action each voice segment belongs to: the last action pressed before the segment ended
 * (people say what they do as they do it, or just after). Segments before the first action go to
 * the first. Actions without a time (an old séance) get them all on the first action.
 * Returns, for each action, the text said over it (or undefined).
 */
export function attachHints(
  actions: Pick<SeanceAction, 'atMs'>[],
  segments: SpeechSegment[],
): (string | undefined)[] {
  const out: (string[] | undefined)[] = actions.map(() => undefined);
  if (actions.length === 0) return [];
  const timed = actions.every((a) => typeof a.atMs === 'number');
  for (const seg of [...segments].sort((a, b) => a.startMs - b.startMs)) {
    const text = seg.text.trim();
    if (!text) continue;
    let at = 0;
    if (timed)
      actions.forEach((a, i) => {
        if ((a.atMs as number) <= seg.endMs) at = i;
      });
    (out[at] ??= []).push(text);
  }
  return out.map((t) => t?.join(' '));
}

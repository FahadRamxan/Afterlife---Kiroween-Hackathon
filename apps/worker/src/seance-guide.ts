// Guided possession (Prompt 50): the owner's séances on this project become the Possessor's first
// steps, and their voice notes become hints on the actions they were spoken over. A voice note is
// transcribed once; its hints are kept on the séance's observations for the Archaeologist.
import { SEANCE_LANGUAGES, attachHints, guideFromSeance, type SpeechClient } from '@afterlife/crew';
import { observations, sessions, asc, eq, type Db } from '@afterlife/db';

export type GuideItem = { keys: string; label?: string; hint?: string; home?: boolean };

export type SeanceGuide = {
  guide: GuideItem[];
  seances: number;
  /** Voice notes turned into hints now, already before, or left as they are (no speech service). */
  notes: { transcribed: number; reused: number; untranscribed: number };
  hints: number;
};

type Hint = { text: string; language?: string; provider?: string };

export async function seanceGuide(
  db: Db,
  projectId: string,
  speech: SpeechClient | null,
  signal?: AbortSignal,
): Promise<SeanceGuide> {
  const rows = await db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, projectId))
    .orderBy(asc(sessions.startedAt));
  const out: SeanceGuide = {
    guide: [],
    seances: rows.length,
    notes: { transcribed: 0, reused: 0, untranscribed: 0 },
    hints: 0,
  };
  for (const s of rows) {
    const acts = await db
      .select()
      .from(observations)
      .where(eq(observations.sessionId, s.id))
      .orderBy(asc(observations.seq));
    if (!acts.length) continue;
    let hints: (string | undefined)[] = acts.map((a) => (a.hint as Hint | null)?.text);
    if (s.audio && s.audioMime) {
      if (hints.some(Boolean)) out.notes.reused++;
      else if (!speech) out.notes.untranscribed++;
      else {
        const t = await speech.transcribe(s.audio, s.audioMime, {
          languages: SEANCE_LANGUAGES,
          ...(signal ? { signal } : {}),
        });
        hints = attachHints(
          acts.map((a) => ({ atMs: a.offsetMs })),
          t.segments,
        );
        for (const [i, text] of hints.entries())
          if (text)
            await db
              .update(observations)
              .set({ hint: { text, language: t.language, provider: speech.provider } })
              .where(eq(observations.id, acts[i]!.id));
        out.notes.transcribed++;
      }
    }
    out.hints += hints.filter(Boolean).length;
    // Each séance started on the app's first screen: go back there before the next one.
    if (out.guide.length) out.guide.push({ keys: '', home: true });
    const path = acts.map((a) => ({
      keys: a.keys,
      screenBefore: { fingerprint: a.screenBeforeFp },
      screenAfter: { fingerprint: a.screenAfterFp },
      atMs: a.offsetMs,
    }));
    for (const g of guideFromSeance(path, hints))
      out.guide.push({ keys: g.keys, label: g.label, ...(g.hint ? { hint: g.hint } : {}) });
  }
  return out;
}

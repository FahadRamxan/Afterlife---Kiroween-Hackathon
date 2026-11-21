// @spec archaeologist-completion#2.2 The score without a model, rules included, never drops.
// Prompt 56 done when: the score is computed for all 3 samples, and this fails if it drops. It
// runs the Archaeologist without a model (entities and counters from the data files and the
// recorded possession), and compares with docs/archaeology-score.json. A higher score is fine:
// `pnpm score:archaeology --write` then records it as the new floor.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  NO_MODEL,
  SAMPLES,
  WEB_SCORE_FILE,
  readScoreFile,
  readmeBlock,
  scoreAll,
  webScores,
} from '../scripts/score-archaeology';

describe('archaeology score (no model)', () => {
  it('is computed for all three samples and has not dropped', async () => {
    const now = await scoreAll(null);
    const floor = readScoreFile()[NO_MODEL]!;
    expect(now.map((s) => s.app)).toEqual([...SAMPLES]);
    expect(floor.map((s) => s.app)).toEqual([...SAMPLES]);
    for (const s of now) {
      const was = floor.find((f) => f.app === s.app)!.score;
      expect(s.score.known, s.app).toBe(was.known);
      expect(s.score.recovered, `${s.app} recovered`).toBeGreaterThanOrEqual(was.recovered);
      expect(s.score.exact, `${s.app} exact`).toBeGreaterThanOrEqual(was.exact);
      expect(s.score.recall, `${s.app} recall`).toBeGreaterThanOrEqual(was.recall);
      if (was.precision !== null)
        expect(s.score.precision ?? 0, `${s.app} precision`).toBeGreaterThanOrEqual(was.precision);
      // Every rule recovered before is still recovered.
      for (const r of was.rules.filter((x) => x.status === 'exact' || x.status === 'equivalent'))
        expect(['exact', 'equivalent'], `${s.app} ${r.id}`).toContain(
          s.score.rules.find((x) => x.id === r.id)?.status,
        );
    }
  }, 60_000);

  it('the Graveyard page has the same numbers, and no hidden rule ids', () => {
    const web = readFileSync(WEB_SCORE_FILE, 'utf8');
    expect(JSON.parse(web)).toEqual(webScores(readScoreFile()));
    for (const s of readScoreFile()[NO_MODEL]!)
      for (const r of s.score.rules) expect(web).not.toContain(r.id);
  });

  it('the README shows the recorded score', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    expect(readme).toContain(readmeBlock(readScoreFile()));
    expect(readme).toMatch(/Afterlife recovered \d+ of 7 hidden rules in Shifa Medical Store/);
  });
});

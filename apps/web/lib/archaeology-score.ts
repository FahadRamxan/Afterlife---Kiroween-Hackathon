// The Archaeologist's score on each sample app (Prompt 56), from `pnpm score:archaeology --write`:
// how many of the app's hidden rules it recovered. Numbers only; the hidden rules stay hidden.
import { z } from 'zod';
import raw from './archaeology-score.json';

const Counts = z.object({
  recovered: z.number().int().nonnegative(),
  exact: z.number().int().nonnegative(),
  known: z.number().int().positive(),
});
const Scores = z.record(z.string(), z.record(z.string(), Counts));
export type AppScore = z.infer<typeof Counts> & {
  /** `no-model`, or the model that proposed the rules ("bedrock/us.anthropic..."). */
  mode: string;
};

/** The best score recorded for an app (a model's, when there is one), or null. */
export function scoreFor(app: string, data: unknown = raw): AppScore | null {
  const scores = Scores.parse(data);
  let best: AppScore | null = null;
  for (const [mode, apps] of Object.entries(scores)) {
    const s = apps[app];
    if (s && (!best || s.recovered > best.recovered)) best = { ...s, mode };
  }
  return best;
}

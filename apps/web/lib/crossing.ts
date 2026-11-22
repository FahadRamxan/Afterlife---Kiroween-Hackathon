// The data crossing (Prompt 66): the Undertaker's progress from its live `migration` events, and
// its report from the steps API once the undertake step is done.
import { z } from 'zod';
import type { LiveEvent } from './live';

export const CrossingSchema = z.object({
  tables: z.array(
    z.object({
      file: z.string(),
      entity: z.string(),
      read: z.number(),
      deleted: z.number(),
      migrated: z.number(),
      rejected: z.number(),
    }),
  ),
  rejected: z.array(
    z.object({
      file: z.string(),
      recno: z.number(),
      field: z.string(),
      reason: z.string(),
      fix: z.string(),
    }),
  ),
  reconciliation: z.object({
    matches: z.boolean(),
    lines: z.array(
      z.object({
        table: z.string(),
        total: z.string(),
        before: z.string(),
        rejected: z.string(),
        after: z.string(),
        ok: z.boolean(),
      }),
    ),
  }),
});
export type Crossing = z.infer<typeof CrossingSchema>;

const MigrationEvent = z.object({
  file: z.string(),
  crossed: z.number().int().nonnegative(),
  rejected: z.number().int().nonnegative(),
  of: z.number().int().nonnegative(),
});
export type TableProgress = z.infer<typeof MigrationEvent>;

/** Each table's progress, the newest event of each, in the order the tables crossed. */
export function crossingProgress(events: LiveEvent[]): TableProgress[] {
  const out = new Map<string, TableProgress>();
  for (const e of events) {
    // A new run of the step starts again.
    if (e.type === 'step') {
      const p = e.payload as { step?: string; state?: string };
      if (p.step === 'undertake' && p.state === 'started') out.clear();
      continue;
    }
    if (e.type !== 'migration') continue;
    const m = MigrationEvent.safeParse(e.payload);
    if (m.success) out.set(m.data.file, m.data);
  }
  return [...out.values()];
}

// A séance (Prompt 31): the owner works the old app by hand while every action is recorded.
// The zod schemas check what comes in over the API.
import type { SnapshotDiff } from '@afterlife/dbf';
import { ScreenModelSchema } from '@afterlife/screen';
import { z } from 'zod';
import { KeyParseError, parseKeys } from './keys';
import type { Observation } from './recorder';

export const MAX_SESSION_ACTIONS = 500;
/** About 3.7 MB of audio: a few minutes of a voice note in Opus. */
export const MAX_AUDIO_BASE64 = 5_000_000;

const DbfValue = z.union([z.string(), z.boolean(), z.number(), z.null()]);
const RecordRef = z.object({
  key: z.string().nullable(),
  recno: z.number().int().nonnegative(),
  values: z.record(z.string(), DbfValue),
});
const TableDiffSchema = z.object({
  key: z.string().nullable(),
  inserted: z.array(RecordRef),
  deleted: z.array(RecordRef),
  updated: z.array(
    z.object({
      key: z.string().nullable(),
      beforeRecno: z.number().int().nonnegative(),
      afterRecno: z.number().int().nonnegative(),
      changes: z.array(
        z.object({
          field: z.string(),
          before: DbfValue,
          after: DbfValue,
          delta: z.string().nullable().optional(),
        }),
      ),
    }),
  ),
  schema: z.object({ added: z.array(z.string()), removed: z.array(z.string()) }),
});
const SnapshotDiffSchema = z.object({
  tables: z.record(z.string(), TableDiffSchema),
  unchanged: z.array(z.string()),
  addedTables: z.array(z.string()),
  removedTables: z.array(z.string()),
}) satisfies z.ZodType<SnapshotDiff>;

const Cell = z.object({ row: z.number().int().nonnegative(), col: z.number().int().nonnegative() });
const ObservedScreenSchema = z.object({
  fingerprint: z.string().regex(/^fp_[0-9a-f]{16}$/),
  text: z.array(z.string().max(80)).refine((t) => t.length === 25 || t.length === 50, {
    message: 'A text screen has 25 or 50 rows',
  }),
  model: ScreenModelSchema,
  cursor: Cell.nullable(),
});

const KeySequence = z.string().refine(
  (s) => {
    try {
      parseKeys(s);
      return true;
    } catch (e) {
      if (e instanceof KeyParseError) return false;
      throw e;
    }
  },
  { message: 'Not a key sequence' },
);

export const ObservationSchema = z.object({
  keys: KeySequence,
  screenBefore: ObservedScreenSchema,
  screenAfter: ObservedScreenSchema,
  dbfDiff: SnapshotDiffSchema,
  durationMs: z.number().nonnegative(),
  stable: z.boolean(),
}) satisfies z.ZodType<Observation>;

export const SeanceSessionSchema = z.object({
  /** The Graveyard app (or, from Prompt 40, the uploaded project) the séance was recorded on. */
  projectId: z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/),
  startedAt: z.iso.datetime(),
  actions: z.array(ObservationSchema).min(1).max(MAX_SESSION_ACTIONS),
  /** The owner's voice, explaining what they do (optional). */
  audio: z
    .object({
      mime: z.string().regex(/^audio\/[a-z0-9.+-]+(;.*)?$/),
      base64: z
        .string()
        .max(MAX_AUDIO_BASE64)
        .regex(/^[A-Za-z0-9+/]*={0,2}$/),
    })
    .optional(),
});
export type SeanceSession = z.infer<typeof SeanceSessionSchema>;

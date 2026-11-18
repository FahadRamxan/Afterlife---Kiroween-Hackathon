// Séances in Postgres: one `sessions` row, and one `observations` row per action.
import { observations, sessions, type Db } from '@afterlife/db';
import type { SeanceSession } from '@afterlife/emulator';
import { asc, eq } from 'drizzle-orm';
import type { SessionStore } from './sessions';

type Action = SeanceSession['actions'][number];

export class PgSessionStore implements SessionStore {
  readonly kind = 'postgres';
  constructor(private readonly db: Db) {}

  async create(s: SeanceSession): Promise<string> {
    return this.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(sessions)
        .values({
          app: s.projectId,
          startedAt: new Date(s.startedAt),
          audioMime: s.audio?.mime ?? null,
          audio: s.audio ? new Uint8Array(Buffer.from(s.audio.base64, 'base64')) : null,
        })
        .returning({ id: sessions.id });
      await tx.insert(observations).values(
        s.actions.map((a, seq) => ({
          sessionId: row!.id,
          seq,
          keys: a.keys,
          screenBeforeFp: a.screenBefore.fingerprint,
          screenAfterFp: a.screenAfter.fingerprint,
          screenBefore: a.screenBefore,
          screenAfter: a.screenAfter,
          dbfDiff: a.dbfDiff,
          durationMs: a.durationMs,
          stable: a.stable,
        })),
      );
      return row!.id;
    });
  }

  async get(id: string): Promise<SeanceSession | null> {
    const [s] = await this.db.select().from(sessions).where(eq(sessions.id, id));
    if (!s) return null;
    const rows = await this.db
      .select()
      .from(observations)
      .where(eq(observations.sessionId, id))
      .orderBy(asc(observations.seq));
    return {
      projectId: s.app,
      startedAt: s.startedAt.toISOString(),
      actions: rows.map((r): Action => ({
        keys: r.keys,
        screenBefore: r.screenBefore as Action['screenBefore'],
        screenAfter: r.screenAfter as Action['screenAfter'],
        dbfDiff: r.dbfDiff as Action['dbfDiff'],
        durationMs: r.durationMs,
        stable: r.stable,
      })),
      ...(s.audio && s.audioMime
        ? { audio: { mime: s.audioMime, base64: Buffer.from(s.audio).toString('base64') } }
        : {}),
    };
  }
}

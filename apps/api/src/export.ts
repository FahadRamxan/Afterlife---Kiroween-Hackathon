// Export (Prompt 62): GET /api/projects/:id/export gives the reborn app as a zip, a standalone
// Next.js app running the project's newest Soul (packages/vessel/src/export.ts builds it). The
// runtime is copied from this repo's own source, so the export runs what the reborn app runs.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { latestSoulRow, type Db } from '@afterlife/db';
import { SoulSchema, type Soul } from '@afterlife/soul';
import {
  RUNTIME_PACKAGES,
  buildExport,
  exportZip,
  tablesFromBundle,
  vendorRuntime,
} from '@afterlife/vessel';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { graveyardBundle } from './vessel';

const REPO = new URL('../../../', import.meta.url);
const Id = z.uuid();

/** The runtime's source files, by package: what vendorRuntime copies into the export. */
export function runtimeSources(
  root: URL = REPO,
): Record<(typeof RUNTIME_PACKAGES)[number] | 'screen', Record<string, string>> {
  const read = (pkg: string) => {
    const src = fileURLToPath(new URL(`packages/${pkg}/src/`, root));
    return Object.fromEntries(
      readdirSync(src)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => [f, readFileSync(`${src}${f}`, 'utf8')]),
    );
  };
  return { soul: read('soul'), dbf: read('dbf'), vessel: read('vessel'), screen: read('screen') };
}

type ExportProject = { source: string; sourceApp: string; dosTime: string | null };

/** The day the old app's records are from: the project's DOS clock, or its sample's. */
export function oldAppDate(p: ExportProject, root: URL = REPO): string | undefined {
  if (p.dosTime) return p.dosTime.slice(0, 10);
  if (p.source !== 'graveyard' || !/^[a-z0-9-]+$/.test(p.sourceApp)) return undefined;
  try {
    const m = JSON.parse(
      readFileSync(
        fileURLToPath(new URL(`samples/graveyard/${p.sourceApp}/manifest.json`, root)),
        'utf8',
      ),
    ) as { dosTime?: string };
    return m.dosTime?.slice(0, 10);
  } catch {
    return undefined;
  }
}

/** A Soul and the old app's bundle as the export's zip, named after the app. */
export function exportOf(soul: Soul, bundle: Uint8Array, date?: string) {
  const records = Object.fromEntries(
    Object.entries(tablesFromBundle(bundle, soul)).map(([f, t]) => [f, t.records]),
  );
  const name = `${soul.app.id}-reborn`;
  const files = buildExport({
    soul,
    records,
    runtime: vendorRuntime(runtimeSources()),
    ...(date ? { oldAppDate: date } : {}),
  });
  return { name, zip: exportZip(files, name) };
}

export class ExportError extends Error {
  constructor(
    readonly code: 'NO_SOUL' | 'NO_ACTIONS' | 'NO_DATA',
    message: string,
  ) {
    super(message);
  }
}

export interface ExportStore {
  /** The project's export, or throws ExportError when there is nothing to export yet. */
  export(projectId: string): Promise<{ name: string; zip: Uint8Array }>;
}

export class PgExportStore implements ExportStore {
  constructor(
    private readonly db: Db,
    private readonly project: (id: string) => Promise<ExportProject | null>,
    private readonly bundleFor: typeof graveyardBundle = graveyardBundle,
  ) {}
  async export(projectId: string) {
    const row = await latestSoulRow(this.db, projectId);
    if (!row) throw new ExportError('NO_SOUL', 'No Soul has been written for this project yet');
    const soul = SoulSchema.parse(row.ir);
    if (!soul.actions.length)
      throw new ExportError('NO_ACTIONS', 'The Soul has no actions, so there is no app to export');
    const p = await this.project(projectId);
    const bundle = p ? this.bundleFor(p) : null;
    if (!p || !bundle)
      throw new ExportError('NO_DATA', 'The records of an uploaded app come with the Undertaker');
    return exportOf(soul, bundle, oldAppDate(p));
  }
}

export function exportRoutes(
  store: ExportStore | undefined,
  opts: { projectExists: (id: string) => Promise<boolean> },
) {
  return async (app: FastifyInstance) => {
    app.get<{ Params: { id: string } }>('/api/projects/:id/export', async (req, reply) => {
      const { id } = req.params;
      if (!Id.safeParse(id).success)
        return reply.code(400).send({ error: 'BAD_ID', message: 'Not an id' });
      if (!store)
        return reply.code(503).send({
          error: 'NO_DATABASE',
          message: 'This API has no database, so it has no Soul to export',
        });
      if (!(await opts.projectExists(id)))
        return reply.code(404).send({ error: 'NOT_FOUND', message: 'No such project' });
      try {
        const { name, zip } = await store.export(id);
        return reply
          .header('content-type', 'application/zip')
          .header('content-disposition', `attachment; filename="${name}.zip"`)
          .send(Buffer.from(zip));
      } catch (e) {
        if (e instanceof ExportError)
          return reply.code(409).send({ error: e.code, message: e.message });
        throw e;
      }
    });
  };
}

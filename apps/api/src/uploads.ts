// POST /api/uploads (Prompt 40): upload your own dead app. The zip is checked here (zip-slip,
// sizes, file types, a real DOS program) before anything is stored; then the project is created
// and the worker virus-scans the zip and builds its js-dos bundle before the pipeline runs. The
// uploaded program never runs anywhere but inside the emulator.
import { createHash } from 'node:crypto';
import multipart from '@fastify/multipart';
import { projects, uploads as uploadsTable, type Db } from '@afterlife/db';
import { DEAD_APP_LIMITS, unpackDeadApp } from '@afterlife/emulator';
import type { FastifyInstance } from 'fastify';
import type { Pipeline, Project } from './projects';

export type NewUpload = {
  fileName: string;
  zip: Uint8Array;
  executable: string;
  name: string;
};

export interface UploadStore {
  /** Creates the project and its upload row together. */
  create(u: NewUpload): Promise<Project>;
}

export class PgUploadStore implements UploadStore {
  constructor(private readonly db: Db) {}

  create(u: NewUpload): Promise<Project> {
    return this.db.transaction(async (tx) => {
      const [p] = await tx
        .insert(projects)
        .values({ name: u.name, source: 'upload', sourceApp: u.fileName })
        .returning();
      await tx.insert(uploadsTable).values({
        projectId: p!.id,
        fileName: u.fileName,
        sha256: createHash('sha256').update(u.zip).digest('hex'),
        size: u.zip.length,
        executable: u.executable,
        zip: u.zip,
      });
      return {
        id: p!.id,
        name: p!.name,
        source: p!.source,
        sourceApp: p!.sourceApp,
        status: p!.status,
        mode: p!.mode,
        createdAt: p!.createdAt.toISOString(),
      };
    });
  }
}

/** Only letters, digits, spaces, dots, dashes and underscores; never a path. */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).at(-1) ?? '';
  const clean = base
    .replace(/[^\w .-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 64);
  return clean.replace(/^\.+/, '') || 'upload.zip';
}

type UploadError = { error: string; message: string; programs?: string[] };

export function uploadRoutes(
  store: UploadStore | undefined,
  pipeline: Pipeline | undefined,
  opts: { createPerMinute: number },
) {
  return async (app: FastifyInstance) => {
    await app.register(multipart, {
      // The zip and, at most, which program starts the app.
      limits: { fileSize: DEAD_APP_LIMITS.maxZipBytes, files: 1, fields: 1 },
    });

    app.post(
      '/api/uploads',
      {
        config: { rateLimit: { max: opts.createPerMinute, timeWindow: '1 minute' } },
        bodyLimit: DEAD_APP_LIMITS.maxZipBytes + 64 * 1024,
      },
      async (req, reply) => {
        if (!store || !pipeline)
          return reply.code(503).send({
            error: 'NO_DATABASE',
            message: 'This API has no database, so it cannot keep an uploaded app',
          } satisfies UploadError);
        if (!req.isMultipart())
          return reply.code(415).send({
            error: 'NOT_MULTIPART',
            message: 'Send the zip as multipart/form-data, in the "zip" field',
          } satisfies UploadError);

        let zip: Uint8Array | undefined;
        let fileName = 'upload.zip';
        let executable: string | undefined;
        try {
          for await (const part of req.parts()) {
            if (part.type === 'field') {
              if (part.fieldname !== 'executable' || typeof part.value !== 'string')
                return reply
                  .code(400)
                  .send({ error: 'BAD_FIELD', message: 'Only "zip" and "executable" are taken' });
              executable = part.value;
            } else if (part.fieldname === 'zip') {
              zip = new Uint8Array(await part.toBuffer());
              fileName = safeFileName(part.filename);
            } else {
              await part.toBuffer();
            }
          }
        } catch (err) {
          const code = (err as { code?: string }).code;
          if (code === 'FST_REQ_FILE_TOO_LARGE' || code === 'FST_FILES_LIMIT')
            return reply.code(413).send({
              error: 'TOO_BIG',
              message: 'Send one zip of 20 MB at most',
            } satisfies UploadError);
          throw err;
        }
        if (!zip)
          return reply
            .code(400)
            .send({ error: 'NO_ZIP', message: 'Send the zip in the "zip" field' });

        const app_ = unpackDeadApp(zip, { executable });
        if (!app_.ok)
          return reply.code(app_.code === 'TOO_BIG' ? 413 : 400).send({
            error: app_.code,
            message: app_.message,
            ...(app_.programs ? { programs: app_.programs } : {}),
          } satisfies UploadError);

        const name = `${app_.executable.replace(/\.(EXE|COM)$/, '')} (uploaded)`;
        const project = await store.create({ fileName, zip, executable: app_.executable, name });
        await pipeline.start(project.id, 'scan-upload');
        return reply.code(201).send({
          project,
          upload: {
            status: 'scanning',
            executable: app_.executable,
            files: Object.keys(app_.files).sort(),
          },
        });
      },
    );
  };
}

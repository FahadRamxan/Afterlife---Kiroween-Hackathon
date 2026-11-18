import multipart from '@fastify/multipart';
import { DbfError, INSPECT_ROWS, inspectDbf } from '@afterlife/dbf';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

/** The whole upload, all files together. The browser checks the same limit first. */
export const MAX_INSPECT_BYTES = 20 * 1024 * 1024;
export const MAX_FILES = 50;
/** Most records per file a preview may be cut to. */
export const MAX_CUT = 1000;

const DbfValue = z.union([z.string(), z.boolean(), z.number(), z.null()]);

const ReadTable = z.object({
  file: z.string(),
  ok: z.literal(true),
  version: z.number().int(),
  // null when the header's date bytes are not a real date (inspectDbf checks).
  lastUpdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  recordCount: z.number().int().nonnegative(),
  fields: z.array(
    z.object({
      name: z.string().min(1),
      type: z.enum(['C', 'N', 'F', 'D', 'L', 'M']),
      length: z.number().int().positive(),
      decimals: z.number().int().nonnegative(),
    }),
  ),
  rows: z
    .array(z.object({ deleted: z.boolean(), values: z.record(z.string(), DbfValue) }))
    .max(INSPECT_ROWS),
  moreRows: z.number().int().nonnegative(),
  warnings: z.array(z.object({ code: z.literal('TRUNCATED'), message: z.string() })),
});

/** A file that could not be read: in its own place, so the other files still show. */
const UnreadFile = z.object({
  file: z.string(),
  ok: z.literal(false),
  /** NOT_DBF for a name that is not .DBF, else the reader's DbfError code. */
  code: z.string(),
  message: z.string(),
});

/** The response body, validated before it is sent: one entry per file, in the order sent. */
export const InspectResponse = z.object({
  files: z.array(z.discriminatedUnion('ok', [ReadTable, UnreadFile])),
});
export type InspectResponse = z.infer<typeof InspectResponse>;

export type InspectError =
  | { error: 'NO_FILES'; message: string }
  | { error: 'TOO_LARGE'; message: string }
  | { error: 'TOO_MANY_FILES'; message: string }
  | { error: 'NOT_A_FILE'; message: string }
  | { error: 'NOT_MULTIPART'; message: string };

const tooLarge = (): InspectError => ({
  error: 'TOO_LARGE',
  message: `The upload is over ${MAX_INSPECT_BYTES / 1024 / 1024} MB`,
});

/** Keeps only the file name ("C:\\APP\\MEDICINE.DBF" -> "MEDICINE.DBF"). */
const baseName = (name: string) => name.split(/[\\/]/).pop() ?? name;

/**
 * POST /api/dbf/inspect: multipart upload of .DBF files (field name "files"), and optionally a
 * "cut" field. Returns, per file in the order sent, its schema and first 100 rows, or why it could
 * not be read. Nothing is stored.
 */
export async function dbfInspectRoutes(app: FastifyInstance) {
  await app.register(multipart, {
    // One form field at most: "cut" (see below).
    limits: { fileSize: MAX_INSPECT_BYTES, files: MAX_FILES, fields: 1 },
  });

  app.post('/api/dbf/inspect', async (req, reply) => {
    if (!req.isMultipart())
      return reply.code(415).send({
        error: 'NOT_MULTIPART',
        message: 'Send the .DBF files as multipart/form-data',
      } satisfies InspectError);

    const files: { name: string; bytes: Uint8Array }[] = [];
    let total = 0;
    // "cut": the browser sent each file's header and first `cut` records (dbfPreviewBytes).
    let cut: number | undefined;
    const notAFile = () =>
      reply.code(400).send({
        error: 'NOT_A_FILE',
        message: `Send only .DBF files, as the "files" field, and at most a "cut" field of 1 to ${MAX_CUT}`,
      } satisfies InspectError);
    try {
      for await (const part of req.parts()) {
        if (part.type === 'field') {
          const n = Number(part.value);
          if (part.fieldname !== 'cut' || !Number.isInteger(n) || n < 1 || n > MAX_CUT)
            return notAFile();
          cut = n;
          continue;
        }
        const bytes = new Uint8Array(await part.toBuffer());
        total += bytes.length;
        if (total > MAX_INSPECT_BYTES) return reply.code(413).send(tooLarge());
        files.push({ name: baseName(part.filename), bytes });
      }
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === 'FST_REQ_FILE_TOO_LARGE') return reply.code(413).send(tooLarge());
      // Busboy's own limits. Without these the answer was Fastify's untyped
      // { statusCode, code: 'FST_FILES_LIMIT', message: 'reach files limit' }.
      if (code === 'FST_FILES_LIMIT')
        return reply.code(413).send({
          error: 'TOO_MANY_FILES',
          message: `Send at most ${MAX_FILES} .DBF files at once`,
        } satisfies InspectError);
      if (code === 'FST_FIELDS_LIMIT') return notAFile();
      // An empty form ends before its first part; anything else is a broken upload.
      if (files.length > 0) throw err;
    }

    if (files.length === 0)
      return reply
        .code(400)
        .send({ error: 'NO_FILES', message: 'No .DBF files in the upload' } satisfies InspectError);

    const out: InspectResponse['files'] = files.map((f) => {
      if (!/\.dbf$/i.test(f.name))
        return {
          file: f.name,
          ok: false,
          code: 'NOT_DBF',
          message: `${f.name} is not a .DBF file`,
        };
      try {
        return { file: f.name, ok: true, ...inspectDbf(f.bytes, INSPECT_ROWS, { cut }) };
      } catch (err) {
        if (!(err instanceof DbfError)) throw err;
        return { file: f.name, ok: false, code: err.code, message: err.message };
      }
    });
    return InspectResponse.parse({ files: out });
  });
}

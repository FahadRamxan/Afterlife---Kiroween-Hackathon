// Projects (Prompt 36): one raise of a dead app. Created from a Graveyard app (or, from Prompt 40,
// an upload), read back with its timeline, deleted with everything it owns.
import { PIPELINE, SEED_PROJECTS, uuidv7, type PipelineStep } from '@afterlife/db';
import type { FastifyInstance } from 'fastify';
import {
  hasZodFastifySchemaValidationErrors,
  type FastifyPluginAsyncZod,
} from 'fastify-type-provider-zod';
import { z } from 'zod';

export const GRAVEYARD_APPS = SEED_PROJECTS.map((p) => p.sourceApp) as [string, ...string[]];
/** The seeded Graveyard projects are shared by every visitor, so nobody may delete them. */
const PROTECTED = new Set<string>(SEED_PROJECTS.map((p) => p.id));

export const ProjectSchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    source: z.enum(['graveyard', 'upload']),
    sourceApp: z.string(),
    status: z.enum(['created', 'queued', 'running', 'done', 'failed']),
    /** `recorded`: demo mode, a replay of a real run's saved outputs (Prompt 39). */
    mode: z.enum(['live', 'recorded']),
    /** An uploaded app's DOS clock (`YYYY-MM-DD HH:MM:SS`); null for Graveyard apps (they use their own). */
    dosTime: z.string().nullable(),
    createdAt: z.iso.datetime(),
  })
  .meta({ id: 'Project' });
export type Project = z.infer<typeof ProjectSchema>;

export const TIMELINE_KINDS = [
  'project_created',
  'session_recorded',
  'soul_version',
  'proof_run',
  'certificate_issued',
  'exorcism_found',
  'voice_change',
] as const;
export const TimelineEventSchema = z
  .object({
    at: z.iso.datetime(),
    kind: z.enum(TIMELINE_KINDS),
    id: z.uuid(),
    summary: z.string(),
  })
  .meta({ id: 'TimelineEvent' });
export type TimelineEvent = z.infer<typeof TimelineEventSchema>;

export const CreateProjectSchema = z.discriminatedUnion('source', [
  z.strictObject({
    source: z.literal('graveyard'),
    app: z.enum(GRAVEYARD_APPS).describe('A Graveyard app id'),
    mode: z
      .enum(['live', 'recorded'])
      .optional()
      .describe('recorded: demo mode, replay a real run (fast). Default live'),
  }),
  z.strictObject({
    source: z.literal('upload'),
    uploadId: z.uuid().describe('An upload id (Prompt 40)'),
  }),
]);

const ErrorSchema = z.object({ error: z.string(), message: z.string() }).meta({ id: 'Error' });
const IdParams = z.object({ id: z.uuid() });

export type NewProject = Pick<Project, 'name' | 'source' | 'sourceApp'> & {
  mode?: Project['mode'];
};

export interface ProjectStore {
  create(p: NewProject): Promise<Project>;
  get(id: string): Promise<Project | null>;
  /** Oldest first, starting with "project created". Null when there is no such project. */
  timeline(id: string): Promise<TimelineEvent[] | null>;
  /** True if it deleted something. */
  delete(id: string): Promise<boolean>;
}

/** Keeps the newest `limit` projects in memory, for an API without a database. */
export class MemoryProjectStore implements ProjectStore {
  private readonly projects = new Map<string, Project>();
  constructor(private readonly limit = 200) {}

  async create(p: NewProject): Promise<Project> {
    const project: Project = {
      id: uuidv7(),
      ...p,
      mode: p.mode ?? 'live',
      dosTime: null,
      status: 'created',
      createdAt: new Date().toISOString(),
    };
    this.projects.set(project.id, project);
    while (this.projects.size > this.limit)
      this.projects.delete(this.projects.keys().next().value!);
    return project;
  }

  async get(id: string): Promise<Project | null> {
    return this.projects.get(id) ?? null;
  }

  async timeline(id: string): Promise<TimelineEvent[] | null> {
    const p = this.projects.get(id);
    return p ? [{ at: p.createdAt, kind: 'project_created', id: p.id, summary: p.name }] : null;
  }

  async delete(id: string): Promise<boolean> {
    return this.projects.delete(id);
  }
}

const notFound = { error: 'NOT_FOUND', message: 'No such project' };

/** The validation error, as our usual `{error, message}`, without echoing the values sent. */
function validationError(err: unknown) {
  if (!hasZodFastifySchemaValidationErrors(err)) return null;
  const message = err.validation
    .slice(0, 5)
    .map(
      (v) => `${v.instancePath.replace(/^\//, '').replaceAll('/', '.') || '(body)'}: ${v.message}`,
    )
    .join('; ');
  return { error: err.validationContext === 'params' ? 'BAD_ID' : 'BAD_PROJECT', message };
}

/** Starts the rebirth of a new project (queues its first step). Absent without a database. */
export interface Pipeline {
  /** Queues the first step: possess, or the virus scan for an uploaded app. */
  start(projectId: string, from?: 'possess' | 'scan-upload'): Promise<void>;
  /** The six steps, in order, with where each one is. */
  steps(projectId: string): Promise<StepState[]>;
  /** Runs one step again, alone. False when it is already queued. */
  rerun(projectId: string, step: PipelineStep): Promise<boolean>;
  /** Queues the Urdu translation of the project's newest Soul. False when it is already queued. */
  translate?(projectId: string): Promise<boolean>;
  /** Queues Ghost Twin's replay of the project's new twin events (Prompt 77). */
  twin?(projectId: string): Promise<boolean>;
}

export const StepStateSchema = z
  .object({
    step: z.enum(PIPELINE),
    /** `pending`: not reached yet. `skipped`: its agent is not built yet (see `reason`). */
    status: z.enum(['pending', 'queued', 'running', 'done', 'failed', 'skipped']),
    attempts: z.number().int().nonnegative(),
    error: z.string().nullable(),
    reason: z.string().nullable(),
    /** True when the step replayed a recorded run (demo mode). */
    recorded: z.boolean(),
    finishedAt: z.iso.datetime().nullable(),
    /** The rebirth step, done (Prompt 63): the reborn app's URL and the actions it published. */
    vessel: z
      .object({
        url: z.string(),
        actions: z.array(z.object({ id: z.string(), name: z.string() })),
      })
      .nullable(),
    /** The undertake step, done (Prompt 66): what crossed, what was rejected, the reconciliation. */
    crossing: z
      .object({
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
      })
      .nullable(),
    /** The prove step, done (Prompt 70): the proof's counts and its shrunk counterexample. */
    proof: z
      .object({
        soulVersion: z.number().int(),
        seed: z.number().int(),
        numRuns: z.number().int(),
        lanes: z.number().int(),
        passed: z.number().int(),
        failed: z.number().int(),
        skipped: z.number().int(),
        counterexample: z
          .object({
            index: z.number().int(),
            actionId: z.string(),
            inputs: z.object({
              values: z.record(z.string(), z.string()).optional(),
              lines: z.array(z.record(z.string(), z.string())).optional(),
            }),
            seed: z.number().int(),
            path: z.string(),
            explanation: z.string(),
            differences: z.array(
              z.object({
                table: z.string(),
                kind: z.enum(['inserted', 'deleted', 'updated']),
                record: z.string(),
                field: z.string().optional(),
                old: z.string().nullable(),
                vessel: z.string().nullable(),
                values: z.record(z.string(), z.string()).optional(),
              }),
            ),
            shrinks: z.number().int(),
            tries: z.number().int(),
            reproduced: z.boolean(),
            old: z.record(z.string(), z.string()).nullable(),
            vessel: z.record(z.string(), z.string()).nullable(),
          })
          .nullable(),
        /** Prompt 74: cases that differ as the owner's fixes say, cases kept from the last proof. */
        accepted: z.number().int().optional(),
        reused: z.number().int().optional(),
        acceptedDivergences: z.array(z.object({ id: z.string(), text: z.string() })).optional(),
        /** The Rebirth Certificate (Prompt 71): its id, or why none was issued. */
        certificate: z
          .object({ id: z.string().optional(), reason: z.string().optional() })
          .nullable(),
      })
      .nullable(),
  })
  .meta({ id: 'StepState' });
export type StepState = z.infer<typeof StepStateSchema>;

const StepParams = z.object({ id: z.uuid(), step: z.enum(PIPELINE) });
const noDatabase = {
  error: 'NO_DATABASE',
  message: 'This API has no database, so it runs no pipeline',
};

export function projectRoutes(
  store: ProjectStore,
  opts: { createPerMinute: number; pipeline?: Pipeline },
) {
  const plugin: FastifyPluginAsyncZod = async (app) => {
    app.setErrorHandler((err, _req, reply) => {
      const bad = validationError(err);
      if (bad) {
        if (bad.error === 'BAD_ID') bad.message = 'Not a project id';
        return reply.code(400).send(bad);
      }
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      // The rate limiter's answer, already in our shape.
      if (status === 429) return reply.code(429).send(err);
      // Fastify's own client errors (a body that is not JSON, too big, ...) keep their status.
      if (status >= 400 && status < 500)
        return reply.code(status).send({
          error: status === 415 ? 'UNSUPPORTED_MEDIA_TYPE' : 'BAD_REQUEST',
          message: (err as Error).message,
        });
      reply.log.error(err);
      return reply.code(500).send({ error: 'INTERNAL', message: 'Something went wrong' });
    });

    app.post(
      '/api/projects',
      {
        config: { rateLimit: { max: opts.createPerMinute, timeWindow: '1 minute' } },
        schema: {
          summary: 'Raise a dead app: create a project from a Graveyard app or an upload',
          tags: ['projects'],
          body: CreateProjectSchema,
          response: { 201: ProjectSchema, 400: ErrorSchema, 429: ErrorSchema, 501: ErrorSchema },
        },
      },
      async (req, reply) => {
        const body = req.body;
        if (body.source === 'upload')
          return reply.code(501).send({
            error: 'NOT_YET',
            message: 'Upload the zip to POST /api/uploads: it is checked and virus-scanned first',
          });
        const seed = SEED_PROJECTS.find((p) => p.sourceApp === body.app)!;
        const p = await store.create({
          name: seed.name,
          source: 'graveyard',
          sourceApp: body.app,
          mode: body.mode ?? 'live',
        });
        // The project exists either way; if the queue fails it stays "created" and says so in the log.
        await opts.pipeline
          ?.start(p.id)
          .catch((e) => req.log.warn({ err: e }, 'could not start the pipeline'));
        return reply.code(201).header('location', `/api/projects/${p.id}`).send(p);
      },
    );

    app.get(
      '/api/projects/:id',
      {
        schema: {
          summary: 'A project',
          tags: ['projects'],
          params: IdParams,
          response: { 200: ProjectSchema, 400: ErrorSchema, 404: ErrorSchema, 429: ErrorSchema },
        },
      },
      async (req, reply) => {
        const p = await store.get(req.params.id);
        return p ? p : reply.code(404).send(notFound);
      },
    );

    app.get(
      '/api/projects/:id/timeline',
      {
        schema: {
          summary: 'What has happened to a project so far, oldest first (at most 500 events)',
          tags: ['projects'],
          params: IdParams,
          response: {
            200: z.object({ projectId: z.uuid(), events: z.array(TimelineEventSchema) }),
            400: ErrorSchema,
            404: ErrorSchema,
            429: ErrorSchema,
          },
        },
      },
      async (req, reply) => {
        const events = await store.timeline(req.params.id);
        return events ? { projectId: req.params.id, events } : reply.code(404).send(notFound);
      },
    );

    app.get(
      '/api/projects/:id/steps',
      {
        schema: {
          summary: 'The six pipeline steps of a project, in order, and where each one is',
          tags: ['projects'],
          params: IdParams,
          response: {
            200: z.object({ projectId: z.uuid(), steps: z.array(StepStateSchema) }),
            400: ErrorSchema,
            404: ErrorSchema,
            429: ErrorSchema,
            503: ErrorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!opts.pipeline) return reply.code(503).send(noDatabase);
        if (!(await store.get(req.params.id))) return reply.code(404).send(notFound);
        return { projectId: req.params.id, steps: await opts.pipeline.steps(req.params.id) };
      },
    );

    app.post(
      '/api/projects/:id/steps/:step/run',
      {
        config: { rateLimit: { max: opts.createPerMinute, timeWindow: '1 minute' } },
        schema: {
          summary: 'Run one step again, alone (the steps after it are not run)',
          tags: ['projects'],
          params: StepParams,
          response: {
            202: z.object({ queued: z.literal(true) }),
            400: ErrorSchema,
            404: ErrorSchema,
            409: ErrorSchema,
            429: ErrorSchema,
            503: ErrorSchema,
          },
        },
      },
      async (req, reply) => {
        if (!opts.pipeline) return reply.code(503).send(noDatabase);
        if (!(await store.get(req.params.id))) return reply.code(404).send(notFound);
        if (!(await opts.pipeline.rerun(req.params.id, req.params.step)))
          return reply.code(409).send({
            error: 'ALREADY_QUEUED',
            message: `${req.params.step} is already waiting to run`,
          });
        return reply.code(202).send({ queued: true });
      },
    );

    app.delete(
      '/api/projects/:id',
      {
        schema: {
          summary: 'Delete a project and everything it owns (séances, Souls, proofs)',
          tags: ['projects'],
          params: IdParams,
          response: {
            204: z.null().describe('Deleted'),
            400: ErrorSchema,
            403: ErrorSchema,
            404: ErrorSchema,
            429: ErrorSchema,
          },
        },
      },
      async (req, reply) => {
        if (PROTECTED.has(req.params.id))
          return reply.code(403).send({
            error: 'PROTECTED',
            message: 'The Graveyard demo projects are shared by everyone and cannot be deleted',
          });
        return (await store.delete(req.params.id))
          ? reply.code(204).send(null)
          : reply.code(404).send(notFound);
      },
    );
  };
  return plugin as unknown as (app: FastifyInstance) => Promise<void>;
}

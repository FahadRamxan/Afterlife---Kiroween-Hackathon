// The Afterlife database (Prompt 35). Every id is a UUIDv7 made in the app (Postgres 16 has no
// uuidv7()), so rows sort by creation time. Child rows go when their project goes (ON DELETE
// CASCADE): deleting a project (Prompt 36) leaves nothing of it behind.
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { uuidv7 } from './uuid';

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  toDriver: (v) => Buffer.from(v),
  fromDriver: (v) => new Uint8Array(v),
});

const id = () =>
  uuid('id')
    .primaryKey()
    .$defaultFn(() => uuidv7());
const createdAt = (name = 'created_at') =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
const projectId = () =>
  uuid('project_id')
    .notNull()
    .references(() => projects.id, { onDelete: 'cascade' });

/** Where a project's dead app came from. */
export const projectSource = pgEnum('project_source', ['graveyard', 'upload']);
/** The pipeline as a whole (each step's own state lives with its output, Prompt 39). */
export const projectStatus = pgEnum('project_status', [
  'created',
  'queued',
  'running',
  'done',
  'failed',
]);

/** A live run does the work; a recorded run (demo mode) replays one that did, and says so. */
export const runMode = pgEnum('run_mode', ['live', 'recorded']);

export const projects = pgTable(
  'projects',
  {
    id: id(),
    name: text('name').notNull(),
    source: projectSource('source').notNull(),
    /** The Graveyard app id (`shifa`) or the uploaded file's name. */
    sourceApp: text('source_app').notNull(),
    status: projectStatus('status').notNull().default('created'),
    /** `recorded`: demo mode, the steps replay a real run's saved outputs (Prompt 39). */
    mode: runMode('mode').notNull().default('live'),
    createdAt: createdAt(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('projects_created_at_idx').on(t.createdAt),
    check('projects_name_not_blank', sql`length(trim(${t.name})) > 0`),
  ],
);

/** A séance: the owner works the old app by hand (Prompt 31). */
export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    /** Set once the séance belongs to a raised project; a Graveyard séance may have none yet. */
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    /** The app it was recorded on (a Graveyard id such as `shifa`). */
    app: text('app').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    audioMime: text('audio_mime'),
    audio: bytea('audio'),
    createdAt: createdAt(),
  },
  (t) => [
    index('sessions_project_id_idx').on(t.projectId),
    check('sessions_audio_both_or_neither', sql`(${t.audio} is null) = (${t.audioMime} is null)`),
  ],
);

/** One action and what it did: keys, the screens before and after, and the data diff. */
export const observations = pgTable(
  'observations',
  {
    id: id(),
    sessionId: uuid('session_id').references(() => sessions.id, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => projects.id, { onDelete: 'cascade' }),
    /** Order within its session or project, from 0. */
    seq: integer('seq').notNull(),
    keys: text('keys').notNull(),
    screenBeforeFp: text('screen_before_fp').notNull(),
    screenAfterFp: text('screen_after_fp').notNull(),
    /** The decoded screens (text, model, cursor), so a timeline can be shown again. */
    screenBefore: jsonb('screen_before').notNull(),
    screenAfter: jsonb('screen_after').notNull(),
    dbfDiff: jsonb('dbf_diff').notNull(),
    durationMs: integer('duration_ms').notNull(),
    stable: boolean('stable').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('observations_session_seq_idx').on(t.sessionId, t.seq),
    index('observations_project_id_idx').on(t.projectId),
    index('observations_screen_after_fp_idx').on(t.screenAfterFp),
    check('observations_has_owner', sql`${t.sessionId} is not null or ${t.projectId} is not null`),
    check('observations_seq_nonnegative', sql`${t.seq} >= 0`),
    check('observations_duration_nonnegative', sql`${t.durationMs} >= 0`),
  ],
);

/** A version of a project's Soul IR and its Kiro spec. */
export const souls = pgTable(
  'souls',
  {
    id: id(),
    projectId: projectId(),
    version: integer('version').notNull(),
    ir: jsonb('ir').notNull(),
    specMarkdown: text('spec_markdown').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('souls_project_version_idx').on(t.projectId, t.version),
    check('souls_version_positive', sql`${t.version} >= 1`),
  ],
);

export const proofRunStatus = pgEnum('proof_run_status', ['running', 'passed', 'failed']);

/** One differential proof: the old app against the Vessel on generated cases. */
export const proofRuns = pgTable(
  'proof_runs',
  {
    id: id(),
    projectId: projectId(),
    soulId: uuid('soul_id')
      .notNull()
      .references(() => souls.id, { onDelete: 'cascade' }),
    seed: bigint('seed', { mode: 'number' }).notNull(),
    caseCount: integer('case_count').notNull(),
    status: proofRunStatus('status').notNull().default('running'),
    passed: integer('passed').notNull().default(0),
    failed: integer('failed').notNull().default(0),
    startedAt: createdAt('started_at'),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (t) => [
    index('proof_runs_project_id_idx').on(t.projectId),
    check('proof_runs_counts', sql`${t.passed} >= 0 and ${t.failed} >= 0 and ${t.caseCount} > 0`),
  ],
);

export const proofCases = pgTable(
  'proof_cases',
  {
    id: id(),
    proofRunId: uuid('proof_run_id')
      .notNull()
      .references(() => proofRuns.id, { onDelete: 'cascade' }),
    idx: integer('idx').notNull(),
    input: jsonb('input').notNull(),
    oldOutput: jsonb('old_output').notNull(),
    newOutput: jsonb('new_output').notNull(),
    passed: boolean('passed').notNull(),
    /** The minimal failing input after shrinking, and why it differs in plain English. */
    shrunk: jsonb('shrunk'),
    explanation: text('explanation'),
  },
  (t) => [uniqueIndex('proof_cases_run_idx_idx').on(t.proofRunId, t.idx)],
);

/** The signed Rebirth Certificate (RFC 8785 JSON, Ed25519). */
export const certificates = pgTable('certificates', {
  id: id(),
  projectId: projectId(),
  proofRunId: uuid('proof_run_id')
    .notNull()
    .unique()
    .references(() => proofRuns.id, { onDelete: 'cascade' }),
  soulId: uuid('soul_id')
    .notNull()
    .references(() => souls.id, { onDelete: 'cascade' }),
  payload: jsonb('payload').notNull(),
  signature: text('signature').notNull(),
  publicKey: text('public_key').notNull(),
  issuedAt: createdAt('issued_at'),
});

export const severity = pgEnum('severity', ['low', 'medium', 'high', 'critical']);
export const exorcismDecision = pgEnum('exorcism_decision', ['pending', 'keep', 'fix']);

/** A legacy bug the Exorcist found, and the owner's choice. */
export const exorcisms = pgTable(
  'exorcisms',
  {
    id: id(),
    projectId: projectId(),
    soulId: uuid('soul_id').references(() => souls.id, { onDelete: 'set null' }),
    code: text('code').notNull(),
    severity: severity('severity').notNull(),
    titleEn: text('title_en').notNull(),
    titleUr: text('title_ur').notNull(),
    evidence: jsonb('evidence').notNull(),
    decision: exorcismDecision('decision').notNull().default('pending'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('exorcisms_project_code_idx').on(t.projectId, t.code),
    check('exorcisms_decided_at_set', sql`(${t.decision} = 'pending') = (${t.decidedAt} is null)`),
  ],
);

/** Ghost Twin: one real shop event, replayed on the old app and the Vessel. */
export const twinEvents = pgTable(
  'twin_events',
  {
    id: id(),
    projectId: projectId(),
    seq: integer('seq').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull(),
    event: jsonb('event').notNull(),
    oldResult: jsonb('old_result'),
    newResult: jsonb('new_result'),
    matched: boolean('matched'),
  },
  (t) => [uniqueIndex('twin_events_project_seq_idx').on(t.projectId, t.seq)],
);

export const voiceChangeStatus = pgEnum('voice_change_status', [
  'proposed',
  'verified',
  'live',
  'rejected',
]);

/** Living Soul: a rule change the owner said out loud, and the Soul version it led to. */
export const voiceChanges = pgTable(
  'voice_changes',
  {
    id: id(),
    projectId: projectId(),
    soulBeforeId: uuid('soul_before_id')
      .notNull()
      .references(() => souls.id, { onDelete: 'cascade' }),
    soulAfterId: uuid('soul_after_id').references(() => souls.id, { onDelete: 'set null' }),
    language: text('language', { enum: ['ur', 'en'] }).notNull(),
    transcript: text('transcript').notNull(),
    proposal: jsonb('proposal').notNull(),
    status: voiceChangeStatus('status').notNull().default('proposed'),
    createdAt: createdAt(),
  },
  (t) => [check('voice_changes_language', sql`${t.language} in ('ur', 'en')`)],
);

/** Haunted Registry: an anonymised Soul fragment reused across rebirths (Prompt 92). */
export const registryPatterns = pgTable('registry_patterns', {
  id: id(),
  name: text('name').notNull().unique(),
  appType: text('app_type').notNull(),
  fragment: jsonb('fragment').notNull(),
  usedIn: integer('used_in').notNull().default(0),
  createdAt: createdAt(),
});

/** The job types the worker runs (Prompt 37): the six pipeline steps, then two on demand. */
export const JOB_TYPES = [
  'possess',
  'archaeology',
  'rebirth',
  'undertake',
  'prove',
  'exorcise',
  'twin-replay',
  'voice-change',
  // An uploaded app is virus-scanned and bundled before its pipeline starts (Prompt 40).
  'scan-upload',
] as const;
export type JobType = (typeof JOB_TYPES)[number];

export const uploadStatus = pgEnum('upload_status', ['scanning', 'clean', 'infected', 'failed']);

/**
 * An uploaded dead app (Prompt 40): the zip as sent, until the virus scan, then the js-dos bundle
 * built from it. An infected zip's bytes are deleted; the row stays, with the finding.
 */
export const uploads = pgTable('uploads', {
  id: id(),
  projectId: uuid('project_id')
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  sha256: text('sha256').notNull(),
  size: integer('size').notNull(),
  executable: text('executable').notNull(),
  status: uploadStatus('status').notNull().default('scanning'),
  zip: bytea('zip'),
  bundle: bytea('bundle'),
  /** Which scanner looked at it ("ClamAV 1.0.7/27470", or the EICAR-only test scanner). */
  scanner: text('scanner'),
  /** What the scanner found, if anything. */
  finding: text('finding'),
  createdAt: createdAt(),
});

export const stepStatus = pgEnum('step_status', ['queued', 'running', 'done', 'failed', 'skipped']);

/**
 * One step of one project: its state and saved output, so the pipeline can resume and a step can
 * be re-run alone (Prompt 39). (project, step) is the job's idempotency key.
 */
export const pipelineSteps = pgTable(
  'pipeline_steps',
  {
    projectId: projectId(),
    step: text('step').notNull(),
    status: stepStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    jobId: text('job_id'),
    output: jsonb('output'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.step] }),
    check('pipeline_steps_step', sql.raw(`step in (${JOB_TYPES.map((s) => `'${s}'`).join(', ')})`)),
    check('pipeline_steps_attempts', sql`${t.attempts} >= 0`),
  ],
);

/** What the Crew does, as it happens (crew.md), plus each step's start and end. */
export const EVENT_TYPES = [
  'step',
  'screen',
  'observation',
  'rule_found',
  'soul_updated',
  'proof_case',
  'exorcism',
  'log',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

/** Progress events. `seq` orders them per database, so a client can resume after the last one. */
export const projectEvents = pgTable(
  'project_events',
  {
    seq: bigint('seq', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    projectId: projectId(),
    type: text('type').notNull(),
    payload: jsonb('payload').notNull(),
    createdAt: createdAt(),
  },
  (t) => [
    index('project_events_project_seq_idx').on(t.projectId, t.seq),
    check(
      'project_events_type',
      sql.raw(`type in (${EVENT_TYPES.map((s) => `'${s}'`).join(', ')})`),
    ),
  ],
);

/** Every table, in an order where each one's parents come first. */
export const TABLES = {
  projects,
  sessions,
  observations,
  souls,
  proof_runs: proofRuns,
  proof_cases: proofCases,
  certificates,
  exorcisms,
  twin_events: twinEvents,
  voice_changes: voiceChanges,
  registry_patterns: registryPatterns,
  pipeline_steps: pipelineSteps,
  project_events: projectEvents,
  uploads,
} as const;

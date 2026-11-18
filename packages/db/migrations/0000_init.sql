CREATE TYPE "public"."exorcism_decision" AS ENUM('pending', 'keep', 'fix');--> statement-breakpoint
CREATE TYPE "public"."project_source" AS ENUM('graveyard', 'upload');--> statement-breakpoint
CREATE TYPE "public"."project_status" AS ENUM('created', 'queued', 'running', 'done', 'failed');--> statement-breakpoint
CREATE TYPE "public"."proof_run_status" AS ENUM('running', 'passed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."severity" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."voice_change_status" AS ENUM('proposed', 'verified', 'live', 'rejected');--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"proof_run_id" uuid NOT NULL,
	"soul_id" uuid NOT NULL,
	"payload" jsonb NOT NULL,
	"signature" text NOT NULL,
	"public_key" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "certificates_proof_run_id_unique" UNIQUE("proof_run_id")
);
--> statement-breakpoint
CREATE TABLE "exorcisms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"soul_id" uuid,
	"code" text NOT NULL,
	"severity" "severity" NOT NULL,
	"title_en" text NOT NULL,
	"title_ur" text NOT NULL,
	"evidence" jsonb NOT NULL,
	"decision" "exorcism_decision" DEFAULT 'pending' NOT NULL,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exorcisms_decided_at_set" CHECK (("exorcisms"."decision" = 'pending') = ("exorcisms"."decided_at" is null))
);
--> statement-breakpoint
CREATE TABLE "observations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"session_id" uuid,
	"project_id" uuid,
	"seq" integer NOT NULL,
	"keys" text NOT NULL,
	"screen_before_fp" text NOT NULL,
	"screen_after_fp" text NOT NULL,
	"screen_before" jsonb NOT NULL,
	"screen_after" jsonb NOT NULL,
	"dbf_diff" jsonb NOT NULL,
	"duration_ms" integer NOT NULL,
	"stable" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "observations_has_owner" CHECK ("observations"."session_id" is not null or "observations"."project_id" is not null),
	CONSTRAINT "observations_seq_nonnegative" CHECK ("observations"."seq" >= 0),
	CONSTRAINT "observations_duration_nonnegative" CHECK ("observations"."duration_ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" "project_source" NOT NULL,
	"source_app" text NOT NULL,
	"status" "project_status" DEFAULT 'created' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_name_not_blank" CHECK (length(trim("projects"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "proof_cases" (
	"id" uuid PRIMARY KEY NOT NULL,
	"proof_run_id" uuid NOT NULL,
	"idx" integer NOT NULL,
	"input" jsonb NOT NULL,
	"old_output" jsonb NOT NULL,
	"new_output" jsonb NOT NULL,
	"passed" boolean NOT NULL,
	"shrunk" jsonb,
	"explanation" text
);
--> statement-breakpoint
CREATE TABLE "proof_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"soul_id" uuid NOT NULL,
	"seed" bigint NOT NULL,
	"case_count" integer NOT NULL,
	"status" "proof_run_status" DEFAULT 'running' NOT NULL,
	"passed" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "proof_runs_counts" CHECK ("proof_runs"."passed" >= 0 and "proof_runs"."failed" >= 0 and "proof_runs"."case_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "registry_patterns" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"app_type" text NOT NULL,
	"fragment" jsonb NOT NULL,
	"used_in" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "registry_patterns_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid,
	"app" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"audio_mime" text,
	"audio" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sessions_audio_both_or_neither" CHECK (("sessions"."audio" is null) = ("sessions"."audio_mime" is null))
);
--> statement-breakpoint
CREATE TABLE "souls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"ir" jsonb NOT NULL,
	"spec_markdown" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "souls_version_positive" CHECK ("souls"."version" >= 1)
);
--> statement-breakpoint
CREATE TABLE "twin_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"event" jsonb NOT NULL,
	"old_result" jsonb,
	"new_result" jsonb,
	"matched" boolean
);
--> statement-breakpoint
CREATE TABLE "voice_changes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"soul_before_id" uuid NOT NULL,
	"soul_after_id" uuid,
	"language" text NOT NULL,
	"transcript" text NOT NULL,
	"proposal" jsonb NOT NULL,
	"status" "voice_change_status" DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voice_changes_language" CHECK ("voice_changes"."language" in ('ur', 'en'))
);
--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_proof_run_id_proof_runs_id_fk" FOREIGN KEY ("proof_run_id") REFERENCES "public"."proof_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exorcisms" ADD CONSTRAINT "exorcisms_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exorcisms" ADD CONSTRAINT "exorcisms_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_cases" ADD CONSTRAINT "proof_cases_proof_run_id_proof_runs_id_fk" FOREIGN KEY ("proof_run_id") REFERENCES "public"."proof_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_runs" ADD CONSTRAINT "proof_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proof_runs" ADD CONSTRAINT "proof_runs_soul_id_souls_id_fk" FOREIGN KEY ("soul_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "souls" ADD CONSTRAINT "souls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "twin_events" ADD CONSTRAINT "twin_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_changes" ADD CONSTRAINT "voice_changes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_changes" ADD CONSTRAINT "voice_changes_soul_before_id_souls_id_fk" FOREIGN KEY ("soul_before_id") REFERENCES "public"."souls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_changes" ADD CONSTRAINT "voice_changes_soul_after_id_souls_id_fk" FOREIGN KEY ("soul_after_id") REFERENCES "public"."souls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "exorcisms_project_code_idx" ON "exorcisms" USING btree ("project_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "observations_session_seq_idx" ON "observations" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "observations_project_id_idx" ON "observations" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "observations_screen_after_fp_idx" ON "observations" USING btree ("screen_after_fp");--> statement-breakpoint
CREATE INDEX "projects_created_at_idx" ON "projects" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "proof_cases_run_idx_idx" ON "proof_cases" USING btree ("proof_run_id","idx");--> statement-breakpoint
CREATE INDEX "proof_runs_project_id_idx" ON "proof_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "sessions_project_id_idx" ON "sessions" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "souls_project_version_idx" ON "souls" USING btree ("project_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "twin_events_project_seq_idx" ON "twin_events" USING btree ("project_id","seq");
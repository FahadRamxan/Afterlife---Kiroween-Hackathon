CREATE TYPE "public"."step_status" AS ENUM('queued', 'running', 'done', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "pipeline_steps" (
	"project_id" uuid NOT NULL,
	"step" text NOT NULL,
	"status" "step_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"job_id" text,
	"output" jsonb,
	"error" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_steps_project_id_step_pk" PRIMARY KEY("project_id","step"),
	CONSTRAINT "pipeline_steps_step" CHECK (step in ('possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise', 'twin-replay', 'voice-change')),
	CONSTRAINT "pipeline_steps_attempts" CHECK ("pipeline_steps"."attempts" >= 0)
);
--> statement-breakpoint
CREATE TABLE "project_events" (
	"seq" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "project_events_seq_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"project_id" uuid NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_events_type" CHECK (type in ('step', 'screen', 'observation', 'rule_found', 'soul_updated', 'proof_case', 'exorcism', 'log'))
);
--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_events_project_seq_idx" ON "project_events" USING btree ("project_id","seq");
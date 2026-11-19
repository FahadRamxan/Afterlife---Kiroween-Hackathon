CREATE TYPE "public"."llm_call_status" AS ENUM('ok', 'error', 'invalid', 'over_budget');--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"agent" text NOT NULL,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"attempt" integer NOT NULL,
	"status" "llm_call_status" NOT NULL,
	"request" jsonb NOT NULL,
	"response" jsonb,
	"error" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_counts" CHECK ("llm_calls"."attempt" >= 1 and "llm_calls"."input_tokens" >= 0 and "llm_calls"."output_tokens" >= 0 and "llm_calls"."duration_ms" >= 0)
);
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_project_created_idx" ON "llm_calls" USING btree ("project_id","created_at");
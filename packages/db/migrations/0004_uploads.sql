CREATE TYPE "public"."upload_status" AS ENUM('scanning', 'clean', 'infected', 'failed');--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"sha256" text NOT NULL,
	"size" integer NOT NULL,
	"executable" text NOT NULL,
	"status" "upload_status" DEFAULT 'scanning' NOT NULL,
	"zip" "bytea",
	"bundle" "bytea",
	"scanner" text,
	"finding" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_project_id_unique" UNIQUE("project_id")
);
--> statement-breakpoint
ALTER TABLE "pipeline_steps" DROP CONSTRAINT "pipeline_steps_step";--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_step" CHECK (step in ('possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise', 'twin-replay', 'voice-change', 'scan-upload'));
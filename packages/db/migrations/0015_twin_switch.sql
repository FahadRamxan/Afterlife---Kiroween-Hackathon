ALTER TABLE "projects" ADD COLUMN "primary_app" text DEFAULT 'old' NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "switched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_primary_app" CHECK ("projects"."primary_app" in ('old', 'vessel'));
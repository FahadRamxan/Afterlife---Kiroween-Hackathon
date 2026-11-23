-- Undoes 0015_twin_switch.sql: back to the old app as the only one.
ALTER TABLE "projects" DROP CONSTRAINT "projects_primary_app";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "switched_at";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "primary_app";
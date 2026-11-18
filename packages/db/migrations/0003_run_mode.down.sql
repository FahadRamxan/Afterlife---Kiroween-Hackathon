-- Undoes 0003_run_mode.sql.
ALTER TABLE "projects" DROP COLUMN "mode";--> statement-breakpoint
DROP TYPE "public"."run_mode";

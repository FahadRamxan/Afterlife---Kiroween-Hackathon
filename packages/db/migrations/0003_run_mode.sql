CREATE TYPE "public"."run_mode" AS ENUM('live', 'recorded');--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "mode" "run_mode" DEFAULT 'live' NOT NULL;
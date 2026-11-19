-- Undoes 0004_uploads.sql. Steps of the scan-upload job go first, or the old check fails.
DELETE FROM "pipeline_steps" WHERE "step" = 'scan-upload';--> statement-breakpoint
ALTER TABLE "pipeline_steps" DROP CONSTRAINT "pipeline_steps_step";--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_step" CHECK (step in ('possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise', 'twin-replay', 'voice-change'));--> statement-breakpoint
DROP TABLE "uploads";--> statement-breakpoint
DROP TYPE "public"."upload_status";

-- Undoes 0008_translations.sql. Steps of the translate-soul job go first, or the old check fails.
DELETE FROM "pipeline_steps" WHERE "step" = 'translate-soul';--> statement-breakpoint
ALTER TABLE "pipeline_steps" DROP CONSTRAINT "pipeline_steps_step";--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_step" CHECK (step in ('possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise', 'twin-replay', 'voice-change', 'scan-upload'));--> statement-breakpoint
DROP TABLE "translations";

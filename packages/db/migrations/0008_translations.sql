CREATE TABLE "translations" (
	"hash" text PRIMARY KEY NOT NULL,
	"en" text NOT NULL,
	"ur" text NOT NULL,
	"model" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pipeline_steps" DROP CONSTRAINT "pipeline_steps_step";--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_step" CHECK (step in ('possess', 'archaeology', 'rebirth', 'undertake', 'prove', 'exorcise', 'twin-replay', 'voice-change', 'scan-upload', 'translate-soul'));
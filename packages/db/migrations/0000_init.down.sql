-- Undoes 0000_init.sql: every table (children first), then the enum types.
DROP TABLE "voice_changes";--> statement-breakpoint
DROP TABLE "twin_events";--> statement-breakpoint
DROP TABLE "exorcisms";--> statement-breakpoint
DROP TABLE "certificates";--> statement-breakpoint
DROP TABLE "proof_cases";--> statement-breakpoint
DROP TABLE "proof_runs";--> statement-breakpoint
DROP TABLE "souls";--> statement-breakpoint
DROP TABLE "observations";--> statement-breakpoint
DROP TABLE "sessions";--> statement-breakpoint
DROP TABLE "registry_patterns";--> statement-breakpoint
DROP TABLE "projects";--> statement-breakpoint
DROP TYPE "public"."voice_change_status";--> statement-breakpoint
DROP TYPE "public"."severity";--> statement-breakpoint
DROP TYPE "public"."proof_run_status";--> statement-breakpoint
DROP TYPE "public"."project_status";--> statement-breakpoint
DROP TYPE "public"."project_source";--> statement-breakpoint
DROP TYPE "public"."exorcism_decision";

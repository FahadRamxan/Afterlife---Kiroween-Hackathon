-- Undoes 0014_twin_capture.sql: Ghost Twin's events and the twin token go first.
DELETE FROM "project_events" WHERE type = 'twin';--> statement-breakpoint
ALTER TABLE "project_events" DROP CONSTRAINT "project_events_type";--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_type" CHECK (type in ('step', 'screen', 'observation', 'rule_found', 'soul_updated', 'proof_case', 'exorcism', 'log', 'migration'));--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "twin_token_hash";
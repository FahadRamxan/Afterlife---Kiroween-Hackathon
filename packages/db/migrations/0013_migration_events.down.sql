-- Undoes 0013_migration_events.sql: the Undertaker's progress events go first.
DELETE FROM "project_events" WHERE type = 'migration';--> statement-breakpoint
ALTER TABLE "project_events" DROP CONSTRAINT "project_events_type";--> statement-breakpoint
ALTER TABLE "project_events" ADD CONSTRAINT "project_events_type" CHECK (type in ('step', 'screen', 'observation', 'rule_found', 'soul_updated', 'proof_case', 'exorcism', 'log'));

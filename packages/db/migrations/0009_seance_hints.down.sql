-- Undoes 0009_seance_hints.sql.
ALTER TABLE "observations" DROP COLUMN "hint";--> statement-breakpoint
ALTER TABLE "observations" DROP COLUMN "offset_ms";

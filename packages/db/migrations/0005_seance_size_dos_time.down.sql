-- Undoes 0005_seance_size_dos_time.sql.
ALTER TABLE "sessions" DROP COLUMN "size_bytes";--> statement-breakpoint
ALTER TABLE "projects" DROP COLUMN "dos_time";

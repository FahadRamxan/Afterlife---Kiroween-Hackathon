ALTER TABLE "projects" ADD COLUMN "dos_time" text;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "size_bytes" integer DEFAULT 0 NOT NULL;
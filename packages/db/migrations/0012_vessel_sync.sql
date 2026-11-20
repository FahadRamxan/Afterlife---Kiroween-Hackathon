CREATE TABLE "vessel_sync" (
	"id" uuid PRIMARY KEY NOT NULL,
	"project_id" uuid NOT NULL,
	"action_id" text NOT NULL,
	"item" jsonb NOT NULL,
	"result" jsonb NOT NULL,
	"conflicts" integer DEFAULT 0 NOT NULL,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "vessel_sync" ADD CONSTRAINT "vessel_sync_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vessel_sync_project" ON "vessel_sync" USING btree ("project_id","created_at");
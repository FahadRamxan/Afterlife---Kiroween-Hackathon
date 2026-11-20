CREATE TABLE "vessel_records" (
	"project_id" uuid NOT NULL,
	"file" text NOT NULL,
	"recno" integer NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL,
	"values" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vessel_records_project_id_file_recno_pk" PRIMARY KEY("project_id","file","recno"),
	CONSTRAINT "vessel_records_recno" CHECK ("vessel_records"."recno" >= 0)
);
--> statement-breakpoint
ALTER TABLE "vessel_records" ADD CONSTRAINT "vessel_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;
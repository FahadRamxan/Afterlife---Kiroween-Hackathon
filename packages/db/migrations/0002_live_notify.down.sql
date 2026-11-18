-- Undoes 0002_live_notify.sql.
DROP TRIGGER project_events_notify ON project_events;--> statement-breakpoint
DROP FUNCTION afterlife_notify_project_event();

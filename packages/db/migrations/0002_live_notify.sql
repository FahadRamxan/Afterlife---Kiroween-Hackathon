-- Live events (Prompt 38): every new project event is announced on the channel "project_events"
-- with its project and seq only. A NOTIFY payload is limited to 8000 bytes and a screen event is
-- about 8 kB, so listeners read the event itself from the table.
CREATE FUNCTION afterlife_notify_project_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('project_events', json_build_object('p', NEW.project_id, 's', NEW.seq)::text);
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER project_events_notify AFTER INSERT ON project_events
  FOR EACH ROW EXECUTE FUNCTION afterlife_notify_project_event();

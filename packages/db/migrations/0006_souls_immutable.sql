-- Soul versions are immutable (Prompt 45): a change is a new version, never an edit. Deleting a
-- project still deletes its Souls (the foreign key cascades; that is a DELETE, not an UPDATE).
CREATE FUNCTION afterlife_souls_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Soul versions are immutable: store a new version instead (project %, version %)',
    OLD.project_id, OLD.version;
END;
$$;--> statement-breakpoint
CREATE TRIGGER souls_immutable BEFORE UPDATE ON souls
  FOR EACH ROW EXECUTE FUNCTION afterlife_souls_immutable();

// Projects in Postgres. The timeline is read from every table that belongs to a project.
import { projects, type Db, eq } from '@afterlife/db';
import type { NewProject, Project, ProjectStore, TimelineEvent } from './projects';

const toProject = (r: typeof projects.$inferSelect): Project => ({
  id: r.id,
  name: r.name,
  source: r.source,
  sourceApp: r.sourceApp,
  status: r.status,
  mode: r.mode,
  dosTime: r.dosTime,
  createdAt: r.createdAt.toISOString(),
});

// `rank` puts "project created" first when another event has the same time.
const TIMELINE_SQL = `
  SELECT created_at AS at, 0 AS rank, 'project_created' AS kind, id, name AS summary FROM projects WHERE id = $1
  UNION ALL SELECT created_at, 1, 'session_recorded', id, app FROM sessions WHERE project_id = $1
  UNION ALL SELECT created_at, 1, 'soul_version', id, 'version ' || version FROM souls WHERE project_id = $1
  UNION ALL SELECT started_at, 1, 'proof_run', id, case_count || ' cases' FROM proof_runs WHERE project_id = $1
  UNION ALL SELECT issued_at, 1, 'certificate_issued', id, 'certificate' FROM certificates WHERE project_id = $1
  UNION ALL SELECT created_at, 1, 'exorcism_found', id, title_en FROM exorcisms WHERE project_id = $1
  UNION ALL SELECT created_at, 1, 'voice_change', id, transcript FROM voice_changes WHERE project_id = $1
  ORDER BY at, rank, id
  LIMIT 500`;

export class PgProjectStore implements ProjectStore {
  constructor(private readonly db: Db) {}

  async create(p: NewProject): Promise<Project> {
    const [row] = await this.db.insert(projects).values(p).returning();
    return toProject(row!);
  }

  async get(id: string): Promise<Project | null> {
    const [row] = await this.db.select().from(projects).where(eq(projects.id, id));
    return row ? toProject(row) : null;
  }

  async timeline(id: string): Promise<TimelineEvent[] | null> {
    const r = await this.db.$client.query<{
      at: Date;
      kind: TimelineEvent['kind'];
      id: string;
      summary: string;
    }>(TIMELINE_SQL, [id]);
    if (r.rows[0]?.kind !== 'project_created') return null;
    return r.rows.map((e) => ({
      at: e.at.toISOString(),
      kind: e.kind,
      id: e.id,
      summary: e.summary,
    }));
  }

  async delete(id: string): Promise<boolean> {
    const rows = await this.db
      .delete(projects)
      .where(eq(projects.id, id))
      .returning({ id: projects.id });
    return rows.length > 0;
  }
}

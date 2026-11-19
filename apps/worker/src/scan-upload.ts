// The scan-upload job (Prompt 40): virus-scan an uploaded zip, then build its js-dos bundle. An
// infected zip is deleted and never run; a clean one goes on to possession, inside the emulator.
import { eq, uploads, type Db } from '@afterlife/db';
import { buildBundle, unpackDeadApp } from '@afterlife/emulator';
import type { StepHandler } from './registry';
import type { VirusScanner } from './scanner';

export function scanUpload(deps: { db: Db; scanner: VirusScanner }): StepHandler {
  return async (ctx) => {
    const [u] = await deps.db.select().from(uploads).where(eq(uploads.projectId, ctx.projectId));
    if (!u?.zip) return { status: 'failed', reason: 'There is no uploaded zip to scan' };
    await ctx.log(`Scanning ${u.fileName} with ${deps.scanner.name}`);
    // A scanner that cannot run throws: the attempt fails and is retried, never passed.
    const r = await deps.scanner.scan(u.zip);
    if (!r.clean) {
      await deps.db
        .update(uploads)
        .set({ status: 'infected', finding: r.finding, scanner: deps.scanner.name, zip: null })
        .where(eq(uploads.id, u.id));
      await ctx.log(
        `Virus found: ${r.finding}. The upload was deleted and will not be run.`,
        'error',
      );
      return { status: 'failed', reason: `Virus found: ${r.finding}` };
    }
    // Checked by the API already; checked again here, where the bundle is made.
    const app = unpackDeadApp(u.zip, { executable: u.executable });
    if (!app.ok) {
      await deps.db
        .update(uploads)
        .set({ status: 'failed', finding: app.message, zip: null })
        .where(eq(uploads.id, u.id));
      return { status: 'failed', reason: app.message };
    }
    const bundle = buildBundle({ executable: app.executable, files: app.files });
    await deps.db
      .update(uploads)
      .set({ status: 'clean', scanner: deps.scanner.name, bundle, zip: null })
      .where(eq(uploads.id, u.id));
    await ctx.log(
      `No virus found (${deps.scanner.name}). Built the js-dos bundle for ${app.executable}.`,
    );
    return {
      status: 'done',
      output: { clean: true, scanner: deps.scanner.name, executable: app.executable },
    };
  };
}

/** The bundle of an uploaded app, once it is scanned clean; null before that. */
export async function uploadBundle(db: Db, projectId: string): Promise<Uint8Array | null> {
  const [u] = await db.select().from(uploads).where(eq(uploads.projectId, projectId));
  return u?.status === 'clean' && u.bundle ? u.bundle : null;
}

// The afterlife-emulator MCP server (Prompt 32): tools to drive a dead DOS app and read its
// screen and data. The emulator is injected: HeadlessJsDos in main.ts, a fake in tests.
import { inspectDbf, diffSnapshots, snapshot, type Snapshot } from '@afterlife/dbf';
import {
  EmulatorError,
  KeyParseError,
  dosPath,
  observeScreen,
  recordAction,
  waitForStableScreen,
  withFreshState,
  type EmulatorController,
  type ObservedScreen,
  type RecordOptions,
} from '@afterlife/emulator';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export type AppSource = { name: string; dosTime: string; bundle: () => Promise<Uint8Array> };

export type ServerOptions = {
  /** The apps boot_app can start, by id. */
  apps: Record<string, AppSource>;
  /** A new emulator for each boot. */
  createController: () => Promise<EmulatorController>;
  /** Frees an emulator that is not used any more (default: exit it). */
  destroyController?: (c: EmulatorController) => Promise<void>;
  /** How send_keys waits for the screen (tests make it fast). */
  record?: Omit<RecordOptions, 'files'>;
};

/** Something the caller should do differently: an error result, not a crash. */
class ToolError extends Error {}

type Result = {
  content: { type: 'text'; text: string }[];
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

const ok = (text: string, structured: Record<string, unknown>): Result => ({
  content: [{ type: 'text', text }],
  structuredContent: structured,
});

/** The screen as the agent reads it: the title, then the 25 lines without trailing spaces. */
const screenText = (s: ObservedScreen) =>
  [`Screen: ${s.model.title?.name ?? '(no title)'}`, ...s.text.map((l) => l.trimEnd())]
    .join('\n')
    .trimEnd();
const screenSummary = (s: ObservedScreen) => ({
  title: s.model.title?.name ?? null,
  fingerprint: s.fingerprint,
  text: s.text,
  cursor: s.cursor,
});

export function createEmulatorServer(opts: ServerOptions): McpServer {
  const server = new McpServer({ name: 'afterlife-emulator', version: '0.1.0' });
  let current: { id: string; app: AppSource; emu: EmulatorController; bundle: Uint8Array } | null =
    null;
  let baseline: Snapshot | null = null;

  const destroy = opts.destroyController ?? ((c: EmulatorController) => c.exit());
  const running = () => {
    if (!current)
      throw new ToolError('No app is running: call boot_app first (list_apps names the apps).');
    return current;
  };
  const dbfFiles = async (emu: EmulatorController) =>
    (await emu.listFiles()).filter((f) => /\.DBF$/.test(f));
  const dataSnapshot = async (emu: EmulatorController) =>
    snapshot(
      Object.fromEntries(
        await Promise.all((await dbfFiles(emu)).map(async (f) => [f, await emu.readFile(f)])),
      ),
    );

  // Tool calls run one at a time, in the order they came: two at once would share the emulator
  // (keys from both interleaved, a snapshot taken mid-action).
  let queue: Promise<unknown> = Promise.resolve();
  const oneAtATime = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  /** Runs a tool: our own errors become error results the agent can act on. */
  const tool =
    <A>(fn: (args: A) => Promise<Result>) =>
    (args: A): Promise<Result> =>
      oneAtATime(async () => {
        try {
          return await fn(args);
        } catch (e) {
          if (e instanceof ToolError || e instanceof EmulatorError || e instanceof KeyParseError)
            return { content: [{ type: 'text', text: (e as Error).message }], isError: true };
          throw e;
        }
      });

  /** Boots (or boots again) an app from its bundle, at its DOS clock, on a fresh emulator. */
  async function start(id: string) {
    const app = opts.apps[id];
    if (!app)
      throw new ToolError(
        `Unknown app "${id}". The apps are: ${Object.keys(opts.apps).join(', ')}.`,
      );
    if (current) {
      const old = current.emu;
      current = null;
      await destroy(old);
    }
    baseline = null;
    const bundle = await app.bundle();
    const emu = await opts.createController();
    try {
      await withFreshState(emu, bundle, { dosTime: app.dosTime }, async () => {});
    } catch (e) {
      // Not kept, so give it back: main.ts has a pool of one, and the next boot_app would wait
      // for this emulator for ever.
      await destroy(emu).catch(() => {});
      throw e;
    }
    current = { id, app, emu, bundle };
    const { screen } = await waitForStableScreen(emu, opts.record);
    return ok(screenText(screen), { app: id, name: app.name, screen: screenSummary(screen) });
  }

  server.registerTool(
    'list_apps',
    { description: 'The dead DOS apps this server can start (the Afterlife Graveyard).' },
    tool(async () => {
      const apps = Object.entries(opts.apps).map(([id, a]) => ({
        id,
        name: a.name,
        dosTime: a.dosTime,
      }));
      return ok(apps.map((a) => `${a.id}: ${a.name} (DOS clock ${a.dosTime})`).join('\n'), {
        apps,
      });
    }),
  );

  server.registerTool(
    'boot_app',
    {
      description:
        "Starts a DOS app in the emulator from its original files, with the DOS clock set to the app's own year. Returns its first screen.",
      inputSchema: { name: z.string().describe('The app id from list_apps, for example "shifa"') },
    },
    tool(async ({ name }: { name: string }) => start(name)),
  );

  server.registerTool(
    'send_keys',
    {
      description:
        'Types keys into the running app and waits until the screen settles. Plain text is typed as is; {Enter}, {Esc}, {Tab}, {F1}-{F12}, {Up}, {PgDn}, {Alt+X} press keys; {{} types a brace. Send one action at a time (the DOS keyboard buffer holds 15 keys). Returns the new screen and which data files changed.',
      inputSchema: {
        keys: z.string().describe('A key sequence, for example "1{Enter}PAN500{Enter}4{Enter}"'),
      },
    },
    tool(async ({ keys }: { keys: string }) => {
      const { emu } = running();
      const obs = await recordAction(emu, keys, opts.record);
      const changedTables = Object.keys(obs.dbfDiff.tables).sort();
      const note = changedTables.length
        ? `Data changed: ${changedTables.join(', ')}`
        : 'No data changed.';
      return ok(`${screenText(obs.screenAfter)}\n\n${note}`, {
        keys: obs.keys,
        screen: screenSummary(obs.screenAfter),
        changedTables,
        stable: obs.stable,
        durationMs: obs.durationMs,
      });
    }),
  );

  server.registerTool(
    'read_screen',
    {
      description:
        'Reads the screen of the running app: the 80x25 text decoded from the emulator pixels (no OCR) and the ScreenModel (title, menu, fields, tables, messages).',
    },
    tool(async () => {
      const s = await observeScreen(running().emu);
      return ok(screenText(s), {
        text: s.text,
        model: s.model,
        fingerprint: s.fingerprint,
        cursor: s.cursor,
      });
    }),
  );

  server.registerTool(
    'snapshot_data',
    {
      description:
        "Remembers the app's .DBF data files now, for diff_data. Returns each table's record count.",
    },
    tool(async () => {
      baseline = await dataSnapshot(running().emu);
      const tables = Object.entries(baseline.tables).map(([file, t]) => ({
        file,
        records: t.table.records.length,
      }));
      return ok(tables.map((t) => `${t.file}: ${t.records} records`).join('\n'), { tables });
    }),
  );

  server.registerTool(
    'diff_data',
    {
      description:
        'What changed in the .DBF data files since snapshot_data: inserted, deleted and changed records, with exact numeric deltas.',
    },
    tool(async () => {
      const { emu } = running();
      if (!baseline) throw new ToolError('No snapshot to compare with: call snapshot_data first.');
      const d = diffSnapshots(baseline, await dataSnapshot(emu));
      const lines = Object.entries(d.tables).map(
        ([f, t]) =>
          `${f}: ${t.inserted.length} inserted, ${t.deleted.length} deleted, ${t.updated.length} changed`,
      );
      return ok(
        lines.length ? lines.join('\n') : 'No data changed.',
        d as unknown as Record<string, unknown>,
      );
    }),
  );

  server.registerTool(
    'read_table',
    {
      description:
        'Reads a .DBF table of the running app: its fields and its first records (at most 100).',
      inputSchema: {
        file: z.string().describe('The .DBF file on drive C:, for example "MEDICINE.DBF"'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(100)
          .optional()
          .describe('How many records (default 20)'),
      },
    },
    tool(async ({ file, limit }: { file: string; limit?: number }) => {
      const { emu } = running();
      const path = dosPath(file);
      if (!/\.DBF$/.test(path)) throw new ToolError(`${path} is not a .DBF file`);
      const t = inspectDbf(await emu.readFile(path), limit ?? 20);
      const header = t.fields.map((f) => f.name).join(' | ');
      const rows = t.rows.map((r) =>
        t.fields.map((f) => String(r.values[f.name] ?? '')).join(' | '),
      );
      return ok([`${path}: ${t.recordCount} records`, header, ...rows].join('\n'), {
        file: path,
        ...t,
      });
    }),
  );

  server.registerTool(
    'reset',
    { description: 'Starts the running app again from its original files (all changes are gone).' },
    tool(async () => start(running().id)),
  );

  const close = server.close.bind(server);
  server.close = async () => {
    if (current) {
      const emu = current.emu;
      current = null;
      await destroy(emu);
    }
    await close();
  };
  return server;
}

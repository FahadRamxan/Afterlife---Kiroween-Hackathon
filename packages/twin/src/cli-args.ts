// The afterlife-twin command line (Prompt 76): flags, or the environment for the token so it is not
// in the shell history or the process list.
import { parseArgs } from 'node:util';

export type CliOptions = {
  api: string;
  project: string;
  token: string;
  dir: string;
  intervalMs: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const USAGE = `afterlife-twin: sends each change to a DOS app's data files to Afterlife (Ghost Twin).

  afterlife-twin --api <url> --project <id> --dir <folder> [--interval <ms>]

  --api       the Afterlife API (AFTERLIFE_API)
  --project   the project id, from the Raise page (AFTERLIFE_PROJECT)
  --token     the twin token from the Ghost Twin tab (AFTERLIFE_TWIN_TOKEN, better than the flag)
  --dir       the folder with the app's .DBF files: DOSBox's mounted C: folder (AFTERLIFE_DIR)
  --interval  how often to look, in milliseconds (default 1000)`;

export function parseCli(
  argv: string[],
  env: Record<string, string | undefined>,
): { ok: true; options: CliOptions } | { ok: false; message: string } {
  let values: Record<string, string | boolean | undefined>;
  try {
    values = parseArgs({
      args: argv,
      options: {
        api: { type: 'string' },
        project: { type: 'string' },
        token: { type: 'string' },
        dir: { type: 'string' },
        interval: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
      },
    }).values;
  } catch (e) {
    return { ok: false, message: `${(e as Error).message}\n\n${USAGE}` };
  }
  if (values.help) return { ok: false, message: USAGE };
  const api = (values.api as string | undefined) ?? env.AFTERLIFE_API;
  const project = (values.project as string | undefined) ?? env.AFTERLIFE_PROJECT;
  const token = (values.token as string | undefined) ?? env.AFTERLIFE_TWIN_TOKEN;
  const dir = (values.dir as string | undefined) ?? env.AFTERLIFE_DIR;
  const missing = [
    !api && '--api',
    !project && '--project',
    !token && '--token',
    !dir && '--dir',
  ].filter(Boolean);
  if (missing.length) return { ok: false, message: `Missing ${missing.join(', ')}\n\n${USAGE}` };
  if (!/^https?:\/\//.test(api!)) return { ok: false, message: '--api must be an http(s) URL' };
  if (!UUID.test(project!))
    return { ok: false, message: '--project must be the project id (a UUID)' };
  const intervalMs = Number(values.interval ?? 1000);
  if (!Number.isInteger(intervalMs) || intervalMs < 100 || intervalMs > 60_000)
    return { ok: false, message: '--interval must be 100 to 60000 milliseconds' };
  return {
    ok: true,
    options: { api: api!, project: project!, token: token!, dir: dir!, intervalMs },
  };
}

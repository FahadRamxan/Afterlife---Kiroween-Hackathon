import { execFileSync } from 'node:child_process';

/**
 * Removes the e2e Postgres container (scripts/e2e-api.mjs). On Windows Playwright kills the API
 * script outright, so the script cannot clean up after itself.
 */
export default function globalTeardown() {
  if (process.env.BASE_URL || process.env.E2E_DATABASE_URL) return;
  try {
    const ids = execFileSync('docker', ['ps', '-aq', '--filter', 'label=afterlife-e2e=1'], {
      encoding: 'utf8',
    })
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length) execFileSync('docker', ['rm', '-f', ...ids], { stdio: 'ignore' });
  } catch {
    /* Docker gone: nothing to clean */
  }
}

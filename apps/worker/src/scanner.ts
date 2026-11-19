// The virus scan of an uploaded zip (Prompt 40). In the worker image it is ClamAV (`clamscan`,
// signatures from freshclam at build time). Where ClamAV is not installed (a Windows laptop running
// the e2e tests) the EICAR-only test scanner can be chosen by name, and every result says which
// scanner ran. A scanner that cannot run fails the scan: nothing is let through unscanned.
import { spawn } from 'node:child_process';
import { strFromU8, unzipSync } from 'fflate';

export type ScanResult = { clean: true } | { clean: false; finding: string };
export interface VirusScanner {
  readonly name: string;
  scan(bytes: Uint8Array): Promise<ScanResult>;
}

/** The standard anti-virus test file (harmless; every scanner reports it). */
// Built from two halves, so no file in the repo is the test file (desktop anti-virus would remove it).
export const EICAR = [
  String.raw`X5O!P%@AP[4\PZX54(P^)7CC)7}$`,
  'EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
].join('');

/** clamscan exits 0 clean, 1 infected, 2 error. */
export function parseClamscan(code: number | null, out: string): ScanResult {
  if (code === 0) return { clean: true };
  if (code === 1) return { clean: false, finding: /: (\S+) FOUND/.exec(out)?.[1] ?? 'unknown' };
  throw new Error(
    `The virus scanner failed (exit ${code}): ${out.trim().split('\n').at(-1) ?? ''}`,
  );
}

export class ClamAvScanner implements VirusScanner {
  readonly name = 'ClamAV (clamscan)';
  constructor(private readonly bin = 'clamscan') {}

  scan(bytes: Uint8Array): Promise<ScanResult> {
    return new Promise((resolve, reject) => {
      // "-" reads the zip from stdin; ClamAV looks inside archives itself.
      const p = spawn(this.bin, ['--no-summary', '--stdout', '-'], {
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      let out = '';
      p.stdout.on('data', (d) => (out += d));
      p.stderr.on('data', (d) => (out += d));
      p.on('error', (e) => reject(new Error(`The virus scanner is not available: ${e.message}`)));
      p.on('close', (code) => {
        try {
          resolve(parseClamscan(code, out));
        } catch (e) {
          reject(e);
        }
      });
      p.stdin.end(Buffer.from(bytes));
    });
  }
}

/** Finds only the EICAR test file. Not a virus scan: for test machines without ClamAV. */
export class EicarTestScanner implements VirusScanner {
  readonly name = 'test scanner (EICAR only, not a real virus scan)';

  async scan(bytes: Uint8Array): Promise<ScanResult> {
    const hit = (b: Uint8Array) =>
      strFromU8(b, true).includes('EICAR-STANDARD-ANTIVIRUS-TEST-FILE');
    if (hit(bytes)) return { clean: false, finding: 'EICAR-Test-File' };
    for (const b of Object.values(unzipSync(bytes)))
      if (hit(b)) return { clean: false, finding: 'EICAR-Test-File' };
    return { clean: true };
  }
}

export function scannerFromEnv(env: Record<string, string | undefined>): VirusScanner {
  const v = env.VIRUS_SCANNER ?? 'clamav';
  if (v === 'clamav') return new ClamAvScanner(env.CLAMSCAN_PATH || 'clamscan');
  if (v === 'eicar-test') return new EicarTestScanner();
  throw new Error(`VIRUS_SCANNER must be "clamav" or "eicar-test", not "${v}"`);
}

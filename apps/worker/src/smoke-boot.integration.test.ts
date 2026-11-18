// The Docker smoke test's boot check, run on this machine: two real Shifa emulators at once.
import { describe, expect, it, vi } from 'vitest';
import { smokeBoot } from './smoke-boot';

vi.setConfig({ testTimeout: 120_000 });

describe('smokeBoot', () => {
  it('boots Shifa in two headless emulators and reads its title bar on both', async () => {
    const lines: string[] = [];
    const titles = await smokeBoot({ count: 2, log: (l) => lines.push(l) });
    expect(titles).toHaveLength(2);
    for (const t of titles) expect(t).toMatch(/SHIFA MEDICAL STORE/);
    expect(lines.at(-1)).toBe('SMOKE BOOT OK 2');
  });
});

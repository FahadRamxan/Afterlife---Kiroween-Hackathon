import { describe, expect, it, vi } from 'vitest';
import { changeLine, compareVersions, listVersions, showValue } from './soul-versions';

describe('soul versions client', () => {
  it('lists versions and compares two, or gives null when it cannot', async () => {
    const versions = [
      {
        version: 2,
        createdAt: 'x',
        createdBy: 'owner',
        rules: 6,
        changes: { added: 0, removed: 1, changed: 1, entities: 0, screens: 0, actions: 0 },
      },
    ];
    const f = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ versions }), { status: 200 }));
    expect(await listVersions('https://a/', 'p', f)).toEqual(versions);
    expect(f).toHaveBeenCalledWith('https://a/api/projects/p/souls', expect.anything());
    const c = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ diff: { from: 1, to: 2 } }), { status: 200 }),
      );
    expect(await compareVersions('https://a', 'p', 1, 2, c)).toEqual({ from: 1, to: 2 });
    expect(c).toHaveBeenCalledWith(
      'https://a/api/projects/p/souls/compare?from=1&to=2',
      expect.anything(),
    );
    expect(
      await listVersions('https://a', 'p', vi.fn().mockRejectedValue(new Error('down'))),
    ).toBeNull();
  });

  it('says what changed in a few words', () => {
    expect(
      changeLine({ added: 1, removed: 0, changed: 2, entities: 0, screens: 0, actions: 0 }),
    ).toEqual(['1 added', '2 changed']);
    expect(
      changeLine({ added: 0, removed: 0, changed: 0, entities: 0, screens: 0, actions: 0 }),
    ).toEqual([]);
    expect(showValue('a > 1')).toBe('a > 1');
    expect(showValue(0.9)).toBe('0.9');
  });
});

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(__dirname, '../.kiro/steering');
const read = (f: string) => readFileSync(resolve(dir, f), 'utf8').replace(/\r\n/g, '\n');

const files = ['product.md', 'tech.md', 'structure.md', 'crew.md'];

describe('steering docs (Prompt 3)', () => {
  it.each(files)('%s exists, is always included and under 120 lines', (f) => {
    expect(existsSync(resolve(dir, f))).toBe(true);
    const text = read(f);
    expect(text.startsWith('---\ninclusion: always\n---')).toBe(true);
    expect(text.split('\n').length).toBeLessThanOrEqual(120);
  });

  it('tech.md names pg-boss as the queue', () => {
    expect(read('tech.md')).toMatch(/queue.*pg-boss|pg-boss.*queue/i);
  });

  it.each(['Possessor', 'Archaeologist', 'Surgeon', 'Undertaker', 'Oracle', 'Exorcist'])(
    'product.md and crew.md both describe the %s',
    (agent) => {
      expect(read('product.md')).toContain(agent);
      expect(read('crew.md')).toContain(agent);
    },
  );

  it('crew.md gives inputs and outputs for each agent', () => {
    const crew = read('crew.md');
    expect(crew.match(/\*\*Inputs:\*\*/g)?.length).toBe(6);
    expect(crew.match(/\*\*Outputs:\*\*/g)?.length).toBe(6);
  });

  it('structure.md lists every package', () => {
    const s = read('structure.md');
    for (const p of [
      'soul',
      'vessel',
      'dbf',
      'screen',
      'emulator',
      'oracle',
      'crew',
      'certificate',
      'mcp-emulator',
      'ui',
    ])
      expect(s).toContain(`packages/${p}`);
  });
});

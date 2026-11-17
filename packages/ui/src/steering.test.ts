import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as ui from './index';
import { colors } from './tokens';

const doc = readFileSync(
  resolve(__dirname, '../../../.kiro/steering/design-system.md'),
  'utf8',
).replace(/\r\n/g, '\n');

describe('.kiro/steering/design-system.md (Prompt 8)', () => {
  it('is always included and under 120 lines', () => {
    expect(doc.startsWith('---\ninclusion: always\n---')).toBe(true);
    expect(doc.split('\n').length).toBeLessThanOrEqual(120);
  });

  it('states the core rule', () => {
    expect(doc).toContain('Spooky effects must also mean something functional');
  });

  it.each(Object.entries(colors))('documents %s %s', (name, hex) => {
    expect(doc).toContain(name);
    expect(doc).toContain(hex);
  });

  it.each([
    'Button',
    'Card',
    'Tombstone',
    'CRTFrame',
    'GhostCursor',
    'DiffBadge',
    'ProgressCandle',
    'CertificateFrame',
  ])('documents %s, which the package exports', (name) => {
    expect(doc).toContain(name);
    expect(ui).toHaveProperty(name);
  });

  it('names the three fonts and reduced motion', () => {
    for (const f of ['IBM Plex Mono', 'Inter', 'Noto Nastaliq Urdu', 'prefers-reduced-motion'])
      expect(doc).toContain(f);
  });
});

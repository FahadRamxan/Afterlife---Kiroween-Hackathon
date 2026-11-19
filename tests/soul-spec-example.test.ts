// docs/examples/shifa-kiro-spec is the spec `pnpm soul:spec --example` writes for the reference
// Soul of Shifa: open that folder in Kiro to see it. It must stay what the writer writes today.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { writeKiroSpec } from '@afterlife/soul';
import { describe, expect, it } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from '../packages/soul/src/examples/shifa';

describe('the example Kiro spec in docs', () => {
  it('is exactly what the spec writer gives for the reference Soul of Shifa', () => {
    for (const [path, text] of Object.entries(writeKiroSpec(SHIFA_REFERENCE_SOUL)))
      expect(
        readFileSync(resolve(__dirname, '../docs/examples/shifa-kiro-spec', path), 'utf8'),
        path,
      ).toBe(text);
  });
});

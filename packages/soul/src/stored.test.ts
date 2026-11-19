import { describe, expect, it } from 'vitest';
import { SHIFA_REFERENCE_SOUL } from './examples/shifa';
import { SoulSchema } from './ir';
import { numberSoul, specRequirements } from './stored';

const PROJECT = '0190a6d2-0000-7000-8000-000000000001';

describe('numberSoul', () => {
  it('sets the version and the project, and names the parent when there is one', () => {
    const first = numberSoul(SHIFA_REFERENCE_SOUL, PROJECT, 1, null);
    expect(first.version).toBe(1);
    expect(first.provenance.projectId).toBe(PROJECT);
    expect(first.provenance).not.toHaveProperty('parentVersion');
    const third = numberSoul(SHIFA_REFERENCE_SOUL, PROJECT, 3, 2);
    expect(third.provenance.parentVersion).toBe(2);
    expect(SoulSchema.safeParse(third).success).toBe(true);
  });
});

describe('specRequirements', () => {
  it('is the requirements.md of the Kiro spec, with every rule in it', () => {
    const md = specRequirements(SHIFA_REFERENCE_SOUL);
    expect(md).toMatch(/^# Requirements/m);
    for (const r of SHIFA_REFERENCE_SOUL.rules) expect(md).toContain(r.en);
  });
});

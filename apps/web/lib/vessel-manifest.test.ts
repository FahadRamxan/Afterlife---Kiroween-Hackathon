import { colors } from '@afterlife/ui';
import { describe, expect, it } from 'vitest';
import { vesselManifest } from './vessel-manifest';

describe('vesselManifest', () => {
  it('installs the project’s Vessel: standalone, in the /vessel/ scope, with an icon', () => {
    const m = vesselManifest('0190a0b0-0000-7000-8000-000000000001');
    expect(m).toMatchObject({
      start_url: '/vessel/0190a0b0-0000-7000-8000-000000000001',
      scope: '/vessel/',
      display: 'standalone',
      background_color: colors.graveyard,
    });
    expect(m.start_url.startsWith(m.scope)).toBe(true);
    expect(m.icons[0]).toMatchObject({ src: '/icon.svg', sizes: 'any' });
  });
});

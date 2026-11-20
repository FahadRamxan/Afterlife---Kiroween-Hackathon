// The reborn app's web app manifest (Prompt 60): installable on the phone, opening straight
// into the project's Vessel, full screen, in the Haunted Ledger's page colour.
import { colors } from '@afterlife/ui';

export function vesselManifest(projectId: string) {
  return {
    name: 'Afterlife Vessel',
    short_name: 'Vessel',
    description: 'The reborn app: it works offline on this phone.',
    id: `/vessel/${projectId}`,
    start_url: `/vessel/${projectId}`,
    scope: '/vessel/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: colors.graveyard,
    theme_color: colors.graveyard,
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
  };
}

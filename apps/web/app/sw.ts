// The reborn app's service worker (Prompt 60), built with Serwist into public/sw.js
// (scripts/build-sw.mjs). It is registered
// for /vessel/ only, so the rest of the studio is never served from a cache. Once the app has been
// opened online, its shell (the page and its scripts) comes from the cache when the phone is
// offline; the shop's records are in IndexedDB, not here.
import { NetworkFirst, Serwist, type PrecacheEntry, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}
declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Next's scripts, styles and fonts. Their names change with their content; in dev they also
    // get a ?v=<time> that differs from one render to the next, so the query is not part of the key.
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin && request.method === 'GET' && url.pathname.startsWith('/_next/static/'),
      handler: new NetworkFirst({
        cacheName: 'vessel-shell',
        networkTimeoutSeconds: 3,
        matchOptions: { ignoreSearch: true },
      }),
    },
    // The Vessel's page and the rest of what it loads: the network when there is one, else the copy
    // the page kept in "vessel-shell" (VesselApp) or from the last visit. Not the API, not dev reloads.
    {
      matcher: ({ request, sameOrigin, url }) =>
        sameOrigin &&
        request.method === 'GET' &&
        !url.pathname.startsWith('/api/') &&
        !url.pathname.includes('webpack-hmr') &&
        !url.pathname.includes('hot-update'),
      handler: new NetworkFirst({ cacheName: 'vessel-shell', networkTimeoutSeconds: 3 }),
    },
  ],
});

serwist.addEventListeners();

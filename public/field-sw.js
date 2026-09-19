/**
 * The offline shell for `/field`.
 *
 * **Not optional** — `FIELD-CAPTURE-TOOL.md` §2. The IndexedDB queue covers
 * *saving* with no signal; it does nothing about *opening the page* with no
 * signal, and a cold load in a basement without this is a Safari error page.
 * Which is precisely the situation the tool exists for.
 *
 * Two rules, and the second is as important as the first:
 *
 *  - **Cache-first for the shell** — the HTML, the Supabase UMD bundle, the
 *    icon. These are what make the page open at all.
 *  - **Network-only for every Supabase call**, so a failed write falls into the
 *    queue rather than being answered from a stale cache. A cached POST reply
 *    would tell the tool a capture had landed when it had not.
 *
 * Bump `CACHE_VERSION` on every deploy. There is no build number to reason
 * about here, so a stale shell can outlive a fix indefinitely; `activate`
 * deletes every cache that is not the current one.
 */

// **v2 narrows the worker's scope from `/` to `/field`** (see the registration
// in `field.html`). The bump is load-bearing rather than hygiene: a device that
// already registered v1 keeps the old cache — and the old origin-wide scope —
// until something else evicts it, so the fix would not reach the one phone it
// was written for.
const CACHE_VERSION = 'field-v7';

/**
 * The Supabase bundle is cross-origin, so its response is opaque and cannot be
 * inspected — but it can be cached and replayed, which is all that is needed.
 */
const SHELL = [
  '/field',
  '/field.html',
  '/field-manifest.json',
  '/field-icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_VERSION);
    // `Promise.allSettled`, not `addAll`: `addAll` rejects the whole install if
    // any single URL fails, which would leave no shell at all rather than a
    // partial one.
    await Promise.allSettled(SHELL.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_VERSION).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;            // never cache a write

  const url = new URL(req.url);

  // **Network-only for Supabase and for the link resolver.** A cached answer
  // from either is worse than no answer: the first would fake a successful
  // write, the second would resolve a link to somewhere it no longer points.
  // MapKit JS is versioned by Apple behind `5.x.x` and mints nothing itself,
  // but caching it would pin a build we cannot see — and the token route must
  // never be answered from cache.
  if (url.hostname.endsWith('.supabase.co')
      || url.hostname.endsWith('.apple-mapkit.com')
      || url.pathname.startsWith('/api/')) {
    return;                                    // let the browser do it, and fail honestly
  }

  // Everything else in scope: cache-first, then network, and store what comes
  // back so the second outing is cheaper than the first.
  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) {
      // Refresh in the background so a deploy is picked up on the NEXT open
      // rather than never. Failures are silent — being offline is the normal
      // case here, not an error.
      event.waitUntil((async () => {
        try {
          const fresh = await fetch(req);
          if (fresh && fresh.ok) {
            const cache = await caches.open(CACHE_VERSION);
            await cache.put(req, fresh.clone());
          }
        } catch { /* offline — the cached copy is the answer */ }
      })());
      return cached;
    }

    try {
      const fresh = await fetch(req);
      if (fresh && fresh.ok && url.origin === self.location.origin) {
        const cache = await caches.open(CACHE_VERSION);
        await cache.put(req, fresh.clone());
      }
      return fresh;
    } catch {
      // A navigation with nothing cached: hand back the shell rather than the
      // browser's error page.
      if (req.mode === 'navigate') {
        const shell = await caches.match('/field.html');
        if (shell) return shell;
      }
      throw new Error('offline and not cached');
    }
  })());
});

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
 *  - **Network-first for the page, cache-first for its assets** — the HTML is
 *    the only thing here that carries code, so it is asked of the network first
 *    and falls back to the cached copy the instant that fails. The Supabase UMD
 *    bundle, the icon and the manifest stay cache-first. Together these are what
 *    make the page open at all with no signal.
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
const CACHE_VERSION = 'field-v15';

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

// **§4 — the page asks what the worker is serving.** A page can only report the
// build it IS; the failure mode being guarded against is a worker handing back
// an older one, and only the worker can answer that.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.ask !== 'version') return;
  if (event.ports && event.ports[0]) event.ports[0].postMessage({ version: CACHE_VERSION });
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
  // Overpass joins this list: opening hours change, and a cached answer would
  // offer last month's for as long as the cache survives.
  if (url.hostname.endsWith('.supabase.co')
      || url.hostname.endsWith('.apple-mapkit.com')
      || url.hostname.endsWith('overpass-api.de')
      || url.pathname.startsWith('/api/')) {
    return;                                    // let the browser do it, and fail honestly
  }

  // **The page itself is network-first. Everything else is cache-first.**
  //
  // This is the fix for "the network copy had the fix and the DOM did not".
  // `skipWaiting()` and `clients.claim()` were already here, and CACHE_VERSION
  // has been bumped on every deploy since v2 — neither was the problem. The
  // problem is this handler: a navigation was answered from the cache and the
  // fresh copy was fetched in the BACKGROUND, so the shell you looked at was
  // always the one from the previous open. A new worker cannot help with that,
  // because by the time it installs the old one has already answered.
  //
  // The shell is one small HTML file and it is the only thing here that carries
  // code. Asking the network for it first, with the cached copy as the fallback
  // the moment that fails, costs one request on a connection that is working
  // and changes nothing at all on one that is not — which is the field
  // condition this worker exists for.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_VERSION);
          await cache.put(req, fresh.clone());
        }
        return fresh;
      } catch {
        // Offline, which is normal here — the cached shell is the answer.
        const cached = await caches.match(req) || await caches.match('/field.html');
        if (cached) return cached;
        throw new Error('offline and not cached');
      }
    })());
    return;
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

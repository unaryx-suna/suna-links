// The counted open.
//
// WHY THIS EXISTS SEPARATELY FROM api/itinerary.js
//
// The itinerary route's HTML is edge-cached (`s-maxage=600`,
// `stale-while-revalidate=86400`) because a viral link must not be re-rendered
// per scrape. A cache HIT never reaches the function, so it cannot be counted —
// one link pasted into a group chat can produce a single invocation for many
// real opens. That undercounts, silently, in the direction that shortchanges
// the creator being paid per open.
//
// This route exists to be uncacheable. It records nothing else and returns 204,
// so it is cheap to call and impossible to cache.
//
// WHAT IT MISSES, deliberately stated: a visitor with JavaScript disabled never
// fires it. Crawlers also never fire it, which is a bonus rather than the
// point — they are still recorded by the render path, and still classified, so
// the evidence of scraper traffic is not lost.

import { recordOpen, clientIP } from './_open-log.js';

export default async function handler(req, res) {
  // Never cached, anywhere, by anything. This is the whole reason the route
  // exists — see the note above.
  res.setHeader('Cache-Control', 'no-store, max-age=0');

  // A beacon is fire-and-forget from the page's point of view: it may be sent
  // as the tab is closing, so the answer is 204 and nothing else. Any error
  // here must be invisible — `recordOpen` swallows its own.
  try {
    const params = new URL(req.url || '/', `https://${req.headers['x-forwarded-host'] || req.headers.host}`)
      .searchParams;

    await recordOpen({
      slug: params.get('slug'),
      via: params.get('via'),
      ctx: params.get('ctx'),
      // The page passes its own `document.referrer`, which is where the visitor
      // actually came from. The Referer header on this request is only ever the
      // itinerary page itself, which tells us nothing.
      referrer: params.get('ref') || req.headers.referer || null,
      userAgent: req.headers['user-agent'] || null,
      ip: clientIP(req.headers),
      requestedAt: new Date(),
      source: 'beacon',
    });
  } catch {
    // Swallowed on purpose. A counter may not break, or even inconvenience,
    // the page that calls it.
  }

  res.status(204).end();
}

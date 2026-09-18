/**
 * Follow a Maps short link and return the URL it lands on. Nothing else.
 *
 * `maps.app.goo.gl/xxxx` hides the coordinate behind a redirect the browser
 * cannot read cross-origin, so `/field` cannot parse a pasted short link
 * without help. This is that help and it is deliberately the smallest thing
 * that works: no Supabase, no key, no logging, no body forwarding.
 *
 * **Allowlisted hostnames**, or this becomes a general-purpose redirect
 * follower on a domain people trust — an open proxy that can be pointed at an
 * internal address. Only the four Maps hosts are accepted, and only https.
 *
 * `FIELD-CAPTURE-TOOL.md` §4.2. Parsing a URL is not an API call and costs
 * nothing, which is the whole point: the tool exists to get off the Places API,
 * so it must not open by calling a different one.
 */

const ALLOWED = new Set([
  'maps.app.goo.gl',
  'goo.gl',
  'maps.google.com',
  'www.google.com',
  'maps.apple.com',
]);

/** At most this many hops before giving up — a redirect loop is not our problem to solve. */
const MAX_HOPS = 5;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const raw = (req.query && req.query.url) || '';
  if (!raw) return res.status(400).json({ error: 'missing url' });

  let url;
  try {
    url = new URL(raw);
  } catch {
    return res.status(400).json({ error: 'not a url' });
  }
  if (url.protocol !== 'https:' || !ALLOWED.has(url.hostname)) {
    return res.status(400).json({ error: 'host not allowed' });
  }

  try {
    let current = url.toString();
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      // `redirect: 'manual'` so each hop can be checked against the allowlist
      // rather than trusting fetch to land somewhere acceptable.
      const r = await fetch(current, {
        method: 'GET',
        redirect: 'manual',
        headers: {
          // Google serves the coordinate-bearing URL to a browser UA and a
          // consent interstitial to some others.
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15',
        },
      });
      const location = r.headers.get('location');
      if (!location) return res.status(200).json({ url: current });

      const next = new URL(location, current);
      if (next.protocol !== 'https:' || !ALLOWED.has(next.hostname)) {
        // Landed off the allowlist. Return what we have rather than following
        // it — the caller parses coordinates and will simply find none.
        return res.status(200).json({ url: current });
      }
      current = next.toString();
    }
    return res.status(200).json({ url: current });
  } catch {
    return res.status(502).json({ error: 'could not resolve' });
  }
}

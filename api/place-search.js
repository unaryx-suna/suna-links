/**
 * Search OpenStreetMap for a place by name. Stage one of
 * `docs/briefs/PANEL-SEARCH-BY-NAME.md`.
 *
 * **Why a server route at all.** Not CORS — Nominatim allows browser requests.
 * Their usage policy requires a `User-Agent` that identifies the application,
 * and a browser cannot set that header. So the route exists to be a polite
 * client, and every rule below is theirs rather than ours:
 *
 *   - **Max 1 request/second.** The panel debounces at 350ms; this guards the
 *     other side of that, because a debounce on one device says nothing about
 *     what the endpoint is receiving.
 *   - **A real `User-Agent`**: `Suna/1.0 (https://app.unaryx.com)`.
 *   - **No bulk.** One person typing. Never loop this over a list.
 *
 * No key, no account, no spend. The coordinate it returns is NOT
 * presence-verified — the caller writes `coordinate_source = 'osm_nominatim'`,
 * never `manual_entry_verified`.
 */

const UA = 'Suna/1.0 (https://app.unaryx.com)';
const MIN_QUERY = 3;
const LIMIT = 8;
/** Their floor is one per second. */
const MIN_INTERVAL_MS = 1000;

/**
 * Last call, per warm instance. Not a distributed lock and not pretending to
 * be: one person typing hits one instance, and the client debounce is the
 * primary control. This is the backstop for a fast typist or a double-fire.
 */
let lastCallAt = 0;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const q = ((req.query && req.query.q) || '').trim();
  if (q.length < MIN_QUERY) {
    // Not an error — the caller is still typing.
    return res.status(200).json([]);
  }

  const lat = parseFloat((req.query && req.query.lat) || '');
  const lon = parseFloat((req.query && req.query.lon) || '');

  // **Bias to where he is.** "Wing fat" in Hong Kong must not return Vancouver,
  // and that is the whole difference between useful and useless. `bounded=0`
  // keeps it a bias rather than a hard filter, so a place just outside the box
  // still appears — below the local ones, because Nominatim ranks by relevance
  // within the viewbox first.
  //
  // **And no viewbox at all when the caller sends no coordinate.** That is the
  // panel's "Anywhere" centre: at a desk, adding a place abroad, a near-home
  // box ranks the wrong continent first. The caller decides which posture it is
  // in; this route just honours it.
  //
  // `span` carries the panel's chosen width — the field posture stays at 0.35,
  // a named city widens to match MapKit's region so the two providers are
  // biased to the same place.
  let viewbox = '';
  if (isFinite(lat) && isFinite(lon)) {
    const asked = parseFloat((req.query && req.query.span) || '');
    // Half the span, because a span is the full width and this is a radius.
    const d = isFinite(asked) ? Math.min(Math.max(asked / 2, 0.05), 5) : 0.35;
    viewbox = `&viewbox=${lon - d},${lat + d},${lon + d},${lat - d}&bounded=0`;
  }

  const url = 'https://nominatim.openstreetmap.org/search'
    + `?q=${encodeURIComponent(q)}&format=jsonv2&addressdetails=1`
    + `&limit=${LIMIT}${viewbox}`;

  try {
    // Honour their rate limit before the request, not after.
    const since = Date.now() - lastCallAt;
    if (since < MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS - since);
    lastCallAt = Date.now();

    const r = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
    });
    if (!r.ok) return res.status(502).json({ error: 'search unavailable' });

    const rows = await r.json();
    const out = (Array.isArray(rows) ? rows : []).slice(0, LIMIT).map((row) => ({
      // `name` is the business where OSM has one; `display_name` is the full
      // comma-separated address, whose head repeats the name.
      name: row.name || (row.display_name || '').split(',')[0] || q,
      address: (row.display_name || '').split(',').slice(1).join(',').trim() || null,
      lat: parseFloat(row.lat),
      lon: parseFloat(row.lon),
      source: 'osm_nominatim',
    })).filter((x) => isFinite(x.lat) && isFinite(x.lon));

    return res.status(200).json(out);
  } catch {
    return res.status(502).json({ error: 'search unavailable' });
  }
}

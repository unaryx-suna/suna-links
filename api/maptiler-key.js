/**
 * Hand the admin CMS its basemap key.
 *
 * `tile.openstreetmap.org` refuses us — their usage policy does not permit an
 * application to use it, and they serve a 403 for every request. `de3a0fc`
 * disabled drawing rather than let someone trace a polygon over a wall of
 * refusals. This is the other half: a provider that will actually serve us
 * tiles.
 *
 * ## Why a route and not a constant
 *
 * `admin/index.html` lives in the app repo and is usually opened straight off
 * disk, so it has no build step to inject anything. The key therefore has to be
 * fetched, and the same rule as `mapkit-token.js` applies: it is configured in
 * Vercel and never committed.
 *
 * ## What this key is, and is not
 *
 * A MapTiler client key is **public by design** — it travels in every tile URL
 * and is visible in any browser's network tab. It is not a secret and this
 * route does not pretend otherwise. What protects it is MapTiler's own origin
 * allowlist, configured on their side; that is the control, not obscurity.
 *
 * It is scoped to the free raster tier and used by one internal surface a few
 * times a week. The exposure is a stranger drawing tiles on our quota, which
 * shows up as a quota, and the mitigation is the allowlist.
 *
 * `Access-Control-Allow-Origin: *` because a page opened from `file://` sends
 * `Origin: null`, and an allowlist of one origin would refuse the only caller.
 */

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();

  const key = process.env.MAPTILER_KEY;

  // **Fail loudly and configure nothing.** No committed fallback: the CMS
  // treats this 500 as "no basemap", which keeps drawing disabled — the
  // designed behaviour rather than a silent downgrade to a blank grid.
  if (!key) return res.status(500).json({ error: 'maptiler not configured' });

  return res.status(200).json({ key });
}

/**
 * W-112 (2): a static map for unaryx.com's event pages, from Apple Maps Web
 * Snapshots, signed with the same MapKit key as `mapkit-token.js`.
 *
 *   app.unaryx.com/api/map?lat=-37.8166&lng=144.9466&w=480&h=260
 *
 * Dark, with one sand pin. The route fetches the image and sends it on rather
 * than redirecting to Apple, so the signed URL stays here and the CDN keeps
 * each map for a week (a pin doesn't move). Anything wrong is a 404 with no
 * body: the page hides the map rather than show a broken image.
 *
 * Only a point and a size come in, rounded and clamped, so nobody can use
 * this to sign arbitrary snapshot requests. The `.p8` never leaves the server.
 */

import crypto from 'node:crypto';

const HOST = 'https://snapshot.apple-mapkit.com';

/** The point and size this route will draw, or null. */
export function mapParams(url) {
  let q;
  try { q = new URL(url, 'https://app.unaryx.com').searchParams; } catch { return null; }
  // Number(null) is 0, so a missing value is refused before it's read.
  if (!q.get('lat') || !q.get('lng')) return null;
  const lat = Number(q.get('lat')), lng = Number(q.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 85 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) return null;
  const clamp = (v, lo, hi, d) => { const n = Math.round(Number(v)); return v && Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  return { lat: lat.toFixed(5), lng: lng.toFixed(5), w: clamp(q.get('w'), 200, 640, 480), h: clamp(q.get('h'), 120, 640, 260) };
}

/** The path and query Apple signs, without the signature. */
export function snapshotPath({ lat, lng, w, h }, teamId, keyId) {
  const annotations = JSON.stringify([{ point: `${lat},${lng}`, color: 'F6CB94', markerStyle: 'dot' }]);
  const qs = new URLSearchParams({
    center: `${lat},${lng}`, z: '15', size: `${w}x${h}`, scale: '2', colorScheme: 'dark',
    poi: '0', annotations, teamId, keyId,
  });
  return `/api/v1/snapshot?${qs.toString()}`;
}

export default async function handler(req, res) {
  const p = mapParams(req.url);
  const keyId = process.env.MAPKIT_KEY_ID;
  const teamId = process.env.MAPKIT_TEAM_ID;
  const pem = (process.env.MAPKIT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  const nothing = (maxAge) => { res.setHeader('Cache-Control', `public, max-age=${maxAge}, s-maxage=${maxAge}`); res.status(404).end(); };
  if (!p || !keyId || !teamId || !pem) return nothing(300);

  const path = snapshotPath(p, teamId, keyId);
  // Apple's examples differ on the signature's encoding; try the raw r||s
  // pair first (as the MapKit token needs), then DER.
  for (const dsaEncoding of ['ieee-p1363', 'der']) {
    try {
      const sig = crypto.createSign('SHA256').update(path).sign({ key: pem, dsaEncoding }).toString('base64url');
      const r = await fetch(`${HOST}${path}&signature=${sig}`, { signal: AbortSignal.timeout(5000) });
      if (!r.ok || !/^image\//.test(r.headers.get('content-type') || '')) continue;
      const img = Buffer.from(await r.arrayBuffer());
      res.setHeader('Content-Type', r.headers.get('content-type'));
      res.setHeader('Cache-Control', 'public, max-age=604800, s-maxage=604800, immutable');
      res.setHeader('Access-Control-Allow-Origin', '*');
      return res.status(200).end(img);
    } catch { /* the other encoding, then nothing */ }
  }
  return nothing(600);
}

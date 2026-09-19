/**
 * Mint a short-lived MapKit JS token. Stage two of
 * `docs/briefs/PANEL-SEARCH-BY-NAME.md` §3.
 *
 * **The `.p8` never reaches the browser.** Same rule as the service-role key:
 * the page asks this route for a token, the route signs it, the key stays
 * server-side. A private key shipped to a client is public by definition.
 *
 * No `package.json` exists in this project and none is added — Node's built-in
 * `crypto` signs ES256 without a dependency.
 */

import crypto from 'node:crypto';

const b64url = (b) => Buffer.from(b).toString('base64url');

/** Thirty minutes. Long enough that a search session never re-mints mid-use,
 *  short enough that a leaked token is worth little. */
const TTL_SECONDS = 1800;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  const keyId = process.env.MAPKIT_KEY_ID;
  const teamId = process.env.MAPKIT_TEAM_ID;
  // Vercel keeps real newlines, but a value pasted through some tooling arrives
  // with literal `\n`. Tolerate both rather than fail opaquely on a PEM that
  // looks correct in the dashboard.
  const pem = (process.env.MAPKIT_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  // **Fail loudly and configure nothing.** No hard-coded key, no committed
  // fallback: the client treats this 500 as "MapKit unavailable" and searches
  // OSM instead, which is the designed behaviour rather than an outage.
  if (!keyId || !teamId || !pem) {
    return res.status(500).json({ error: 'mapkit not configured' });
  }

  try {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }));
    const payload = b64url(JSON.stringify({
      iss: teamId,
      iat: now,
      exp: now + TTL_SECONDS,
      origin: 'https://app.unaryx.com',   // Apple validates this
    }));

    // **`ieee-p1363`, not DER.** JWS ES256 wants the raw r||s pair. Node's
    // default DER encoding produces a token Apple rejects with no useful error,
    // and it is the single most common way this route is built wrong.
    const sig = crypto.createSign('SHA256')
      .update(`${header}.${payload}`)
      .sign({ key: pem, dsaEncoding: 'ieee-p1363' });

    // Never logged — not the token, not the key, not even a prefix.
    return res.status(200).json({ token: `${header}.${payload}.${b64url(sig)}` });
  } catch {
    return res.status(500).json({ error: 'could not sign' });
  }
}

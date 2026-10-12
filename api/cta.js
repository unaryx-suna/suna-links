// A tap on the preview's buttons, counted (W-15, stored since W-15c).
//
// "Copy itinerary", Follow and the locked card's "Download Suna" all land
// here. Each tap is one row in `itinerary_cta_taps` (I-20): the slug, the
// platform, whether the tap went to the app's scheme, the share token, and the
// same hashed IP and user-agent class `link_opens` uses. Never the raw IP or
// user agent. Not `link_opens`: get_itinerary_opens() counts every row there,
// so a tap stored with the opens would be paid out as one.
//
// The table has RLS on and no policies, so only the service role writes it.
// The page fires this with sendBeacon (or keepalive) and goes on with the
// hand-off whatever happens here; a slow or failed insert never holds it up.

import { classifyUserAgent, clientIP, hashIP } from './_open-log.js';

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
const PLATFORMS = new Set(['ios', 'android', 'desktop', 'other']);
const clip = (v, n) => (v ? String(v).slice(0, n) : null);

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const params = new URL(req.url || '/', 'https://app.unaryx.com').searchParams;
    const row = {
      slug: clip(params.get('slug'), 64),
      platform: PLATFORMS.has(params.get('platform')) ? params.get('platform') : 'other',
      has_app_scheme: params.get('has_app_scheme') === '1',
      via: clip(params.get('via'), 120),
      ip_hash: hashIP(clientIP(req.headers), process.env.OPEN_LOG_SALT),
      ua_class: classifyUserAgent(req.headers['user-agent']).ua_class,
    };
    console.log(`[itinerary_preview_cta] ${JSON.stringify({ platform: row.platform, has_app_scheme: row.has_app_scheme })}`);

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (row.slug && key) {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/itinerary_cta_taps`, {
        method: 'POST',
        headers: {
          apikey: key, Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json', Prefer: 'return=minimal',
        },
        body: JSON.stringify(row),
        signal: AbortSignal.timeout(2500),
      });
      if (!r.ok) console.warn(`[itinerary_preview_cta] insert rejected: ${r.status}`);
    }
  } catch {
    // A counter may not break, or even inconvenience, the page that calls it.
  }
  res.status(204).end();
}

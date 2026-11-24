/**
 * W-308 Role A (24 Nov): the Panel's Inbox and Orders call oneoff-order from app.unaryx.com, and that function's
 * CORS answers only unaryx.com, so the browser blocks every call ("Failed to fetch"). Until its CORS lists
 * app.unaryx.com, the Panel posts here (same origin) and this forwards the call server to server.
 *
 * It adds nothing and decides nothing: the body and the signed-in admin's own Bearer token go through as they
 * came, and oneoff-order checks is_admin itself. Only the Panel's admin actions pass; the order link's buyer
 * actions don't come this way. No logging of bodies or tokens.
 */
const FN = 'https://voogrbonwmvfwtgzzrxc.supabase.co/functions/v1/oneoff-order';
const ADMIN = new Set(['inbox_list', 'inbox_read', 'list', 'check', 'note', 'drafts_sent', 'delivered', 'set_ready_by', 'refund', 'welcome_list', 'welcome_posted']);

module.exports = async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'POST') { res.status(405).end('{"error":"method"}'); return; }
  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || typeof body !== 'object' || !ADMIN.has(String(body.action))) { res.status(400).end('{"error":"action"}'); return; }
  const auth = String(req.headers.authorization || '');
  const apikey = String(req.headers.apikey || '');
  if (!/^Bearer [A-Za-z0-9._-]{20,4000}$/.test(auth)) { res.status(401).end('{"error":"not_authorised"}'); return; }
  try {
    const r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: auth, ...(apikey ? { apikey } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
    const text = await r.text();
    res.status(r.status).end(text);
  } catch {
    res.status(502).end('{"error":"unavailable"}');
  }
};
module.exports.ADMIN = ADMIN;

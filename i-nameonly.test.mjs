// W-314 OD-web-Q3-3: /i/<readable name> with its code cut off 301s to the one public plan with that name;
// no match is a 404 that says the plan isn't on Suna.
import assert from 'node:assert/strict';
const PLANS = [{ share_slug: 'ab12cd34ef', name: 'A quieter day in Ipoh' }];
globalThis.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: new Map() });
  if (u.includes('/rest/v1/public_itineraries') && u.includes('name=ilike.')) {
    const pat = u.match(/name=ilike\.([^&]+)/)[1].replace(/\*/g, '.*');
    return ok(PLANS.filter((p) => new RegExp(`^${pat}$`, 'i').test(p.name)));
  }
  if (u.includes('order=published_at.desc')) return ok([{ share_slug: 'zz11yy22xx', name: 'Old KL on foot', resolved_city_name: 'Kuala Lumpur' }]);
  if (u.includes('/rest/v1/')) return ok([]);
  return { ok: false, status: 404, json: async () => ({}), text: async () => '', headers: new Map() };
};
const I = await import('./api/itinerary.js');
async function get(url) {
  const o = { code: 0, hdr: {}, body: '' };
  const res = { setHeader(k, v) { o.hdr[k.toLowerCase()] = v; return this; }, status(c) { o.code = c; return this; }, send(b) { o.body = b; return this; }, end(b) { o.body = b || ''; return this; } };
  await I.default({ url, headers: { host: 'app.unaryx.com' } }, res);
  return o;
}
const a = await get('/i/a-quieter-day-in-ipoh?via=tiktok&path=a-quieter-day-in-ipoh');   // as Vercel's rewrite hands it over
assert.equal(a.code, 301); assert.equal(a.hdr.location, 'https://app.unaryx.com/i/a-quieter-day-in-ipoh--ab12cd34ef?via=tiktok');
const b = await get('/i/a-louder-day-in-ipoh');
assert.equal(b.code, 404); assert.match(b.body, /<title>This plan isn(?:'|&#39;|&#x27;)t on Suna<\/title>/); assert.match(b.body, /<h1 id="title">This plan isn't on Suna<\/h1>/);
assert.match(b.body, /<ul class="nf-plans"><li><a href="https:\/\/app\.unaryx\.com\/i\/old-kl-on-foot--zz11yy22xx">(<img[^>]+>|<i aria-hidden="true"><\/i>)<span class="t"><b>Old KL on foot<\/b><span>Kuala Lumpur<\/span>/);
const c = await get('/i/ab12cd34ef');   // a bare code that isn't public: the friendly generic 404, no name lookup
assert.equal(c.code, 404); assert.doesNotMatch(c.body, /This plan isn't on Suna/);
console.log('ok /i/ name-only links');

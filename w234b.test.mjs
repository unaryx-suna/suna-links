// W-234 follow-up: app.unaryx.com/e/<id> for an event Suna sells tickets for goes (302) to its
// page on unaryx.com, query kept; every other event keeps this share page. `node w234b.test.mjs`
import assert from 'node:assert/strict';

const ID = 'a0adacb1-65b5-4772-805d-dddb8da7dd9b';
const E = { id: ID, name: 'QA ticket test', venue: 'Suna test venue', latitude: 3.1478, longitude: 101.6953,
  start_time: new Date(Date.now() + 3 * 864e5).toISOString(), end_time: new Date(Date.now() + 3 * 864e5 + 3 * 36e5).toISOString(),
  price_type: 'paid', price_amount: 20, category: 'Community', status: 'approved' };
let price = 20, priceFails = false, ended = false;
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('select=ticket_price')) return priceFails ? { ok: false, status: 400, json: async () => ({}), text: async () => '' } : ok([{ ticket_price: price }]);
  if (u.includes(`world_events?id=eq.${ID}`)) return ok([ended ? { ...E, start_time: new Date(Date.now() - 2 * 864e5).toISOString(), end_time: new Date(Date.now() - 864e5).toISOString() } : E]);
  return ok([]);
};
const { default: handler } = await import('./api/event.js');
async function call(url) {
  const o = { code: 200, hdr: {}, body: '' };
  const res = { status(c) { o.code = c; return this; }, setHeader(k, v) { o.hdr[k.toLowerCase()] = v; return this; }, send(b) { o.body = b; return this; }, end(b) { if (b) o.body = b; return this; } };
  await handler({ url, headers: { host: 'app.unaryx.com' } }, res);
  return o;
}

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('a ticketed event: 302 to its unaryx.com page, the query kept', async () => {
  price = 20; priceFails = false; ended = false;
  const r = await call(`/e/${ID}?ct=wa-share&via=org-test`);
  assert.equal(r.code, 302);
  assert.match(r.hdr.location, /^https:\/\/unaryx\.com\/events\/kuala-lumpur\/qa-ticket-test-a0adacb1\?ct=wa-share&via=org-test$/);
  assert.equal((await call(`/e/${ID}`)).hdr.location, 'https://unaryx.com/events/kuala-lumpur/qa-ticket-test-a0adacb1');
  // Vercel's rewrite appends ?path=<id>; it never reaches the new address.
  assert.equal((await call(`/e/${ID}?ct=x&path=${ID}`)).hdr.location, 'https://unaryx.com/events/kuala-lumpur/qa-ticket-test-a0adacb1?ct=x');
  assert.equal((await call(`/e/${ID}?path=${ID}`)).hdr.location, 'https://unaryx.com/events/kuala-lumpur/qa-ticket-test-a0adacb1');
});
await t('no tickets, or the price can\'t be read: the share page as before (200)', async () => {
  price = null;
  let r = await call(`/e/${ID}`);
  assert.equal(r.code, 200); assert.match(r.body, /<h1>QA ticket test/);
  price = 20; priceFails = true;
  r = await call(`/e/${ID}`);
  assert.equal(r.code, 200); assert.equal(r.hdr.location, undefined);
});
await t('an ended ticketed event keeps its page here (never redirected)', async () => {
  price = 20; priceFails = false; ended = true;
  const r = await call(`/e/${ID}`);
  assert.equal(r.hdr.location, undefined);
});
process.exit(bad ? 1 : 0);

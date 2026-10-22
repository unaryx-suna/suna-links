// W-85 (I-210): app.unaryx.com/e/<id> for an event events-cleanup cleared
// out: its tombstone keeps the page, Ops's W4 "ended" or W5 "cancelled",
// noindex; 410 for crawlers 90 days past its end, nothing cached then. A link
// to nothing at all still gets "This event isn't listed". Plain node, every
// fetch stubbed: `node tombstone.test.mjs`.
import assert from 'node:assert/strict';

const D = 86400000, NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const id = (h) => `${h}-4444-4444-8444-444444444444`;
const TOMBS = {
  [id('aaaaaaaa')]: { event_id: id('aaaaaaaa'), name: 'Bangsar Night Market', venue: 'Bangsar Shopping Centre', latitude: 3.1428, longitude: 101.6671, start_time: iso(NOW - 10 * D), end_time: iso(NOW - 3 * D), reason: 'ended', removed_at: iso(NOW - 2 * D) },
  [id('bbbbbbbb')]: { event_id: id('bbbbbbbb'), name: 'Rooftop Jazz Night', venue: null, latitude: 3.1428, longitude: 101.6671, start_time: iso(NOW + 5 * D), end_time: iso(NOW + 5 * D + 3e6), reason: 'cancelled', removed_at: iso(NOW - D) },
  [id('cccccccc')]: { event_id: id('cccccccc'), name: 'Old Fair', venue: 'Somewhere', latitude: 3.1428, longitude: 101.6671, start_time: iso(NOW - 130 * D), end_time: iso(NOW - 120 * D), reason: 'ended', removed_at: iso(NOW - 100 * D) },
};
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/world_events')) return ok([]);
  if (u.includes('/rest/v1/event_tombstones')) { const m = u.match(/event_id=eq\.([0-9a-f-]{36})/); return ok(m && TOMBS[m[1]] ? [TOMBS[m[1]]] : []); }
  return ok([]);
};
const { default: handler } = await import('./api/event.js');

async function call(evId, ua = 'Mozilla/5.0 (iPhone)') {
  const o = { code: 200, hdr: {}, body: '' };
  const res = {
    status(c) { o.code = c; return this; }, setHeader(k, v) { o.hdr[k.toLowerCase()] = v; return this; },
    send(b) { o.body = b || ''; return this; }, end(b) { o.body = b || ''; return this; },
  };
  await handler({ url: `/e/${evId}`, headers: { host: 'app.unaryx.com', 'user-agent': ua } }, res);
  return o;
}
const BOT = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('ended: Ops\'s W4, noindex, cached ten minutes', async () => {
  const r = await call(id('aaaaaaaa'));
  assert.equal(r.code, 200);
  assert.match(r.body, /<meta name="robots" content="noindex">/);
  assert.match(r.body, /<span class="pill pill-over">Ended<\/span>/);
  assert.match(r.body, /This ended on \w{3} \d{1,2} \w{3}\./);
  assert.match(r.body, /Here’s what’s on near Bangsar Shopping Centre this week\./);
  assert.match(r.hdr['cache-control'], /s-maxage=600/);
  assert.doesNotMatch(r.body, /This event isn't listed/);
});

await t('cancelled: Ops\'s W5, even before its date', async () => {
  const r = await call(id('bbbbbbbb'));
  assert.equal(r.code, 200);
  assert.match(r.body, /<span class="pill pill-over">Cancelled<\/span>/);
  assert.match(r.body, /The organiser cancelled this\./);
  assert.match(r.body, /Here’s what else is on nearby\./);
  assert.doesNotMatch(r.body, />Get tickets|Save in Suna/);
});

await t('90 days past its end: 410 for a crawler, the page for a person, nothing cached', async () => {
  const bot = await call(id('cccccccc'), BOT);
  assert.equal(bot.code, 410);
  assert.equal(bot.hdr['cache-control'], 'no-store');
  const person = await call(id('cccccccc'));
  assert.equal(person.code, 200);
  assert.equal(person.hdr['cache-control'], 'no-store');
  assert.equal((await call(id('aaaaaaaa'), BOT)).code, 200, 'before 90 days a crawler gets the page');
});

await t('a link to nothing: "This event isn\'t listed", as before', async () => {
  const r = await call(id('dddddddd'));
  assert.equal(r.code, 200);
  assert.match(r.body, /This event isn't listed/);
});

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ all tombstone checks pass\n');
process.exit(bad ? 1 : 0);

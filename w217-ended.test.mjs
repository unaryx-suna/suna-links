// W-217 (1): app.unaryx.com/e/<id> for an event events-cleanup marked
// `completed` (row kept, no tombstone) or `cancelled`: Ops's W4 / W5 page,
// noindex, never "This event isn't listed"; 410 for crawlers 90 days past its
// end. The read asks for approved, completed and cancelled. Plain node, every
// fetch stubbed: `node w217-ended.test.mjs`.
import assert from 'node:assert/strict';

const D = 86400000, NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const id = (h) => `${h}-5555-4555-8555-555555555555`;
const row = (h, status, startDays, endDays, extra = {}) => ({
  id: id(h), name: `Event ${h}`, description: 'A night out.', category: 'Music', latitude: 3.1428, longitude: 101.6671,
  image_url: null, start_time: iso(NOW + startDays * D), end_time: iso(NOW + endDays * D), daily_start_time: null, daily_end_time: null,
  recurrence_type: null, recurrence_days: null, recurrence_until: null, price_type: 'paid', price_amount: 50, price_currency: 'MYR',
  source_url: 'https://example.com/t', venue: 'Bangsar Shopping Centre', organizer_name: null, performer_names: null, on_sale_from: null,
  venue_landmark_id: null, hours_text: null, status, ...extra,
});
const ROWS = {
  [id('aaaaaaaa')]: row('aaaaaaaa', 'completed', -10, -3),
  [id('bbbbbbbb')]: row('bbbbbbbb', 'cancelled', 5, 5.1),
  [id('cccccccc')]: row('cccccccc', 'completed', -130, -120),
  [id('eeeeeeee')]: row('eeeeeeee', 'approved', 2, 2.1),
};
const asked = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/world_events') && u.includes('id=eq.')) {
    asked.push(u);
    const m = u.match(/id=eq\.([0-9a-f-]{36})/);
    return ok(m && ROWS[m[1]] ? [ROWS[m[1]]] : []);
  }
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

await t('the read asks for approved, completed and cancelled, with status', async () => {
  await call(id('aaaaaaaa'));
  assert.match(asked.at(-1), /status=in\.\(approved,completed,cancelled\)/);
  assert.match(asked.at(-1), /select=[^&]*,status/);
});

await t('completed: Ops\'s W4 (200, noindex, Ended), not "isn\'t listed", no Get tickets', async () => {
  const r = await call(id('aaaaaaaa'));
  assert.equal(r.code, 200);
  assert.match(r.body, /<meta name="robots" content="noindex">/);
  assert.match(r.body, /<span class="pill pill-over">Ended<\/span>/);
  assert.match(r.body, /<title>Event aaaaaaaa · Bangsar Shopping Centre · Ended · Suna<\/title>/);
  assert.doesNotMatch(r.body, /This event isn't listed|>Get tickets/);
});

await t('cancelled: Ops\'s W5, even before its date', async () => {
  const r = await call(id('bbbbbbbb'));
  assert.equal(r.code, 200);
  assert.match(r.body, /<span class="pill pill-over">Cancelled<\/span>/);
  assert.match(r.body, /The organiser cancelled this\./);
  assert.doesNotMatch(r.body, />Get tickets|Save in Suna/);
});

await t('completed 120 days ago: 410 for a crawler, the page for a person', async () => {
  assert.equal((await call(id('cccccccc'), BOT)).code, 410);
  assert.equal((await call(id('cccccccc'))).code, 200);
  assert.equal((await call(id('aaaaaaaa'), BOT)).code, 200);
});

await t('approved: unchanged, the live page (indexable, Get tickets)', async () => {
  const r = await call(id('eeeeeeee'));
  assert.equal(r.code, 200);
  assert.doesNotMatch(r.body, /<meta name="robots" content="noindex">/);
  assert.match(r.body, /Get tickets/);
});

await t('nothing at all: still the 404 "isn\'t listed"', async () => {
  const r = await call(id('dddddddd'));
  assert.equal(r.code, 404);
  assert.match(r.body, /This event isn't listed/);
});

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ W-217 ended events\n');
process.exit(bad ? 1 : 0);

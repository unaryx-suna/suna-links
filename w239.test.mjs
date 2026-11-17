// W-239 (Ops OPS-226): on app.unaryx.com an invite-only event is on no list (the "this week"
// rails, events near a place) and its own share page is noindex. The stub answers like
// PostgREST: invite_only rows drop out only when the query asks. `node w239.test.mjs`
import assert from 'node:assert/strict';

const iso = (ms) => new Date(ms).toISOString(), NOW = Date.now(), H = 36e5;
const ev = (id8, name, extra = {}) => ({ id: `${id8}-4444-4444-8444-444444444444`, name, venue: 'Somewhere', latitude: 3.139, longitude: 101.6869,
  start_time: iso(NOW + 20 * H), end_time: iso(NOW + 23 * H), price_type: 'free', category: 'Music', invite_only: false, ...extra });
const OPEN = ev('aaaaaaaa', 'Open night market'), HIDDEN = ev('bbbbbbbb', 'Hidden ticket test', { invite_only: true });
const asked = [];
globalThis.fetch = async (url) => {
  const u = decodeURIComponent(String(url));
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/world_events')) {
    asked.push(u);
    if (u.includes('select=ticket_price')) return ok([{ ticket_price: null }]);
    let rows = [OPEN, HIDDEN];
    if (u.includes('invite_only=not.is.true')) rows = rows.filter((r) => !r.invite_only);
    const id = u.match(/id=eq\.([0-9a-f-]{36})/);
    if (id) rows = rows.filter((r) => r.id === id[1]);
    return ok(rows);
  }
  return ok([]);
};
const { eventsAround } = await import('./api/_clip.js');
const { default: event } = await import('./api/event.js');
async function call(url) {
  const o = { code: 200, hdr: {}, body: '' };
  const res = { status(c) { o.code = c; return this; }, setHeader(k, v) { o.hdr[k.toLowerCase()] = v; return this; }, send(b) { o.body = b; return this; }, end(b) { if (b) o.body = b; return this; } };
  await event({ url, headers: { host: 'app.unaryx.com' } }, res);
  return o;
}
let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('the "this week" rails (eventsAround) never include an invite-only event', async () => {
  const rows = await eventsAround(3.139, 101.6869, { km: 5 });
  assert.deepEqual(rows.map((r) => r.name), ['Open night market']);
});
await t('events near a place (place.js) ask for invite_only=not.is.true too', async () => {
  const src = (await import('node:fs')).readFileSync('api/place.js', 'utf8');
  assert.match(src, /world_events\?status=eq\.approved&invite_only=not\.is\.true&\$\{box/);
});
await t('its own share page works (200) but is noindex; the open event\'s page is indexed and its rail leaves the hidden one out', async () => {
  const h = await call(`/e/${HIDDEN.id}`);
  assert.equal(h.code, 200);
  assert.match(h.body, /<meta name="robots" content="noindex">/);
  const o = await call(`/e/${OPEN.id}`);
  assert.equal(o.code, 200);
  assert.doesNotMatch(o.body, /name="robots"/);
  assert.ok(!o.body.includes('Hidden ticket test'));
});
process.exit(bad ? 1 : 0);

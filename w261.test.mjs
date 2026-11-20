// W-261 (Ops OPS-277): /place/ and /e/ opened from a user's share in the app
// (?via=user-<code>&utm_source=user_share&utm_medium=share) have ct=user-share
// on the App Store link: one channel ct, never the user's code. A verified
// partner / a known via still wins. `node w261.test.mjs`
import assert from 'node:assert/strict';

const PLACE = 'f6946e57-455d-41d1-88de-f44fb613f76c';
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, text: async () => body, json: async () => body });
  if (u.includes('/rest/v1/landmarks')) return ok([{ id: PLACE, name: 'Aquaria KLCC', category: 'Attraction', description: 'x'.repeat(80), address: 'KLCC', cover_image_url: null, city_id: null, city: { country_code: 'MY' }, latitude: 3.1537, longitude: 101.7134 }]);
  if (u === 'https://unaryx.com/go/places.json') return ok({ places: [] });
  if (u.includes('/rpc/listing_public')) return ok([]);
  return { ok: false, json: async () => [], text: async () => '' };
};
const { default: place, userShare } = await import('./api/place.js');
const { ctFrom } = await import('./api/event.js');

async function render(path) {
  let body = '', code = 0;
  await place({ url: path, headers: { host: 'app.unaryx.com' } },
    { status(c) { code = c; return this; }, setHeader() { return this; }, send(b) { body = b; return this; }, end(b) { if (b) body = b; } });
  return { code, body };
}
const cts = (body) => [...new Set([...body.matchAll(/apps\.apple\.com[^"]*?ct=([^&"]+)/g)].map((m) => m[1]))];

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('place: plain link keeps place-page; a user share is user-share; the code is never a ct', async () => {
  const a = await render(`/place/${PLACE}`);
  assert.equal(a.code, 200);
  assert.deepEqual(cts(a.body), ['place-page']);
  const b = await render(`/place/${PLACE}?via=user-k3x9q2&utm_source=user_share&utm_medium=share&src=first_save`);
  assert.deepEqual(cts(b.body), ['user-share']);
  assert.doesNotMatch(b.body, /ct=user-k3x9q2/);
  assert.equal(userShare('/place/x?utm_source=user_share'), true);
  assert.equal(userShare('/place/x?utm_source=chatgpt.com'), false);
});
await t('event /e/: user share is user-share; a known via wins; otherwise unchanged', () => {
  assert.equal(ctFrom('/e/abc?via=user-k3x9q2&utm_source=user_share&utm_medium=share'), 'user-share');
  assert.equal(ctFrom('/e/abc?via=creator-mira&utm_source=user_share'), 'creator-mira');
  assert.equal(ctFrom('/e/abc?src=event-web'), 'event-web');
  assert.equal(ctFrom('/e/abc'), 'web-e');
});

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

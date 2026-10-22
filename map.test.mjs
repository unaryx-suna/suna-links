// W-112: /api/map (an Apple Maps snapshot for unaryx.com's event pages) and
// /e/<id>?src=event-web (Save in Suna's App Store ct). Plain node, a throwaway
// EC key, every fetch stubbed: `node map.test.mjs`.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

const { default: handler, mapParams, snapshotPath } = await import('./api/map.js');
const { ctFrom } = await import('./api/event.js');

await t('only a point and a size come in, rounded and clamped; nonsense is refused', () => {
  assert.deepEqual(mapParams('/api/map?lat=-37.816612&lng=144.946611&w=480&h=260'), { lat: '-37.81661', lng: '144.94661', w: 480, h: 260 });
  assert.deepEqual(mapParams('/api/map?lat=3.1&lng=101.6&w=9999&h=1'), { lat: '3.10000', lng: '101.60000', w: 640, h: 120 });
  for (const q of ['lat=x&lng=1', 'lat=0&lng=0', 'lat=91&lng=1', 'lng=1', '']) assert.equal(mapParams(`/api/map?${q}`), null, q);
});

await t('the signed path: dark, one sand pin, scale 2, our team and key, no signature yet', () => {
  const path = snapshotPath({ lat: '3.10000', lng: '101.60000', w: 480, h: 260 }, 'TEAM', 'KEY');
  const q = new URL(path, 'https://x').searchParams;
  assert.equal(q.get('center'), '3.10000,101.60000');
  assert.equal(q.get('colorScheme'), 'dark');
  assert.equal(q.get('scale'), '2');
  assert.deepEqual(JSON.parse(q.get('annotations')), [{ point: '3.10000,101.60000', color: 'F6CB94', markerStyle: 'dot' }]);
  assert.equal(q.get('teamId'), 'TEAM');
  assert.equal(q.get('signature'), null);
});

const call = async (url) => {
  const o = { h: {}, code: 0, body: null };
  await handler({ url }, { setHeader(k, v) { o.h[k.toLowerCase()] = v; }, status(c) { o.code = c; return this; }, end(b) { o.body = b; } });
  return o;
};

await t('without the MapKit key: 404, briefly cached, nothing fetched', async () => {
  delete process.env.MAPKIT_KEY_ID;
  let fetched = 0; globalThis.fetch = async () => { fetched++; };
  const r = await call('/api/map?lat=3.1&lng=101.6');
  assert.equal(r.code, 404); assert.equal(fetched, 0); assert.match(r.h['cache-control'], /max-age=300/);
});

const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
process.env.MAPKIT_KEY_ID = 'KEY'; process.env.MAPKIT_TEAM_ID = 'TEAM';
process.env.MAPKIT_PRIVATE_KEY = privateKey.export({ type: 'pkcs8', format: 'pem' });

await t('with it: the image, cached a week; the signature verifies over the path', async () => {
  const seen = [];
  globalThis.fetch = async (url) => { seen.push(String(url)); return { ok: true, headers: new Map([['content-type', 'image/png']]), arrayBuffer: async () => new Uint8Array([137, 80, 78, 71]).buffer }; };
  const r = await call('/api/map?lat=-37.8166&lng=144.9466&w=480&h=260');
  assert.equal(r.code, 200); assert.equal(r.h['content-type'], 'image/png'); assert.match(r.h['cache-control'], /s-maxage=604800/);
  const u = new URL(seen[0]);
  const sig = u.searchParams.get('signature');
  const path = seen[0].slice('https://snapshot.apple-mapkit.com'.length).replace(/&signature=[^&]+$/, '');
  assert.ok(crypto.createVerify('SHA256').update(path).verify({ key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(sig, 'base64url')));
});

await t('Apple refuses the first encoding: the second is tried; both refused: 404', async () => {
  let n = 0;
  globalThis.fetch = async () => (++n === 1 ? { ok: false, headers: new Map() } : { ok: true, headers: new Map([['content-type', 'image/png']]), arrayBuffer: async () => new ArrayBuffer(4) });
  assert.equal((await call('/api/map?lat=3.1&lng=101.6')).code, 200); assert.equal(n, 2);
  globalThis.fetch = async () => ({ ok: false, headers: new Map() });
  assert.equal((await call('/api/map?lat=3.1&lng=101.6')).code, 404);
});

await t('/e/: src=event-web gives ct=event-web, anything else web-e', () => {
  assert.equal(ctFrom('/e/abc?action=save&src=event-web'), 'event-web');
  for (const u of ['/e/abc', '/e/abc?src=evil', '/e/abc?src=event-web2']) assert.equal(ctFrom(u), 'web-e', u);
});

await t('/e/: og:image is unaryx.com\'s preview, with the same ?v= its page there uses (a0f5f956ca for this row, from unaryx-site)', async () => {
  const { previewImage } = await import('./api/event.js');
  const row = { id: '11111111-2222-4333-8444-555555555555', name: 'The Street Social: Halloween', venue: 'Harbour Esplanade, Docklands VIC', latitude: -37.81, longitude: 144.94,
    image_url: null, start_time: '2026-10-31T01:00:00Z', end_time: '2026-11-01T08:00:00Z', daily_start_time: '12:00:00', daily_end_time: '19:00:00',
    recurrence_type: null, price_type: 'free', price_amount: null, price_currency: null, description: 'not in the hash' };
  assert.equal(previewImage(row), 'https://unaryx.com/api/og/event/11111111-2222-4333-8444-555555555555.jpg?v=a0f5f956ca');
});

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ all map and save checks pass\n');
process.exit(bad ? 1 : 0);

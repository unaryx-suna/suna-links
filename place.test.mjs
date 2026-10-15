// W-25: the place page shows "Book tickets" only for ids in unaryx.com's
// /go/places.json, and the link is always our own /go/p-<id>.
// Plain node, every fetch stubbed: `node place.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LINKED = 'f6946e57-455d-41d1-88de-f44fb613f76c';
const PLAIN = '66a850b1-5fcd-4532-941e-df2bea8b0fe8';
const SHELL = readFileSync(new URL('./public/place.html', import.meta.url), 'utf8');

let placesList = { places: [LINKED] };
let placesFails = false;
let pin = { latitude: 3.1537, longitude: 101.7134 };
let cover = null;
const heads = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, text: async () => body, json: async () => body });
  if (u.endsWith('/place.html')) return ok(SHELL);
  if (u === 'https://unaryx.com/go/places.json') {
    if (placesFails) throw new Error('timeout');
    return ok(placesList);
  }
  if (u.includes('/rest/v1/landmarks')) return ok([{ name: 'Aquaria KLCC', category: 'Attraction', description: 'x'.repeat(80), address: 'KLCC', cover_image_url: cover, city_id: null, city: { country_code: 'MY' }, ...pin }]);
  if (opts.method === 'HEAD') { heads.push(u); return { ok: true }; }
  if (u.includes('/rpc/listing_public')) return ok([]);
  return { ok: false, json: async () => [] };
};

const { default: handler } = await import('./api/place.js');

async function render(path) {
  let body = '', code = 0;
  await handler({ url: path, headers: { host: 'app.unaryx.com' } },
    { status(c) { code = c; return this; }, setHeader() { return this; }, send(b) { body = b; return this; }, end() {} });
  return { code, body };
}
const bookMeta = (html) => (html.match(/<meta name="suna:book" content="([^"]*)">/) || [])[1] || null;

let bad = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

await t('W-53 og:image: own cover, else the stock image, never a Google photo', async () => {
  const og = (html) => (html.match(/<meta property="og:image" content="([^"]*)">/) || [])[1] || null;
  const { stockFor } = await import('./api/_stock.js');
  const stock = stockFor({ landmarkId: PLAIN, category: 'Attraction', countryCode: 'MY' }).url;
  assert.match(stock, /\/storage\/v1\/object\/public\/place-stock\//);
  // Only Google references: the stock image, and Google is never even asked.
  for (const g of ['https://lh3.googleusercontent.com/p/AF1Qip-x=s1600', 'https://places.googleapis.com/v1/places/abc/photos/def/media?maxWidthPx=800',
    'https://maps.googleapis.com/maps/api/place/photo?photo_reference=abc&maxwidth=800']) {
    cover = g; heads.length = 0;
    const b = (await render(`/place/${PLAIN}`)).body;
    assert.equal(og(b), stock, g);
    assert(!/google(apis|usercontent)\.com/.test(b), 'no Google URL anywhere on the page');
    assert.equal(heads.length, 0, 'no request to Google');
  }
  // No cover: the stock image too.
  cover = null;
  assert.equal(og((await render(`/place/${PLAIN}`)).body), stock);
  // Our own cover wins.
  cover = 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/landmark-covers/x/cover.jpg';
  assert.equal(og((await render(`/place/${PLAIN}`)).body), cover);
  cover = null;
});

await t('a linked place gets our own /go link, from web-place', async () => {
  const r = await render(`/place/${LINKED}`);
  assert.equal(r.code, 200);
  assert.equal(bookMeta(r.body), `https://unaryx.com/go/p-${LINKED}?src=web-place`);
  assert(!r.body.includes('klook'), 'never the partner URL itself');
});

await t('upper-case id still matches', async () => {
  const r = await render(`/place/${LINKED.toUpperCase()}`);
  assert.equal(bookMeta(r.body), `https://unaryx.com/go/p-${LINKED}?src=web-place`);
});

await t('a place with no link gets no Book tickets', async () => {
  assert.equal(bookMeta((await render(`/place/${PLAIN}`)).body), null);
});

await t('places.json down or malformed: page still renders, no link', async () => {
  placesFails = true;
  let r = await render(`/place/${LINKED}`);
  assert.equal(r.code, 200); assert.equal(bookMeta(r.body), null);
  placesFails = false; placesList = { places: 'nope' };
  r = await render(`/place/${LINKED}`);
  assert.equal(r.code, 200); assert.equal(bookMeta(r.body), null);
  placesList = { places: [LINKED] };
});

await t('the link markup: sponsored, new tab, commission line, hidden by default', async () => {
  assert.match(SHELL, /<p id="book" hidden>/);
  assert.match(SHELL, /rel="sponsored noopener"/);
  assert.match(SHELL, /target="_blank"/);
  assert.match(SHELL, /Suna may earn a commission/);
});

// W-47: Take me there for people without Apple Maps.
await t('W-47 a place with a pin gets Apple Maps and Google Maps; the Apple one shows only on Apple devices', async () => {
  pin = { latitude: 3.1537, longitude: 101.7134 };
  const r = await render(`/place/${PLAIN}`);
  assert(r.body.includes('<p id="maps"><a class="map-btn maps-apple" href="https://maps.apple.com/?daddr=3.1537,101.7134&amp;dirflg=w" target="_blank" rel="noopener">Apple Maps</a>'
    + '<a class="map-btn maps-google" href="https://www.google.com/maps/dir/?api=1&amp;destination=3.1537,101.7134&amp;travelmode=walking" target="_blank" rel="noopener">Google Maps</a></p>'));
  assert.match(r.body, /classList\.add\('apple-maps'\)/);
  assert(r.body.includes('html:not(.apple-maps) .maps-apple{display:none !important}'));
  assert(!r.body.includes('<!--MAPS-->'));
});
await t('W-47 no pin, or 0,0: no maps buttons, and the slot is removed', async () => {
  for (const p of [{ latitude: null, longitude: null }, { latitude: 0, longitude: 0 }]) {
    pin = p;
    const r = await render(`/place/${PLAIN}`);
    assert(!r.body.includes('id="maps"'), JSON.stringify(p));
    assert(!r.body.includes('<!--MAPS-->'));
  }
  pin = { latitude: 3.1537, longitude: 101.7134 };
});
await t('W-47 Open in Suna on iPhone is unchanged (the existing suna://place hand-off)', async () => {
  assert.match(SHELL, /btn\.href = 'suna:\/\/place\?id=' \+ encodeURIComponent\(placeID\)/);
  assert.match(SHELL, /btn\.textContent = 'Open in Suna'/);
});

// W-50: Take me there and Book tickets open a new tab; our own links don't.
const { badLinkTargets } = await import('./link-targets.mjs');
await t('W-50 outbound links open a new tab, internal ones never', async () => {
  const r = await render(`/place/${LINKED}`);
  assert.deepEqual(badLinkTargets(r.body), []);
  assert.match(r.body, /<a id="book-link" target="_blank" rel="sponsored noopener">/, 'Book tickets keeps sponsored');
});

console.log(bad ? `\nplace: ${bad} FAILED` : '\nplace: all passed');
process.exit(bad ? 1 : 0);

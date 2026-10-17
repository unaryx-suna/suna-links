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
// W-59: when set, answers the landmarks query from its URL.
let landmarkRows = null;
const landmarkURLs = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, text: async () => body, json: async () => body });
  if (u.endsWith('/place.html')) return ok(SHELL);
  if (u === 'https://unaryx.com/go/places.json') {
    if (placesFails) throw new Error('timeout');
    return ok(placesList);
  }
  if (u.includes('/rest/v1/landmarks')) { landmarkURLs.push(u); if (landmarkRows) return ok(landmarkRows(u)); }
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

// W-59: /place/<slug>--<8 hex> and a bare 8-hex id resolve like the UUID.
{
  const NOTRE = 'a1b2c3d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  const SHORT = NOTRE.slice(0, 8);
  const NOTRE_COVER = 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/landmark-covers/notre/cover.jpg';
  // The visible rows. The hidden one is in the table but RLS never returns it,
  // so the stub doesn't either; the query must ask for visible rows anyway.
  const visible = [
    { id: NOTRE, name: 'Notre-Dame de Paris', category: 'Architecture', description: 'y'.repeat(80), address: 'Paris', cover_image_url: NOTRE_COVER, city_id: null, city: { country_code: 'FR' }, latitude: 48.853, longitude: 2.3499 },
    { id: 'c0ffee00-1111-4222-8333-444455556666', name: 'Хиймэл нуур', category: 'Park', description: 'z'.repeat(80), address: 'Улаанбаатар', cover_image_url: null, city_id: null, city: { country_code: 'MN' }, latitude: 47.9, longitude: 106.9 },
    { id: 'beef0000-0000-4000-8000-000000000001', name: 'Twin one', category: 'Cafe', description: 'w'.repeat(80), address: 'x', cover_image_url: null, city_id: null, city: { country_code: 'MY' }, latitude: 3.1, longitude: 101.6 },
    { id: 'beef0000-ffff-4000-8000-000000000002', name: 'Twin two', category: 'Cafe', description: 'w'.repeat(80), address: 'x', cover_image_url: null, city_id: null, city: { country_code: 'MY' }, latitude: 3.1, longitude: 101.6 },
  ];
  landmarkRows = (u) => {
    const q = new URL(u).searchParams;
    assert.equal(q.get('is_hidden'), 'eq.false', 'visible rows only');
    assert.equal(q.get('merged_into'), 'is.null', 'never a merged row');
    assert(!/ilike|::text/.test(u), 'never a text match on the id');
    const ids = q.getAll('id');
    const eq = ids.find((v) => v.startsWith('eq.'));
    const lo = (ids.find((v) => v.startsWith('gte.')) || '').slice(4);
    const hi = (ids.find((v) => v.startsWith('lte.')) || '').slice(4);
    const hit = visible.filter((r) => eq ? r.id === eq.slice(3) : (r.id >= lo && r.id <= hi));
    return hit.slice(0, Number(q.get('limit')));
  };
  const og = (b, p) => (b.match(new RegExp(`<meta property="og:${p}" content="([^"]*)">`)) || [])[1] || null;
  const canon = (b) => (b.match(/<link rel="canonical" href="([^"]*)">/) || [])[1] || null;
  const sunaPlace = (b) => (b.match(/<meta name="suna:place" content="([^"]*)">/) || [])[1] || null;
  const generic = (b) => {
    assert.equal(og(b, 'title'), 'Discover this place on Suna');
    assert.equal(og(b, 'image'), null);
    assert.equal(sunaPlace(b), null);
  };

  await t('W-59 the full UUID: the real preview, canonical to itself', async () => {
    const b = (await render(`/place/${NOTRE}`)).body;
    assert.equal(og(b, 'title'), 'Notre-Dame de Paris — Architecture | Suna');
    assert.equal(canon(b), `https://app.unaryx.com/place/${NOTRE}`);
    assert.equal(sunaPlace(b), NOTRE);
  });
  await t('W-59 slug--short with ctx and via: the real preview, canonical and og:url to the UUID', async () => {
    landmarkURLs.length = 0;
    const r = await render(`/place/notre-dame-de-paris--${SHORT}?ctx=evening&via=share`);
    assert.equal(r.code, 200);
    assert.equal(og(r.body, 'title'), 'Notre-Dame de Paris — Architecture | Suna');
    assert.equal(canon(r.body), `https://app.unaryx.com/place/${NOTRE}`);
    assert.equal(og(r.body, 'url'), `https://app.unaryx.com/place/${NOTRE}`);
    assert.equal(og(r.body, 'image'), NOTRE_COVER, 'our cover');
    assert.equal(sunaPlace(r.body), NOTRE, 'Open in Suna gets the UUID');
    assert(landmarkURLs[0].includes(`id=gte.${SHORT}-0000-0000-0000-000000000000&id=lte.${SHORT}-ffff-ffff-ffff-ffffffffffff`));
  });
  await t('W-59 a bare short id, and upper case, resolve too', async () => {
    for (const p of [`/place/${SHORT}`, `/place/Notre-Dame--${SHORT.toUpperCase()}`]) {
      assert.equal(canon((await render(p)).body), `https://app.unaryx.com/place/${NOTRE}`, p);
    }
  });
  await t('W-59 a non-Latin slug, percent-encoded as a chat sends it', async () => {
    const b = (await render(`/place/${encodeURIComponent('хиймэл-нуур')}--c0ffee00?via=share`)).body;
    assert.equal(og(b, 'title'), 'Хиймэл нуур — Park | Suna');
    assert.equal(sunaPlace(b), 'c0ffee00-1111-4222-8333-444455556666');
  });
  await t('W-59 an unknown short id: the generic card, no canonical', async () => {
    const b = (await render('/place/nowhere--deadbeef')).body;
    generic(b);
    assert.equal(canon(b), null);
  });
  await t('W-59 a hidden or merged place (RLS returns nothing): the generic card', async () => {
    // Hidden ids answer nothing to this key; same path as unknown, by design.
    generic((await render('/place/hidden-place--0badf00d')).body);
  });
  await t('W-59 a short id two places share: the generic card, never a wrong place', async () => {
    const b = (await render('/place/twin--beef0000')).body;
    generic(b);
    assert(!b.includes('Twin one') && !b.includes('Twin two'));
  });
  await t('W-59 junk after /place/: no query at all', async () => {
    landmarkURLs.length = 0;
    for (const p of ['/place/', '/place/notre-dame', '/place/x--a1b2c3', '/place/x--a1b2c3d4e5', "/place/x--a1b2c3d'", '/place/%E0%A4%A']) {
      generic((await render(p)).body);
    }
    assert.equal(landmarkURLs.length, 0);
  });
  await t('W-59 Open in Suna prefers the server-resolved id', async () => {
    assert.match(SHELL, /placeID = meta\('suna:place'\) \|\| placeID;/);
  });
  landmarkRows = null;
}

console.log(bad ? `\nplace: ${bad} FAILED` : '\nplace: all passed');
process.exit(bad ? 1 : 0);

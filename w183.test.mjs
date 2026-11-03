// W-183 (Brian via Ops OPS-106, 3 Nov): Suna's own itineraries on /i/.
// (1) On a plan by Suna (partner 'suna') or owned by @sunatravels a stop shows
//     the place's real photo, else its moment, else no picture; never a
//     place-stock image. Everyone else's plans keep today's order (moment,
//     place photo, stock).
// (2) A cover with no cover_media_path is the first shown stop's real photo,
//     else today's Suna (the bronze egg, /icons/suna-3d-idle.*), never the old
//     SVG Suna with arms and legs, on the preview and on the generic page.
// (3) "Photo: <name> · <licence>" under a place's real photo when its landmark
//     records a real credit; never the bootstrap's 'Suna' marker.
// The real handler renders each case against stubbed rows: `node w183.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';

const SB = 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public';
const REAL = 'https://upload.wikimedia.org/wikipedia/commons/e/ef/Mahavihara_brickfields.jpg';
const PEXELS = `${SB}/landmark-covers/kl/pexels-123.jpg`;
const STOCKURL = `${SB}/place-stock/culinary-spot/southeast-asia/36826038.jpg`;
const MOMENT = 'u1/moment-1.jpg';
const L = (n) => `${String(n).repeat(8)}-aaaa-4aaa-8aaa-${String(n).repeat(12)}`;

// The stops: a stock-only food stop, a stop whose place_image_url is a stock
// image, a real place photo that also has a moment, and a moment only.
const STOPS = [
  { place_name: 'Chennai Cafe', landmark_id: L(1), category: 'Culinary Spot', place_image_url: null, moment_path: null },
  { place_name: 'Stock stop', landmark_id: L(2), category: 'Culinary Spot', place_image_url: STOCKURL, moment_path: null },
  { place_name: 'Maha Vihara', landmark_id: L(3), category: 'Sacred Space', place_image_url: REAL, moment_path: MOMENT, moment_bucket: 'community-post-photos' },
].map((s, i) => ({
  order_index: i, city_name: 'Kuala Lumpur', suggested_time: `${9 + i}:00`, duration_label: '1h', creator_note: '',
  latitude: 3.13, longitude: 101.68, country_code: 'MY', moment_bucket: null, event_id: null, ...s,
}));

const PLANS = {
  suna: { partner_slug: 'suna', partner_name: 'Suna', creator_username: null },
  sunatravels: { partner_slug: null, partner_name: null, creator_username: 'sunatravels' },
  creator: { partner_slug: null, partner_name: null, creator_username: 'elina.lotus' },
};
let plan = 'suna', stops = STOPS, landmarks = [];
const asked = [];
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  asked.push(u);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/public_itineraries')) {
    if (plan === 'missing') return ok([]);
    return ok([{ id: 'p1', name: 'Deepavali walk', intro_story: '', resolved_city_name: 'Kuala Lumpur', recommended_timing: null,
      creator_avatar_url: null, cover_media_path: null, is_creator: false, ...PLANS[plan] }]);
  }
  if (u.includes('/rest/v1/public_itinerary_stops')) return ok(stops);
  if (u.includes('/rest/v1/landmarks')) return ok(landmarks);
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const { default: handler, mascot } = await import('./api/itinerary.js');
const P = await import('./api/_preview.js');

async function render(kind, { withStops = STOPS, lms = [] } = {}) {
  plan = kind; stops = withStops; landmarks = lms;
  let html = '';
  await handler({ url: '/i/deepavali-walk--abc123', headers: { host: 'app.unaryx.com' } },
    { setHeader() { return this; }, status() { return this; }, send(b) { html = b; return this; }, end() {} });
  return html;
}
const stopsOf = (h) => [...h.matchAll(/<li class="stop[^"]*">[\s\S]*?<\/li>/g)].map((m) => m[0]);
const picOf = (li) => (li.match(/<img class="stop-img" src="([^"]+)"/) || [])[1] || null;

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

for (const kind of ['suna', 'sunatravels']) {
  await t(`(1) ${kind}: no stock image anywhere; real photo first, then moment, else a plain card`, async () => {
    const h = await render(kind);
    assert(!/place-stock/.test(h), 'a place-stock URL is on the page');
    assert(!/class="stop-pic stock"/.test(h));
    const [a, b, c] = stopsOf(h);
    assert.equal(picOf(a), null, 'stock-only stop: no picture');
    assert.equal(picOf(b), null, 'a stock place_image_url is not a real photo');
    assert.equal((c.match(/data-full="([^"]+)"/) || [])[1], REAL, 'real photo before the moment');
    // A stop with only a moment shows the moment.
    const onlyMoment = [{ ...STOPS[0], moment_path: MOMENT, moment_bucket: 'community-post-photos' }];
    assert.match(picOf(stopsOf(await render(kind, { withStops: onlyMoment }))[0]), /community-post-photos\/u1\/moment-1\.jpg/);
  });
}

await t('(1) a creator\'s plan keeps today\'s order: moment first, stock for a stock-only stop', async () => {
  const h = await render('creator');
  const [a, , c] = stopsOf(h);
  assert.match(a, /class="stop-pic stock"/, 'stock-only stop keeps its stock image');
  assert.match(picOf(c), /community-post-photos/, 'moment before the place photo');
});

await t('(2) no cover and no real photo in the shown stops: today\'s Suna, never the old SVG Suna', async () => {
  const h = await render('suna', { withStops: STOPS.slice(0, 2) });
  assert.match(h, /<header class="cover cover-plain">/);
  assert.match(h, /<div class="cover-mascot"><picture class="suna-3d"><source srcset="\/icons\/suna-3d-idle\.webp" type="image\/webp"><img src="\/icons\/suna-3d-idle\.png"[^>]*alt="Suna"/);
  assert(!/class="sn |st-idle|suna-grad|<defs>/.test(h), 'old SVG Suna or its defs on the page');
});

await t('(2) no cover: the first shown stop\'s REAL photo is the cover, never a stock one', async () => {
  const h = await render('suna');
  assert.match(h, new RegExp(`<img class="cover-img" src="${REAL.replace(/[.?]/g, '\\$&')}"`));
  assert.equal(P.coverFor({ cover: null, shown: [{ place_image_url: STOCKURL }] }, false), null, 'a stock URL is never the cover');
  assert.equal(P.coverFor({ cover: null, shown: [{ place_image_url: STOCKURL }, { place_image_url: REAL }] }, false), REAL);
});

await t('(2) the generic page (private or missing plan) shows today\'s Suna too', async () => {
  const h = await render('missing');
  assert.match(h, /<div class="mascot"><picture class="suna-3d">/);
  assert(!/class="sn |st-idle/.test(h));
});

await t('(2) the old SVG Suna is drawn by no page: no api file imports suna-faces; the new asset is small and there', async () => {
  for (const f of readdirSync(new URL('./api/', import.meta.url))) {
    if (!f.endsWith('.js')) continue;
    const src = readFileSync(new URL(`./api/${f}`, import.meta.url), 'utf8');
    assert(!/^import[^\n]*suna-faces/m.test(src) && !/sunaSvg\(|SUNA_DEFS/.test(src), f);
  }
  for (const f of ['public/icons/suna-3d-idle.webp', 'public/icons/suna-3d-idle.png']) {
    assert(statSync(new URL(`./${f}`, import.meta.url)).size < 40000, `${f} is over 40 KB`);
  }
  assert.match(mascot(), /width="72" height="96"/);
  assert.doesNotMatch(readFileSync(new URL('./public/i.html', import.meta.url), 'utf8'), /class="sn |st-idle/);
});

await t('(3) creditFor: name and licence; the "Suna" marker, no name and Google never', () => {
  assert.equal(P.creditFor({ photographer_name: 'Ana Lee', cover_source: 'pexels' }), 'Photo: Ana Lee · Pexels License');
  assert.equal(P.creditFor({ photographer_name: 'Ana Lee', cover_source: 'unsplash' }), 'Photo: Ana Lee · Unsplash License');
  assert.equal(P.creditFor({ photographer_name: '@booak55', cover_source: 'user' }), 'Photo: @booak55');
  assert.equal(P.creditFor({ photographer_name: 'Suna', cover_source: null }), null);
  assert.equal(P.creditFor({ photographer_name: null, cover_source: 'commons' }), null);
  assert.equal(P.creditFor({ photographer_name: 'Someone', cover_source: 'google_places' }), null);
  assert.equal(P.creditFor(null), null);
});

await t('(3) on /i/: the credit sits under the stop\'s real photo, only when that photo is the landmark\'s cover', async () => {
  const withPexels = [{ ...STOPS[2], place_image_url: PEXELS, moment_path: null }];
  const h = await render('creator', { withStops: withPexels, lms: [{ id: L(3), cover_image_url: PEXELS, photographer_name: 'Ana <Lee>', cover_source: 'pexels' }] });
  assert.match(h, /<\/div><p class="photo-credit">Photo: Ana &lt;Lee&gt; · Pexels License<\/p>/, 'escaped credit under the photo');
  assert(asked.some((u) => /\/rest\/v1\/landmarks\?id=in\.\(/.test(u) && /select=id,cover_image_url,photographer_name,cover_source/.test(u)));
  const other = await render('creator', { withStops: withPexels, lms: [{ id: L(3), cover_image_url: REAL, photographer_name: 'Ana Lee', cover_source: 'pexels' }] });
  assert(!/<p class="photo-credit"/.test(other), 'a credit for a different photo');
  const marker = await render('suna', { withStops: withPexels, lms: [{ id: L(3), cover_image_url: PEXELS, photographer_name: 'Suna', cover_source: null }] });
  assert(!/<p class="photo-credit"/.test(marker), 'the bootstrap marker shown as a credit');
});

await t('(3) no credit read when no shown stop has a real place photo; a failed read still shows the photos', async () => {
  asked.length = 0;
  await render('suna', { withStops: STOPS.slice(0, 2) });
  assert(!asked.some((u) => u.includes('/rest/v1/landmarks')), 'landmarks read with nothing to credit');
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (u, o) => (String(u).includes('/rest/v1/landmarks') ? { ok: false, status: 500, json: async () => ({}) } : realFetch(u, o));
  try {
    const h = await render('suna', { withStops: [{ ...STOPS[2], moment_path: null }] });
    assert.match(h, /class="stop-img"/);
    assert(!/<p class="photo-credit"/.test(h));
  } finally { globalThis.fetch = realFetch; }
});

await t('(3) place pages: the cover\'s credit in the JSON-LD as an ImageObject; no credit, a plain URL; the landmark read asks for it', async () => {
  const { _placeLD: placeLD } = await import('./api/place.js');
  const ld = (place, cover) => JSON.parse(placeLD({ name: 'Maha Vihara', category: 'Sacred Space', latitude: 3.13, longitude: 101.68, ...place }, 'https://app.unaryx.com/place/x', cover).replace(/^<script[^>]*>|<\/script>$/g, ''));
  assert.deepEqual(ld({ photographer_name: 'Ana Lee', cover_source: 'pexels' }, PEXELS).image,
    { '@type': 'ImageObject', url: PEXELS, creditText: 'Ana Lee · Pexels License', creator: { '@type': 'Person', name: 'Ana Lee' } });
  assert.equal(ld({ photographer_name: 'Suna', cover_source: null }, PEXELS).image, PEXELS, 'the bootstrap marker is no credit');
  assert.equal(ld({ photographer_name: null, cover_source: 'commons' }, REAL).image, REAL);
  assert.equal(ld({ photographer_name: 'Ana Lee', cover_source: 'pexels' }, null).image, undefined, 'no cover, no image');
  assert.match(readFileSync(new URL('./api/place.js', import.meta.url), 'utf8'), /cover_image_url,photographer_name,cover_source,/);
});

if (bad) { console.log(`\n✗ ${bad} failed`); process.exit(1); }
console.log('\n✓ W-183: Suna\'s plans show no stock, today\'s Suna, and photo credits');

// W-232: the plan cover's photo credit on /i/ (iOS I-627 (2d)). Read from the
// same public_itineraries row the page already loads, never a second query.
// usage: node w232.test.mjs
import assert from 'node:assert/strict';
import { planCoverCredit, loadItinerary, coverFor, previewBody } from './api/_preview.js';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

const stop = {
  order_index: 0, place_name: 'Kek Lok Tong', city_name: 'Ipoh', suggested_time: null, duration_label: '1h',
  creator_note: '', latitude: 4.56, longitude: 101.1, landmark_id: null, category: 'Temple', country_code: 'MY',
  place_image_url: 'https://example.com/temple.jpg', moment_path: null, moment_bucket: null,
};
const plan = (extra) => ({
  id: 'p1', name: 'A quieter day in Ipoh', intro_story: '', resolved_city_name: 'Ipoh', recommended_timing: null,
  creator_username: 'jass', creator_avatar_url: null, partner_slug: null, partner_name: null,
  cover_media_path: 'u/p/cover.jpg', is_creator: false, ...extra,
});

let itinUrls = [];
async function render(row, coverResolves = true) {
  itinUrls = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('/rest/v1/public_itineraries')) { itinUrls.push(u); return ok([row]); }
    if (u.includes('/rest/v1/public_itinerary_stops')) return ok([stop]);
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  const data = await loadItinerary('46a381d47d', (p) => (p ? `https://cdn.test/${p}` : null));
  const cover = coverFor(data, coverResolves);
  return previewBody(data, cover, null, '');
}

await t('the wording: Photo: <name> · <licence>; business is Image: <name>; name only; nothing without a name', () => {
  assert.equal(planCoverCredit({ cover_credit_name: 'Photo Dharma from Sadao, Thailand', cover_licence: 'CC BY 2.0' }),
    'Photo: Photo Dharma from Sadao, Thailand, CC BY 2.0');
  assert.equal(planCoverCredit({ cover_credit_name: 'Poppy Kat', cover_licence: 'business' }), 'Image: Poppy Kat');
  assert.equal(planCoverCredit({ cover_credit_name: '  Ana  ', cover_licence: null }), 'Photo: Ana');
  assert.equal(planCoverCredit({ cover_credit_name: null, cover_licence: null }), null);
  assert.equal(planCoverCredit({ cover_credit_name: ' ', cover_licence: 'CC BY 2.0' }), null);
  assert.equal(planCoverCredit({}), null);
});

await t('the columns come with the one itinerary read (no second query)', async () => {
  await render(plan({ cover_credit_name: 'Poppy Kat', cover_licence: 'business' }));
  assert.equal(itinUrls.length, 1);
  assert.match(itinUrls[0], /cover_credit_name,cover_licence/);
});

await t('Ipoh: the credit sits right under the cover', async () => {
  const html = await render(plan({ cover_credit_name: 'Photo Dharma from Sadao, Thailand', cover_licence: 'CC BY 2.0' }));
  assert.match(html, /<\/header>\s*<p class="cover-credit">Photo: Photo Dharma from Sadao, Thailand, CC BY 2\.0<\/p>/);
});

await t('Pet cafés: Image: Poppy Kat', async () => {
  const html = await render(plan({ cover_credit_name: 'Poppy Kat', cover_licence: 'business' }));
  assert.match(html, /<p class="cover-credit">Image: Poppy Kat<\/p>/);
});

await t('no credit stored: no credit line', async () => {
  const html = await render(plan({ cover_credit_name: null, cover_licence: null }));
  assert.doesNotMatch(html, /cover-credit">/);
});

await t('the plan cover does not resolve (first stop photo stands in): no plan credit on it', async () => {
  const html = await render(plan({ cover_credit_name: 'Poppy Kat', cover_licence: 'business' }), false);
  assert.match(html, /class="cover-img" src="https:\/\/example\.com\/temple\.jpg"/);
  assert.doesNotMatch(html, /cover-credit">/);
});

await t('the credit is escaped', async () => {
  const html = await render(plan({ cover_credit_name: '<b>Ana</b> & co', cover_licence: 'CC BY 2.0' }));
  assert.match(html, /cover-credit">Photo: &lt;b&gt;Ana&lt;\/b&gt; &amp; co, CC BY 2\.0</);
});

process.exit(bad ? 1 : 0);

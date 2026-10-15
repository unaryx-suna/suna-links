// W-30: every App Store link on /i/ carries ct=. The page is rendered by the
// real handler (fetch stubbed, no database), then opened in Chromium with
// each `via`. usage: PLAYWRIGHT_BROWSERS_PATH=… node i.test.mjs
// (needs `playwright`; plain `node i.test.mjs` runs the server-side checks only)
import assert from 'node:assert/strict';

const SLUG = 'kl-on-foot--test1234';
const stops = Array.from({ length: 5 }, (_, i) => ({
  order_index: i, place_name: `Stop ${i + 1}`, city_name: 'Kuala Lumpur', suggested_time: `Day 1 · ${9 + i}:00`,
  duration_label: '1h', creator_note: '', latitude: 3.15, longitude: 101.7, landmark_id: null,
  category: 'Food', country_code: 'MY', place_image_url: null, moment_path: null, moment_bucket: null,
}));
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/public_itineraries')) return ok([{ id: 'p1', name: 'KL on foot', intro_story: 'A walk.', resolved_city_name: 'Kuala Lumpur', recommended_timing: null, creator_username: 'jass', creator_avatar_url: null, partner_name: null, share_slug: SLUG, cover_image_path: null }]);
  if (u.includes('/rest/v1/public_itinerary_stops')) return ok(stops);
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const { default: handler } = await import('./api/itinerary.js');
let html = '';
await handler({ url: `/i/${SLUG}`, headers: { host: 'app.unaryx.com' } },
  { setHeader() { return this; }, status() { return this; }, send(b) { html = b; return this; }, end() {} });

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const WEB_I = 'https://apps.apple.com/au/app/suna-things-to-do-near-you/id6759053765?pt=128539200&ct=web-i&mt=8';

await t('server render: the preview has its three link kinds', async () => {
  assert.match(html, /data-preview="1"/);
  assert.match(html, /class="cta locked-cta" data-open-suna/);
  assert.match(html, /class="follow" data-open-suna/);
});
await t('server render: no bare App Store link; every one is ct=web-i', async () => {
  const links = html.match(/href="https:\/\/apps\.apple\.com[^"]*"/g) || [];
  assert(links.length >= 3, `${links.length} links`);
  for (const l of links) assert.equal(l.replace(/&amp;/g, '&'), `href="${WEB_I}"`);
});

await t('W-47 each shown stop has Apple Maps and Google Maps; the locked ones have none', async () => {
  const google = html.match(/class="map-btn maps-google" href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=3\.15,101\.7&amp;travelmode=walking"/g) || [];
  const apple = html.match(/class="map-btn maps-apple" href="https:\/\/maps\.apple\.com\/\?daddr=3\.15,101\.7&amp;dirflg=w"/g) || [];
  assert.equal(google.length, 3); assert.equal(apple.length, 3);
  assert.match(html, /classList\.add\('apple-maps'\)/);
  assert(html.includes('html:not(.apple-maps) .maps-apple{display:none !important}'));
  assert(html.indexOf("classList.add('apple-maps')") < html.indexOf('</head>'), 'decided before first paint');
});

await t('W-53 a stop with only a Google photo gets its stock image; no stock image twice on the page', async () => {
  const { stockFor } = await import('./api/_stock.js');
  const deal = (id) => stockFor({ landmarkId: id, category: 'Food', countryCode: 'MY' }).path;
  const A = 'aaaaaaaa-1111-4111-8111-111111111111';
  let B = null;
  for (let i = 0; !B && i < 5000; i++) {
    const id = `${String(i).padStart(8, '0')}-2222-4222-8222-222222222222`;
    if (deal(id) === deal(A)) B = id;
  }
  const saved = stops.map((x) => ({ ...x }));
  Object.assign(stops[0], { landmark_id: A, place_image_url: 'https://places.googleapis.com/v1/places/x/photos/y/media?maxWidthPx=800' });
  Object.assign(stops[1], { landmark_id: B });
  let page = '';
  await handler({ url: `/i/${SLUG}`, headers: { host: 'app.unaryx.com' } },
    { setHeader() { return this; }, status() { return this; }, send(b) { page = b; return this; }, end() {} });
  stops.forEach((x, i) => Object.assign(x, saved[i]));
  assert(!/places\.googleapis|googleusercontent/.test(page), 'no Google photo, not even as og:image');
  const pics = [...page.matchAll(/<div class="stop-pic stock"><img class="stop-img" src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(pics.length, 2);
  assert.notEqual(pics[0], pics[1]);
  assert(pics[0].includes(deal(A).split('/').pop()), 'the first keeps its own deal');
});

let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('  (playwright not installed: browser checks skipped)'); }
if (chromium) {
  const browser = await chromium.launch();
  const cases = [
    ['tiktok-jasscchua', 'tiktok-jasscchua'],
    ['partner-worq-ttdi', 'partner-worq-ttdi'],
    [null, 'web-i'],
    ['<script>alert(1)</script>', 'web-i'],
    ['a'.repeat(80), 'web-i'],
    ['TikTok-Jass', 'web-i'],
    ['-leading-dash', 'web-i'],
    ['a'.repeat(40), 'a'.repeat(40)],
    ['a'.repeat(41), 'web-i'],
  ];
  const linksFor = async (via, ua) => {
    const page = await browser.newPage(ua ? { userAgent: ua } : {});
    await page.route('**/*', (r) => {
      const u = new URL(r.request().url());
      if (u.hostname === 'app.unaryx.com') return r.fulfill({ contentType: 'text/html', body: html });
      if (u.hostname === 'apps.apple.com') { page.__store = r.request().url(); return r.fulfill({ body: 'store' }); }
      return r.abort();
    });
    const q = via === null ? '' : `?via=${encodeURIComponent(via)}&utm_source=evil&ct=evil&pt=1`;
    await page.goto(`https://app.unaryx.com/i/${SLUG}${q}`);
    const hrefs = await page.evaluate(() => [document.getElementById('cta'), ...document.querySelectorAll('[data-open-suna]')].map((a) => a.href));
    return { page, hrefs };
  };
  for (const [via, ct] of cases) {
    await t(`desktop, via=${via === null ? '(none)' : JSON.stringify(via.length > 20 ? via.slice(0, 12) + '…(' + via.length + ')' : via)} → ct=${ct.length > 20 ? ct.slice(0, 8) + '…' : ct}`, async () => {
      const { page, hrefs } = await linksFor(via);
      assert.equal(hrefs.length, 3);
      for (const h of hrefs) {
        const u = new URL(h);
        assert.equal(u.hostname, 'apps.apple.com');
        assert.deepEqual([...u.searchParams.keys()], ['pt', 'ct', 'mt']);
        assert.equal(u.searchParams.get('pt'), '128539200');
        assert.equal(u.searchParams.get('ct'), ct);
        assert.equal(u.searchParams.get('mt'), '8');
      }
      await page.close();
    });
  }
  await t('iPhone: buttons hand off to the app; the fallback redirect carries ct', async () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
    const { page, hrefs } = await linksFor('tiktok-jasscchua', ua);
    for (const h of hrefs) assert(h.startsWith('suna://itinerary?slug='), h);
    // No app installed: the scheme goes nowhere and the page stays in front.
    await page.evaluate(() => { const a = document.getElementById('cta'); a.addEventListener('click', (e) => e.preventDefault()); a.click(); });
    await page.waitForTimeout(1500);
    const went = await page.evaluate(() => location.href);
    assert.equal(new URL(went).searchParams.get('ct'), 'tiktok-jasscchua', went);
    await page.close();
  });
  await browser.close();
}
// W-50: the stops' maps links open a new tab; our own links don't.
const { badLinkTargets } = await import('./link-targets.mjs');
await t('W-50 outbound links open a new tab, internal ones never', async () => {
  assert.deepEqual(badLinkTargets(html), []);
  assert((html.replace(/<script[\s\S]*?<\/script>/g, '').match(/maps-google" href="[^"]+" target="_blank" rel="noopener"/g) || []).length > 0);
});

console.log(bad ? `\ni: ${bad} FAILED` : '\ni: all passed');
process.exit(bad ? 1 : 0);

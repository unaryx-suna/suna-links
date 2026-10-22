// W-115 (Brian, 22 Oct): Android visitors get the Android waitlist, never the
// App Store. Every page loads public/android.js last; in a browser with an
// Android user agent no App Store link is left, the buttons go to
// https://unaryx.com/android?city=<slug>&from=<kind>, and a tap never ends
// on the App Store (no hand-off redirect). An iPhone is unchanged. The pages
// are rendered by the real handlers with fetch stubbed:
// `node android.test.mjs`. The browser checks run when `playwright` resolves
// (or PLAYWRIGHT=<path to a node_modules/playwright>).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const H = 3600000;
const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const read = (f) => readFileSync(new URL(f, import.meta.url), 'utf8');
const EV = {
  id: '11111111-1111-4111-8111-111111111111', name: 'Night Market', description: 'A night market.', category: 'Market',
  latitude: 3.1478, longitude: 101.6953, image_url: null, start_time: iso(NOW + H), end_time: iso(NOW + 3 * H),
  daily_start_time: null, daily_end_time: null, recurrence_type: null, recurrence_days: null, recurrence_until: null,
  price_type: 'paid', price_amount: 35, price_currency: 'MYR', source_url: 'https://example.com/t',
  venue: 'Jalan Alor', organizer_name: null, performer_names: null, on_sale_from: null, status: 'approved',
};
// No ticket link: Save in Suna is the main button, with a caption about the App Store.
const EV_FREE = { ...EV, id: '33333333-3333-4333-8333-333333333333', price_type: 'free', price_amount: null, source_url: null };
const VENUE = { slug: 'worq-ttdi', name: 'WORQ TTDI', lat: 3.1385, lng: 101.6286, ct: 'partner-worq-ttdi' };
const STOP = (i) => ({
  order_index: i, place_name: `Stop ${i + 1}`, city_name: 'Kuala Lumpur', suggested_time: `Day 1 · ${10 + i}:00`, duration_label: '1h',
  creator_note: 'Go early.', latitude: 3.14, longitude: 101.69, landmark_id: null, category: 'Food', country_code: 'MY',
  place_image_url: null, moment_path: null, moment_bucket: null, event_id: null, event_state: null, event_ends_at: null,
});
const PLACE_SHELL = read('./public/place.html');
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => (typeof b === 'string' ? b : JSON.stringify(b)) });
  if (u.endsWith('/place.html')) return ok(PLACE_SHELL);
  if (u.startsWith('https://unaryx.com/clip/venues.json')) return ok({ venues: [VENUE] });
  if (u.includes('/rest/v1/world_events')) return ok(u.includes('id=eq.') ? [u.includes(EV_FREE.id) ? EV_FREE : EV] : []);
  if (u.includes('/rest/v1/landmarks')) return ok([{ id: '22222222-2222-4222-8222-222222222222', name: 'Aquaria KLCC', category: 'Attraction', description: 'x'.repeat(80), address: 'KLCC', cover_image_url: null, city_id: null, city: { country_code: 'MY' }, latitude: 3.1537, longitude: 101.7134 }]);
  if (u.includes('/rest/v1/public_itineraries')) return ok([{ id: 'p1', name: 'KL nights', intro_story: '', resolved_city_name: 'Kuala Lumpur', recommended_timing: null, creator_username: 'jass', creator_avatar_url: null, partner_name: null, cover_media_path: null }]);
  if (u.includes('/rest/v1/public_itinerary_stops')) return ok([0, 1, 2, 3, 4].map(STOP));
  if (opts.method === 'HEAD') return { ok: true };
  if (u.includes('/rpc/listing_public')) return ok([]);
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};

async function render(mod, url) {
  const { default: handler } = await import(mod);
  let body = '';
  await handler({ url, headers: { host: 'app.unaryx.com' } }, {
    status() { return this; }, setHeader() { return this; }, send(b) { body = b; return this; }, end(b) { if (b) body = b; },
  });
  return body;
}

// path served → [html, page kind, city]
const PAGES = {
  [`/e/${EV.id}`]: [await render('./api/event.js', `/e/${EV.id}`), 'event', 'kuala-lumpur'],
  [`/e/${EV_FREE.id}`]: [await render('./api/event.js', `/e/${EV_FREE.id}`), 'event', 'kuala-lumpur'],
  '/c/worq-ttdi': [await render('./api/venue.js', '/c/worq-ttdi'), 'venue', ''],
  '/place/22222222-2222-4222-8222-222222222222': [await render('./api/place.js', '/place/22222222-2222-4222-8222-222222222222'), 'place', ''],
  '/i/kl-nights--abc1234567': [await render('./api/itinerary.js', '/i/kl-nights--abc1234567'), 'itinerary', ''],
  '/trip/abc': [read('./public/trip.html'), 'trip', ''],
  '/city/kuala-lumpur': [read('./public/city.html'), 'city', 'kuala-lumpur'],
  '/': [read('./public/index.html'), 'home', ''],
};
const SCRIPT = read('./public/android.js');

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('every page loads /android.js once, with its kind, after its own scripts', () => {
  for (const [path, [html, from]] of Object.entries(PAGES)) {
    assert.ok(html.length > 300, `${path} rendered`);
    const tags = html.match(/<script src="\/android\.js" data-from="([a-z-]+)"[^>]*><\/script>/g) || [];
    assert.equal(tags.length, 1, `${path}: once`);
    assert.ok(tags[0].includes(`data-from="${from}"`), `${path}: ${from}`);
    const at = html.indexOf(tags[0]);
    assert.ok(!html.slice(at + tags[0].length).includes('<script'), `${path}: last`);
  }
});

await t('the check returns at its first line off Android', () => {
  assert.match(SCRIPT, /\(function \(\) \{\s+if \(!\/Android\/i\.test\(navigator\.userAgent\)\) return;/);
});

let chromium;
try { ({ chromium } = await import('playwright')); } catch {
  try { ({ chromium } = createRequire(process.env.PLAYWRIGHT || '/nonexistent/')('playwright')); } catch { /* none */ }
}
const UA_ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';

if (!chromium) console.log('  (playwright not installed: browser checks skipped)');
else {
  const browser = await chromium.launch();
  async function open(ua, path) {
    const ctx = await browser.newContext({ userAgent: ua, viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();
    const asked = [];
    await page.route('**/*', (r) => {
      const u = new URL(r.request().url());
      asked.push(u.href);
      if (u.hostname === 'app.unaryx.com' && u.pathname === '/android.js') return r.fulfill({ status: 200, contentType: 'text/javascript', body: SCRIPT });
      if (u.hostname === 'app.unaryx.com' && PAGES[u.pathname]) return r.fulfill({ status: 200, contentType: 'text/html', body: PAGES[u.pathname][0] });
      if (u.hostname === 'unaryx.com' && u.pathname === '/android') return r.fulfill({ status: 200, contentType: 'text/html', body: '<title>waitlist</title>' });
      return r.abort();
    });
    await page.goto(`https://app.unaryx.com${path}`, { waitUntil: 'load' });
    return { page, asked, close: () => ctx.close() };
  }
  const links = (page) => page.$$eval('a', (as) => as.map((a) => ({ href: a.href, text: a.textContent.trim(), android: a.getAttribute('data-android') })));

  for (const [path, [, from, city]] of Object.entries(PAGES)) {
    await t(`Android, ${path}: no App Store link; Join the Android list → unaryx.com/android?…from=${from}; the tap stays off the App Store`, async () => {
      const { page, asked, close } = await open(UA_ANDROID, path);
      const ls = await links(page);
      assert.deepEqual(ls.filter((l) => /apps\.apple\.com/.test(l.href)), [], 'App Store links left');
      const swapped = ls.filter((l) => l.android);
      assert.ok(swapped.length > 0, 'something swapped');
      for (const l of swapped) {
        const u = new URL(l.href);
        assert.equal(u.origin + u.pathname, 'https://unaryx.com/android');
        assert.equal(u.searchParams.get('from'), from);
        assert.equal(u.searchParams.get('city'), city || null);
        assert.equal(l.text, 'Join the Android list');
      }
      assert.ok(await page.$$eval('.android-note', (n) => n.length) > 0, 'the line under it');
      // Tap the first one and wait past every hand-off timer (1.2–1.5 s).
      await Promise.all([page.waitForURL('https://unaryx.com/android**'), page.click('a[data-android]')]);
      await page.waitForTimeout(2200);
      assert.ok(page.url().startsWith('https://unaryx.com/android?'), page.url());
      assert.ok(!asked.some((u) => /apps\.apple\.com|^suna:/.test(u)), 'no App Store or scheme request');
      await close();
    });
    await t(`iPhone, ${path}: unchanged`, async () => {
      const { page, close } = await open(UA_IPHONE, path);
      const ls = await links(page);
      assert.equal(ls.filter((l) => l.android || /unaryx\.com\/android/.test(l.href)).length, 0);
      assert.equal(await page.$$eval('.android-note', (n) => n.length), 0);
      await close();
    });
  }

  await t('Android: no line on any page still promises the App Store; a half-width pair stacks', async () => {
    for (const path of Object.keys(PAGES)) {
      const { page, close } = await open(UA_ANDROID, path);
      const text = await page.evaluate(() => document.body.innerText);
      assert.ok(!/App Store/.test(text), `${path}: ${(text.match(/.*App Store.*/) || [])[0]}`);
      const tall = await page.$$eval('a[data-android]', (as) => as.filter((a) => a.getBoundingClientRect().height > 50).length);
      assert.equal(tall, 0, `${path}: a button wraps`);
      await close();
    }
  });

  await t('Android: no page sends itself to the App Store while it sits there', async () => {
    for (const path of Object.keys(PAGES)) {
      const { page, asked, close } = await open(UA_ANDROID, path);
      await page.waitForTimeout(2000);
      assert.equal(new URL(page.url()).pathname, path, path);
      assert.ok(!asked.some((u) => /apps\.apple\.com/.test(u)), path);
      await close();
    }
  });

  await browser.close();
}

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ all Android checks pass\n');
process.exit(bad ? 1 : 0);

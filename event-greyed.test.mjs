// W-28: an event stop that has ended or been cancelled is greyed on /i/
// (Ops's E2). The page is rendered by the real handler with stubbed view rows;
// `node event-greyed.test.mjs`. The style checks run when `playwright` is
// installed (PLAYWRIGHT_BROWSERS_PATH=…); PHOTO=<png> and SHOT=<png> are
// optional, for a look at the result.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { eventState } from './api/_preview.js';

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();
const stop = (i, extra) => ({
  order_index: i, place_name: `Stop ${i + 1}`, city_name: 'Sydney', suggested_time: `Day 1 · ${18 + i}:30`,
  duration_label: '2h', creator_note: 'Get there early.', latitude: -33.86, longitude: 151.21, landmark_id: null,
  category: 'Events', country_code: 'AU', place_image_url: `https://img.example/${i}.jpg`, moment_path: null, moment_bucket: null,
  event_id: null, event_state: null, event_ends_at: null, ...extra,
});
const renders = {
  a: [
    stop(0, { place_name: 'My Fair Lady', event_id: 'e1', event_state: 'cancelled', event_ends_at: iso(NOW + 864e5) }),
    stop(1, { place_name: 'Gig', event_id: 'e2', event_state: 'ended', event_ends_at: iso(NOW - 36e5) }),
    stop(2, { place_name: 'Still on', event_id: 'e3', event_state: null, event_ends_at: iso(NOW + 36e5) }),
  ],
  b: [
    // The view said "on", but the event has ended since: the cached render must not trust it.
    stop(0, { place_name: 'Just ended', event_id: 'e4', event_state: null, event_ends_at: iso(NOW - 6e4) }),
    // Not an event stop: never greyed, whatever else the row says.
    stop(1, { place_name: 'Plain place', event_state: 'ended' }),
    stop(2, { place_name: 'Cafe' }),
  ],
};
let current = 'a';
let selected = '';
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/public_itineraries')) return ok([{ id: 'p1', name: 'Sydney nights', intro_story: '', resolved_city_name: 'Sydney', recommended_timing: null, creator_username: 'jass', creator_avatar_url: null, partner_name: null, cover_media_path: null }]);
  if (u.includes('/rest/v1/public_itinerary_stops')) { selected = u; return ok(renders[current]); }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const { default: handler } = await import('./api/itinerary.js');
const render = async (which) => {
  current = which;
  let html = '';
  await handler({ url: `/i/sydney-nights--${which}1234567`, headers: { host: 'app.unaryx.com' } },
    { setHeader() { return this; }, status() { return this; }, send(b) { html = b; return this; }, end() {} });
  return html;
};
const html = { a: await render('a'), b: await render('b') };

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const stopsOf = (h) => h.match(/<li class="stop[^"]*">[\s\S]*?<\/li>/g).filter((li) => !li.includes('stop-locked'));

await t('eventState: the view\'s state, else past event_ends_at, else on', async () => {
  assert.equal(eventState({ event_id: 'e', event_state: 'cancelled' }, NOW), 'cancelled');
  assert.equal(eventState({ event_id: 'e', event_state: 'ended' }, NOW), 'ended');
  assert.equal(eventState({ event_id: 'e', event_state: null, event_ends_at: iso(NOW - 1) }, NOW), 'ended');
  assert.equal(eventState({ event_id: 'e', event_state: null, event_ends_at: iso(NOW + 6e4) }, NOW), null);
  assert.equal(eventState({ event_id: 'e', event_state: null, event_ends_at: null }, NOW), null);
  assert.equal(eventState({ event_id: 'e', event_state: 'bogus', event_ends_at: 'not a date' }, NOW), null);
  assert.equal(eventState({ event_id: null, event_state: 'cancelled' }, NOW), null);
  assert.equal(eventState(null, NOW), null);
});
await t('the stops read asks for the three event columns', async () => {
  for (const c of ['event_id', 'event_state', 'event_ends_at']) assert(selected.includes(c), c);
});
await t('cancelled and ended stops get the pill and the class; an event still on does not', async () => {
  const [c, e, on] = stopsOf(html.a);
  assert.match(c, /class="stop stop-over"/); assert.match(c, /<p class="over-pill">Cancelled<\/p>/);
  assert.match(e, /class="stop stop-over"/); assert.match(e, /<p class="over-pill">Ended<\/p>/);
  assert.doesNotMatch(on, /stop-over|over-pill/);
});
await t('the pill comes first in the text, before the time', async () => {
  const [c] = stopsOf(html.a);
  assert(c.indexOf('over-pill') < c.indexOf('stop-meta'));
});
await t('a stop past its end is Ended even when the view still said on; a plain place never greys', async () => {
  const [ended, plain, cafe] = stopsOf(html.b);
  assert.match(ended, /<p class="over-pill">Ended<\/p>/);
  assert.doesNotMatch(plain, /stop-over|over-pill/);
  assert.doesNotMatch(cafe, /stop-over|over-pill/);
});
await t('nothing else changes: name, area, note and the Copy bar are all still there', async () => {
  const [c] = stopsOf(html.a);
  for (const s of ['My Fair Lady', 'Sydney', 'Get there early.', 'stop-img']) assert(c.includes(s), s);
  assert.match(html.a, /id="cta"[^>]*>.*Copy itinerary/);
  assert.doesNotMatch(html.a, /Delete|Get tickets/);
});

let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('  (playwright not installed: browser checks skipped)'); }
if (chromium) {
  const photo = process.env.PHOTO ? readFileSync(process.env.PHOTO) : null;
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  await page.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === 'app.unaryx.com' && u.pathname.startsWith('/i/')) return r.fulfill({ contentType: 'text/html', body: html.a });
    if (u.hostname === 'img.example' && photo) return r.fulfill({ contentType: 'image/png', body: photo });
    return r.abort();
  });
  await page.goto('https://app.unaryx.com/i/sydney-nights--a1234567');
  const styles = await page.evaluate(() => [...document.querySelectorAll('.route .stop:not(.stop-locked)')].map((li) => {
    const cs = (el) => (el ? getComputedStyle(el) : null);
    return {
      over: li.classList.contains('stop-over'),
      pill: cs(li.querySelector('.over-pill')) && { opacity: cs(li.querySelector('.over-pill')).opacity, bg: cs(li.querySelector('.over-pill')).backgroundColor },
      pic: { filter: cs(li.querySelector('.stop-pic')).filter, opacity: cs(li.querySelector('.stop-pic')).opacity },
      meta: cs(li.querySelector('.stop-meta')).opacity,
      name: cs(li.querySelector('.stop-name')).opacity,
      dot: getComputedStyle(li, '::before').backgroundColor,
    };
  }));
  await t('browser: a greyed stop has a full-strength pill, a desaturated photo at 50%, its text at 50%', async () => {
    for (const s of styles.slice(0, 2)) {
      assert.equal(s.pill.opacity, '1');
      assert.equal(s.pill.bg, 'rgb(58, 58, 58)');
      assert.equal(s.pic.filter, 'grayscale(1)');
      assert.equal(s.pic.opacity, '0.5');
      assert.equal(s.meta, '0.5');
      assert.equal(s.name, '0.5');
      assert.equal(s.dot, 'rgb(90, 90, 90)');
    }
  });
  await t('browser: the event still on looks like any stop', async () => {
    const s = styles[2];
    assert.equal(s.pill, null);
    assert.equal(s.pic.filter, 'none');
    assert.equal(s.pic.opacity, '1');
    assert.equal(s.meta, '1');
    assert.equal(s.dot, 'rgb(246, 203, 148)');
  });
  if (process.env.SHOT) {
    const route = await page.$('.route');
    writeFileSync(process.env.SHOT, await route.screenshot());
  }
  await browser.close();
}
console.log(bad ? `\nevent-greyed: ${bad} FAILED` : '\nevent-greyed: all passed');
process.exit(bad ? 1 : 0);

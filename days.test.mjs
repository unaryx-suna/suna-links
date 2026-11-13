// W-197 (Ops OPS-135): /i/ counted "1 day" for "Da Nang & Hoi An in 4 days".
// Days come from the published snapshot's `day` (public_itinerary_stops.day,
// migration 20261105120000), else the 0-based "Day N · " prefix, and the page
// still works before the migration (PostgREST 400 on an unknown column, asked
// again without it). `node days.test.mjs`.
import assert from 'node:assert/strict';
import { stopDay, summaryLine } from './api/_preview.js';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// The live shape of 30b910089c: 13 stops, no suggested_time, days 1–4.
const DAYS = [1, 1, 1, 1, 1, 2, 2, 3, 3, 3, 3, 4, 4];
const stops = DAYS.map((day, i) => ({
  order_index: i, place_name: `Stop ${i + 1}`, city_name: 'Da Nang', suggested_time: null, day,
  duration_label: '1h', creator_note: '', latitude: 16.05, longitude: 108.2, landmark_id: null,
  category: 'Food', country_code: 'VN', place_image_url: null, moment_path: null, moment_bucket: null,
}));
const IT = { id: 'p1', name: 'Da Nang & Hoi An in 4 days', intro_story: '', resolved_city_name: 'Da Nang', recommended_timing: 'Morning', creator_username: 'mira', creator_avatar_url: null, partner_slug: null, partner_name: null, cover_media_path: null, is_creator: true };

await t('stopDay: the snapshot day as is; else "Day N · " + 1 (the prefix is 0-based: live "Day 0" stops are day 1); else null', () => {
  assert.equal(stopDay({ day: 3 }), 3);
  assert.equal(stopDay({ day: null, suggested_time: 'Day 0 · 09:00' }), 1);
  assert.equal(stopDay({ suggested_time: 'Day 2 · Morning' }), 3);
  assert.equal(stopDay({ day: 0, suggested_time: null }), null);
  assert.equal(stopDay({ suggested_time: 'Morning' }), null);
});

await t('summaryLine: "Da Nang · 4 days · 13 stops" (was "1 day"); a one-day plan stays "1 day"', () => {
  assert.equal(summaryLine(IT, stops), 'Da Nang · 4 days · 13 stops');
  assert.equal(summaryLine({ resolved_city_name: 'Kuala Lumpur' }, stops.slice(0, 3)), 'Kuala Lumpur · 1 day · 3 stops');
});

async function render(answerStops) {
  const asked = [];
  globalThis.fetch = async (url) => {
    const u = String(url);
    const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
    if (u.includes('/rest/v1/public_itineraries')) return ok([IT]);
    if (u.includes('/rest/v1/public_itinerary_stops')) { asked.push(u); return answerStops(u); }
    return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
  };
  const { default: handler } = await import('./api/itinerary.js');
  let html = '';
  await handler({ url: '/i/da-nang-hoi-an-in-4-days--30b910089c', headers: { host: 'app.unaryx.com' } },
    { setHeader() { return this; }, status() { return this; }, send(b) { html = b; return this; }, end() {} });
  return { html, asked };
}

await t('the page asks for `day`, and says 4 days, with Day 1 over the first stops', async () => {
  const { html, asked } = await render(() => ({ ok: true, status: 200, json: async () => stops }));
  assert.match(asked[0], /select=[^&]*,day&/);
  assert.match(html, /4 days · 13 stops/);
  assert.doesNotMatch(html, /1 day · 13 stops/);
  assert.match(html, /<h3 class="day-label">Day 1<\/h3>/);
});

await t('W-197 teaser: day chips with counts, ONE locked card ("+10 more stops in the app", "2 more on day 1, then days 2 to 4"), stops 4+ never sent, a pixel tile for a stop with no photo', async () => {
  const { html } = await render(() => ({ ok: true, status: 200, json: async () => stops }));
  for (const c of ['Day 1 · 5', 'Day 2 · 2', 'Day 3 · 4', 'Day 4 · 2']) assert(html.includes(`<span>${c}</span>`), c);
  assert.match(html, /<p class="lt">\+10 more stops in the app<\/p>/);
  assert.match(html, /<p class="ls">2 more on day 1, then days 2 to 4\. Copy the plan/);
  assert.equal((html.match(/<div class="lock">/g) || []).length, 1);
  for (let n = 4; n <= 13; n++) assert(!html.includes(`Stop ${n}<`), `Stop ${n} leaked`);
  assert.match(html, /<div class="stop-pic px-tile"><img src="\/icons\/px\/pintemples\.png"/);
});

await t('before the migration (400 on `day`): asked again without it, the page still renders', async () => {
  const { html, asked } = await render((u) => (/,day&/.test(u)
    ? { ok: false, status: 400, json: async () => ({ message: 'column does not exist' }) }
    : { ok: true, status: 200, json: async () => stops.map(({ day, ...s }) => s) }));
  assert.equal(asked.length, 2);
  assert.doesNotMatch(asked[1], /,day&/);
  assert.match(html, /13 stops/);
});

globalThis.fetch = undefined;
if (bad) { console.log(`\n✗ ${bad} failed`); process.exit(1); }
console.log('\n✓ days on /i/');

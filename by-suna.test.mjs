// W-31: "By Suna" itineraries on /i/. The page is rendered by the real
// handler with a stubbed public_itineraries row for each case, and the owner
// account's name and avatar must appear nowhere for partner_slug 'suna'.
// `node by-suna.test.mjs`; the browser check of the client-side fallback runs
// when `playwright` is installed.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const OWNER = 'ownerzz_secret';
const AVATAR = 'https://cdn.example/avatars/ownerzz.jpg';
const rows = {
  suna: { partner_slug: 'suna', partner_name: 'Suna' },
  worq: { partner_slug: 'worq', partner_name: 'WORQ' },
  creator: { partner_slug: null, partner_name: null },
};
let current = 'suna';
const stops = [0, 1, 2, 3].map((i) => ({
  order_index: i, place_name: `Stop ${i + 1}`, city_name: 'Kuala Lumpur', suggested_time: `${9 + i}:00`,
  duration_label: '1h', creator_note: '', latitude: 3.15, longitude: 101.7, landmark_id: null,
  category: 'Food', country_code: 'MY', place_image_url: null, moment_path: null, moment_bucket: null,
}));
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/public_itineraries')) {
    assert(u.includes('partner_slug'), 'the select asks for partner_slug');
    return ok([{ id: 'p1', name: 'KL in a day', intro_story: 'Old town to KLCC.', resolved_city_name: 'Kuala Lumpur',
      recommended_timing: null, creator_username: OWNER, creator_avatar_url: AVATAR, cover_media_path: null, ...rows[current] }]);
  }
  if (u.includes('/rest/v1/public_itinerary_stops')) return ok(stops);
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const { default: handler } = await import('./api/itinerary.js');
async function render(kind, query = '') {
  current = kind;
  let html = '';
  await handler({ url: `/i/kl-in-a-day--abc123${query}`, headers: { host: 'app.unaryx.com' } },
    { setHeader() { return this; }, status() { return this; }, send(b) { html = b; return this; }, end() {} });
  return html;
}
const head = (h) => h.slice(0, h.indexOf('</head>'));
const about = (h) => (h.match(/<section class="about">[\s\S]*?<\/section>/) || [''])[0];
const tag = (h, re) => (h.match(re) || [])[1];

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

const suna = await render('suna');
await t('suna: byline "By Suna" with the mark and the Suna\'s pick pill', async () => {
  assert.match(suna, /<p class="by-name">By Suna<span class="pick">Suna's pick<\/span><\/p>/);
  assert.match(suna, /class="by-avatar by-mark"[^>]*><img src="\/icons\/suna-mark\.svg"/);
});
await t('suna: no Follow, no Partner tag, no profile link', async () => {
  assert(!/class="follow"/.test(suna)); assert(!/class="tag">Partner/.test(suna)); assert(!/Their itinerary/.test(suna));
});
await t('suna: the owner\'s username and avatar appear NOWHERE (body, title, og:, twitter:)', async () => {
  assert(!suna.includes(OWNER), 'username leaked'); assert(!suna.includes(AVATAR), 'avatar leaked');
  assert(!suna.includes('ownerzz'), 'any part of it leaked');
});
await t('suna: <title> and og:title say "by Suna"', async () => {
  assert.equal(tag(head(suna), /<title>([^<]*)<\/title>/), 'KL in a day — by Suna');
  assert.equal(tag(head(suna), /<meta property="og:title" content="([^"]*)"/), 'KL in a day — by Suna');
  assert.equal(tag(head(suna), /<meta name="twitter:title" content="([^"]*)"/) ?? 'KL in a day — by Suna', 'KL in a day — by Suna');
});
await t('suna: no JSON-LD on /i/ to leak through', async () => { assert(!/application\/ld\+json/.test(suna)); });
await t('suna: ?via= still renders the same page (via is client-side)', async () => {
  const v = await render('suna', '?via=tiktok-jass');
  assert(v.includes('By Suna') && !v.includes(OWNER));
});

const worq = await render('worq');
await t('worq: unchanged — "By WORQ" + Partner tag, no Follow, no pick pill', async () => {
  assert.match(worq, /<p class="by-name">By WORQ<span class="tag">Partner<\/span><\/p>/);
  assert(!/class="follow"/.test(worq)); assert(!/class="pick"/.test(worq)); assert(!about(worq).includes('suna-mark.svg'));
});
await t('worq: <title> unchanged (still "by @<owner>", as before W-31)', async () => {
  assert.equal(tag(head(worq), /<title>([^<]*)<\/title>/), `KL in a day — by @${OWNER}`);
});

const creator = await render('creator');
await t('creator: unchanged — @username, avatar, Follow', async () => {
  assert.match(creator, new RegExp(`<p class="by-name">@${OWNER}</p>`));
  assert(creator.includes(AVATAR)); assert(/class="follow"/.test(creator)); assert(!/class="pick"/.test(creator));
});

await t('the mark is a plain SVG (no script, no href)', async () => {
  const svg = readFileSync(new URL('./public/icons/suna-mark.svg', import.meta.url), 'utf8');
  assert(svg.startsWith('<svg') && !/<script|href=|on[a-z]+=/i.test(svg));
});

// The client-side fallback in i.html (the generic shell, when the server
// rendered no body): same rule.
let chromium;
try { ({ chromium } = await import('playwright')); } catch { console.log('  (playwright not installed: client fallback skipped)'); }
if (chromium) {
  const shell = readFileSync(new URL('./public/i.html', import.meta.url), 'utf8');
  const browser = await chromium.launch();
  for (const kind of ['suna', 'worq', 'creator']) {
    await t(`client fallback, ${kind}`, async () => {
      const page = await browser.newPage();
      await page.route('**/*', (r) => {
        const u = new URL(r.request().url());
        if (u.hostname === 'app.unaryx.com') return r.fulfill({ contentType: 'text/html', body: shell });
        if (u.pathname.includes('/rest/v1/public_itineraries')) return r.fulfill({ contentType: 'application/json', body: JSON.stringify([{ id: 'p1', name: 'KL in a day', creator_username: OWNER, creator_avatar_url: AVATAR, ...rows[kind] }]) });
        if (u.pathname.includes('/rest/v1/public_itinerary_stops')) return r.fulfill({ contentType: 'application/json', body: '[]' });
        return r.fulfill({ status: 204, body: '' });
      });
      await page.goto('https://app.unaryx.com/i/kl-in-a-day--abc123');
      await page.waitForFunction(() => !document.getElementById('byline').hidden);
      const st = await page.evaluate(() => ({ text: document.getElementById('creator').textContent, src: document.getElementById('avatar').getAttribute('src'), avatarHidden: document.getElementById('avatar').hidden, body: document.body.innerHTML }));
      if (kind === 'suna') { assert.equal(st.text, 'By Suna'); assert.equal(st.src, '/icons/suna-mark.svg'); assert(!st.body.includes('ownerzz')); }
      if (kind === 'worq') { assert.equal(st.text, 'By WORQ'); assert(st.avatarHidden); }
      if (kind === 'creator') { assert.equal(st.text, '@' + OWNER); assert.equal(st.src, AVATAR); }
      await page.close();
    });
  }
  await browser.close();
}
console.log(bad ? `\nby-suna: ${bad} FAILED` : '\nby-suna: all passed');
process.exit(bad ? 1 : 0);

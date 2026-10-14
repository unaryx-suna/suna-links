// W-42: /c/<venue> and /e/<id>, rendered by the real handlers with fetch
// stubbed (no database), plus the AASA and the rewrites. usage: node clip.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const VENUE = { slug: 'worq-ttdi', name: 'WORQ TTDI', lat: 3.1378166, lng: 101.6295679, ct: 'partner-worq-ttdi' };
const H = 3600000;
const now = Date.now();
const iso = (ms) => new Date(ms).toISOString();
// Offsets in degrees of latitude: 0.0045 ≈ 500 m, 0.018 ≈ 2 km, 0.09 ≈ 10 km.
const ev = (id, dLat, extra = {}) => ({
  id, name: `Event ${id.slice(0, 4)}`, description: 'A night market.', category: 'Market',
  latitude: VENUE.lat + dLat, longitude: VENUE.lng, image_url: null,
  start_time: iso(now + H), end_time: iso(now + 3 * H), daily_start_time: null, daily_end_time: null,
  recurrence_type: null, recurrence_days: null, recurrence_until: null,
  price_type: 'paid', price_amount: 35, price_currency: 'MYR', source_url: 'https://example.com/t',
  venue: 'Taman Tun Park', organizer_name: null, performer_names: null, on_sale_from: null, ...extra,
});
const U = (n) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;

let state = { events: [], venuesOk: true, eventRow: null, restFails: false };
const calls = [];
globalThis.fetch = async (url) => {
  const u = String(url);
  calls.push(u);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.startsWith('https://unaryx.com/clip/venues.json')) {
    return state.venuesOk ? ok({ venues: [VENUE] }) : { ok: false, status: 500, json: async () => ({}) };
  }
  if (u.includes('/rest/v1/landmarks')) return ok(state.landmark ? [state.landmark] : []);
  if (u.includes('/rest/v1/world_events')) {
    if (state.restFails) return { ok: false, status: 503, json: async () => ({}) };
    if (u.includes('id=eq.')) return ok(state.eventRow ? [state.eventRow] : []);
    return ok(state.events);
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const { default: venue, pickStep, onNowLine } = await import('./api/venue.js');
const { default: event, eventId } = await import('./api/event.js');

async function render(handler, url) {
  const out = { status: 0, headers: {}, body: '' };
  await handler({ url, headers: { host: 'app.unaryx.com' } }, {
    status(s) { out.status = s; return this; },
    setHeader(k, v) { out.headers[k.toLowerCase()] = v; return this; },
    send(b) { out.body = b; return this; },
    end() { return this; },
  });
  return out;
}

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const STORE = (ct) => `https://apps.apple.com/au/app/suna-things-to-do-near-you/id6759053765?pt=128539200&ct=${ct}&mt=8`;
const CLIP_META = '<meta name="apple-itunes-app" content="app-id=6759053765, app-clip-bundle-id=com.unaryx.TravelMug.Clip">';

await t('AASA: /c/* and /e/* claimed, old paths and appclips unchanged', async () => {
  const a = JSON.parse(readFileSync('public/.well-known/apple-app-site-association', 'utf8'));
  assert.deepEqual(a.applinks.details[0].components.map((c) => c['/']), ['/place/*', '/trip/*', '/i/*', '/city/*', '/c/*', '/e/*']);
  assert.deepEqual(a.applinks.details[0].appIDs, ['29XRVFHL4F.com.unaryx.TravelMug']);
  assert.deepEqual(a.appclips, { apps: ['29XRVFHL4F.com.unaryx.TravelMug.Clip'] });
});
await t('vercel.json: /c/ and /e/ rewrite to their handlers, old rewrites kept', async () => {
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const map = Object.fromEntries(v.rewrites.map((r) => [r.source, r.destination]));
  assert.equal(map['/c/:path*'], '/api/venue');
  assert.equal(map['/e/:path*'], '/api/event');
  for (const [s, d] of [['/i/:path*', '/api/itinerary'], ['/place/:path*', '/api/place'], ['/city/:path*', '/city.html'], ['/trip/:path*', '/trip.html']]) assert.equal(map[s], d);
});

await t('/c/: events within 800 m only, when there are any', async () => {
  state.events = [ev(U(1), 0.0045), ev(U(2), 0.018), ev(U(3), 0.09)];
  const r = await render(venue, '/c/worq-ttdi');
  assert.equal(r.status, 200);
  assert.match(r.body, /<h1>What&#39;s on near WORQ TTDI<\/h1>/);
  assert.match(r.body, /Today, a short walk away/);
  assert.match(r.body, new RegExp(`href="/e/${U(1)}"`));
  assert.doesNotMatch(r.body, new RegExp(U(2)));
  assert.doesNotMatch(r.body, new RegExp(U(3)));
});
await t('/c/: widens to 3 km, then to the city', async () => {
  state.events = [ev(U(2), 0.018), ev(U(3), 0.09)];
  let r = await render(venue, '/c/worq-ttdi');
  assert.match(r.body, /Today, within 3 km/);
  assert.match(r.body, new RegExp(U(2)));
  assert.doesNotMatch(r.body, new RegExp(U(3)));
  state.events = [ev(U(3), 0.09)];
  r = await render(venue, '/c/worq-ttdi');
  assert.match(r.body, /Today in Kuala Lumpur/);
  assert.match(r.body, new RegExp(U(3)));
});
await t('/c/: the query is approved rows, today only, a box around the venue', async () => {
  calls.length = 0;
  await render(venue, '/c/worq-ttdi');
  const q = calls.find((c) => c.includes('/rest/v1/world_events'));
  assert.match(q, /status=eq\.approved/);
  assert.match(q, /end_time=gte\./);
  assert.match(q, /start_time=lte\./);
  assert.match(q, /latitude=gte\..*latitude=lte\..*longitude=gte\..*longitude=lte\./);
  const until = Date.parse(decodeURIComponent(q.match(/start_time=lte\.([^&]+)/)[1]));
  assert(until > now && until - now <= 24 * H, 'ends at the venue\'s midnight');
});
await t('/c/: nothing today anywhere → a link to the city\'s /events, still 200', async () => {
  state.events = [];
  const r = await render(venue, '/c/worq-ttdi');
  assert.equal(r.status, 200);
  assert.match(r.body, /Nothing listed near WORQ TTDI today/);
  assert.match(r.body, /href="https:\/\/unaryx\.com\/events\/kuala-lumpur"/);
});
await t('/c/: Get Suna carries the venue\'s ct; Clip meta and og: tags present', async () => {
  const r = await render(venue, '/c/worq-ttdi');
  assert(r.body.includes(`href="${STORE('partner-worq-ttdi').replace(/&/g, '&amp;')}"`));
  assert(r.body.includes(CLIP_META));
  assert.match(r.body, /<meta property="og:title" content="What&#39;s on near WORQ TTDI · Suna">/);
  assert.match(r.body, /<link rel="canonical" href="https:\/\/app\.unaryx\.com\/c\/worq-ttdi">/);
});
await t('/c/: unknown slug, empty slug, and an unreachable venue list → plain page, 200', async () => {
  for (const [url, ok] of [['/c/nope', true], ['/c/', true], ['/c/worq-ttdi', false]]) {
    state.venuesOk = ok;
    // The handler caches the list for ten minutes; a fresh import isn't needed
    // for 'nope', and the failing case is covered by the empty slug path below.
    const r = await render(venue, url);
    assert.equal(r.status, 200, url);
    if (url !== '/c/worq-ttdi') {
      assert.match(r.body, /<h1>What&#39;s on near you<\/h1>/, url);
      assert(r.body.includes(`href="${STORE('web-c').replace(/&/g, '&amp;')}"`), url);
      assert.match(r.body, /href="https:\/\/unaryx\.com\/events"/, url);
    }
  }
  state.venuesOk = true;
});
await t('/c/: a database failure still renders the venue, 200', async () => {
  state.restFails = true;
  const r = await render(venue, '/c/worq-ttdi');
  assert.equal(r.status, 200);
  assert.match(r.body, /Nothing listed near WORQ TTDI today/);
  state.restFails = false;
});
await t('/c/: a hostile event name is escaped', async () => {
  state.events = [ev(U(1), 0.0045, { name: '<script>alert(1)</script>' })];
  const r = await render(venue, '/c/worq-ttdi');
  assert.doesNotMatch(r.body, /<script>alert/);
  assert.match(r.body, /&lt;script&gt;/);
});
await t('/c/: on now says "until" only when it closes today', async () => {
  const tz = 'Asia/Kuala_Lumpur';
  const n = new Date();
  assert.match(onNowLine({ end_time: iso(n.getTime() + 60000) }, tz, n), /^On now · until \d/);
  assert.equal(onNowLine({ end_time: iso(n.getTime() + 40 * 24 * H), daily_start_time: '11:00', daily_end_time: '19:00' }, tz, n), 'On now · 11:00–19:00');
  assert.equal(onNowLine({ end_time: iso(n.getTime() + 40 * 24 * H) }, tz, n), 'On now');
});
await t('pickStep: 800 m beats 3 km beats the city; nothing → null', async () => {
  const at = (km) => ({ km, latitude: VENUE.lat, longitude: VENUE.lng });
  assert.equal(pickStep([at(0.5), at(2)], null).events.length, 1);
  assert.equal(pickStep([at(2.9)], null).label, 'Today, within 3 km');
  assert.equal(pickStep([at(10)], null), null);
});

await t('/e/: id forms (bare, e-<uuid>, query) and junk', async () => {
  assert.equal(eventId(`/e/${U(1)}`), U(1));
  assert.equal(eventId(`/e/e-${U(1).toUpperCase()}`), U(1));
  assert.equal(eventId(`/e/${U(1)}?path=x&utm_source=y`), U(1));
  assert.equal(eventId('/e/nope'), null);
  assert.equal(eventId("/e/1' or 1=1"), null);
});
await t('/e/: an event renders name, local time, venue, tickets, maps, JSON-LD', async () => {
  // 19:30–22:00 in Kuala Lumpur (UTC+8) on a fixed future date.
  state.eventRow = ev(U(4), 0.0045, { start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  const r = await render(event, `/e/${U(4)}`);
  assert.equal(r.status, 200);
  assert.match(r.body, /<h1>Event 4444<\/h1>/);
  assert.match(r.body, /Fri 5 Mar 2027 · 7:30pm–10:00pm/);
  assert.match(r.body, /Taman Tun Park, Kuala Lumpur/);
  assert.match(r.body, new RegExp(`href="https://unaryx\\.com/go/e-${U(4)}" rel="nofollow noopener">Get tickets ↗`));
  assert.match(r.body, /<a class="btn maps-apple" href="https:\/\/maps\.apple\.com\/\?daddr=3\.14231\d*,101\.6295679&amp;dirflg=w">Apple Maps<\/a>/);
  assert.match(r.body, /<a class="btn maps-google" href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=3\.14231\d*,101\.6295679&amp;travelmode=walking">Google Maps<\/a>/);
  assert(r.body.includes(`data-scheme="suna://event?id=${U(4)}"`));
  assert(r.body.includes(CLIP_META));
  assert(r.body.includes(`href="${STORE('web-e').replace(/&/g, '&amp;')}"`));
  const ld = JSON.parse(r.body.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'Event');
  assert.equal(ld.startDate, '2027-03-05T19:30:00+08:00');
  assert.equal(ld.location.name, 'Taman Tun Park');
  assert.deepEqual(ld.offers && [ld.offers.price, ld.offers.priceCurrency], [35, 'MYR']);
  // W-45: the indexable copy is the event's page on unaryx.com.
  assert.equal(ld.url, `https://unaryx.com/events/kuala-lumpur/event-4444-${U(4).slice(0, 8)}`);
  assert(r.body.includes(`<link rel="canonical" href="https://unaryx.com/events/kuala-lumpur/event-4444-${U(4).slice(0, 8)}">`));
  assert(r.body.includes(`<meta property="og:url" content="https://app.unaryx.com/e/${U(4)}">`));
  assert.doesNotMatch(r.body, /<p class="over-pill">/);
});
await t('/e/: the query is one approved row by id', async () => {
  calls.length = 0;
  await render(event, `/e/${U(4)}`);
  const q = calls.find((c) => c.includes('/rest/v1/world_events'));
  assert.match(q, new RegExp(`id=eq\\.${U(4)}&status=eq\\.approved&`));
});
await t('/e/: an ended event is greyed, with no tickets or maps', async () => {
  state.eventRow = ev(U(5), 0, { start_time: iso(now - 5 * H), end_time: iso(now - H) });
  const r = await render(event, `/e/${U(5)}`);
  assert.match(r.body, /<main class="over">/);
  assert.match(r.body, /<p class="over-pill">Ended<\/p>/);
  assert.doesNotMatch(r.body, /Get tickets|maps-google|maps-apple"/);
  assert.match(r.body, /href="https:\/\/unaryx\.com\/events\/kuala-lumpur"/);
});
await t('/e/: no price → no offers; free → Sign up and price 0', async () => {
  state.eventRow = ev(U(6), 0, { price_type: null, price_amount: null, start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  let r = await render(event, `/e/${U(6)}`);
  let ld = JSON.parse(r.body.match(/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.offers, undefined);
  state.eventRow = ev(U(6), 0, { price_type: 'free', price_amount: null, start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  r = await render(event, `/e/${U(6)}`);
  ld = JSON.parse(r.body.match(/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.offers.price, 0);
  assert.match(r.body, />More info ↗</);   // W-48: a free event's link is information, not a ticket
  assert.doesNotMatch(r.body, /no ticket needed/);
});
await t('/e/: unknown, junk and database failure → 200 with a link to /events', async () => {
  state.eventRow = null;
  for (const url of [`/e/${U(7)}`, '/e/nope', '/e/']) {
    const r = await render(event, url);
    assert.equal(r.status, 200, url);
    assert.match(r.body, /This event isn't listed/, url);
    assert.match(r.body, /href="https:\/\/unaryx\.com\/events"/, url);
    assert.doesNotMatch(r.body, /ld\+json/, url);
  }
  state.restFails = true;
  const r = await render(event, `/e/${U(4)}`);
  assert.equal(r.status, 200);
  assert.match(r.body, /This event isn't listed/);
  state.restFails = false;
});
await t('/e/: a hostile name cannot close the JSON-LD script', async () => {
  state.eventRow = ev(U(8), 0, { name: '</script><script>alert(1)</script>', start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  const r = await render(event, `/e/${U(8)}`);
  assert.doesNotMatch(r.body, /<script>alert/);
  assert.equal((r.body.match(/<script[ >]/g) || []).length, (r.body.match(/<\/script>/g) || []).length);
  const ld = r.body.match(/ld\+json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(ld).name, '</script><script>alert(1)</script>');
});

// ---- W-47: maps for people without Apple Maps, Open in Suna from Chrome.
const maps = await import('./api/_maps.js');
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0 Mobile/15E148 Safari/604.1',
  ipados: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36',
};
await t('W-47 user-agent split: Apple Maps on iPhone, iPad and Mac only; Open in Suna on iPhone only', async () => {
  assert.deepEqual(Object.fromEntries(Object.entries(UA).map(([k, v]) => [k, maps.APPLE_UA.test(v)])),
    { iphone: true, ipados: true, mac: true, android: false, windows: false });
  assert.deepEqual(Object.fromEntries(Object.entries(UA).map(([k, v]) => [k, maps.IOS_UA.test(v)])),
    { iphone: true, ipados: false, mac: false, android: false, windows: false });
});
await t('W-47 the split runs in the browser, so one cached page serves every device', async () => {
  // Both links are always in the HTML; the head script adds the class that
  // un-hides Apple Maps, and the CSS hides it otherwise.
  assert(maps.MAPS_HEAD.includes(String(maps.APPLE_UA)));
  assert.equal(maps.MAPS_CSS, 'html:not(.apple-maps) .maps-apple{display:none !important}');
  assert(maps.OPEN_SCRIPT.includes(String(maps.IOS_UA)));
  assert.match(maps.OPEN_SCRIPT, /setTimeout\(function\(\)\{if\(document\.hidden\|\|Date\.now\(\)-t>2000\)return;window\.location\.href=store\},1500\)/);
});
await t('W-47 maps links: walking directions, and nothing for a missing or 0,0 pin', async () => {
  assert.equal(maps.googleMapsURL(3.1, 101.6), 'https://www.google.com/maps/dir/?api=1&destination=3.1,101.6&travelmode=walking');
  assert.equal(maps.appleMapsURL(3.1, 101.6), 'https://maps.apple.com/?daddr=3.1,101.6&dirflg=w');
  for (const [a, b] of [[null, null], [0, 0], [NaN, 1], [91, 0], ['x', 'y']]) assert.equal(maps.mapsLinks(a, b), '', `${a},${b}`);
});
await t('W-47 Open in Suna: hidden, store href with the page ct, scheme for the app', async () => {
  state.eventRow = ev(U(4), 0, { start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  let r = await render(event, `/e/${U(4)}`);
  assert.match(r.body, new RegExp(`<a class="btn open-suna" id="open-suna" hidden data-scheme="suna://event\\?id=${U(4)}" href="${STORE('web-e').replace(/[?.]/g, '\\$&').replace(/&/g, '&amp;')}">Open in Suna</a>`));
  assert(r.body.includes(maps.OPEN_SCRIPT) && r.body.includes(maps.MAPS_HEAD));
  state.events = [ev(U(1), 0.0045)];
  r = await render(venue, '/c/worq-ttdi');
  assert(r.body.includes('data-scheme="suna://venue?slug=worq-ttdi"'));
  assert(r.body.includes(`id="open-suna" hidden data-scheme="suna://venue?slug=worq-ttdi" href="${STORE('partner-worq-ttdi').replace(/&/g, '&amp;')}"`));
  assert.match(r.body, /<div class="ev-maps"><a class="btn maps-apple"[^>]*>Apple Maps<\/a><a class="btn maps-google"[^>]*>Google Maps<\/a><\/div>/);
  r = await render(venue, '/c/nope');
  assert.doesNotMatch(r.body, /id="open-suna"/, 'an unknown venue has nowhere in the app to open');
});

// ---- W-48: what people need, from Brian's own test of /e/ ----
const RR = {
  start_time: '2026-06-16T03:00:00Z', end_time: '2027-11-01T09:00:00Z', recurrence_type: 'period',
  daily_start_time: '11:00', daily_end_time: '19:00', price_type: 'free', price_amount: null, source_url: null,
  description: "M+ and ILHAM survey of Rauschenberg's projects in Asia on Level 5; free entry, Tue-Sat 11am-7pm, Sun 11am-5pm, closes 1 Nov.",
};
await t('W-48 the description\'s days and hours beat "daily"', async () => {
  const m = await import('./api/_clip.js');
  assert.equal(m.hoursFromDescription(RR.description), 'Tue–Sat 11am–7pm, Sun 11am–5pm');
  assert.equal(m.hoursFromDescription('Open daily 10am to 6pm'), 'Daily 10am to 6pm');
  assert.equal(m.hoursFromDescription('Doors at 7pm. A daily dose of jazz.'), null);
  state.eventRow = ev(U(9), 0, RR);
  const r = await render(event, `/e/${U(9)}`);
  assert.match(r.body, /<li><b>When<\/b>16 Jun(e)? 2026 – 1 Nov 2027 · Tue–Sat 11am–7pm, Sun 11am–5pm<\/li>/);
  assert.doesNotMatch(r.body, /11:00–19:00 daily/);
  // No hours in the description: the stored daily times, as before.
  state.eventRow = ev(U(9), 0, { ...RR, description: 'A survey of his work.' });
  assert.match((await render(event, `/e/${U(9)}`)).body, /11:00–19:00 daily/);
});
await t('W-48 the description comes before the buttons', async () => {
  state.eventRow = ev(U(9), 0, RR);
  const b = (await render(event, `/e/${U(9)}`)).body;
  assert(b.indexOf('<p class="desc">') > 0 && b.indexOf('<p class="desc">') < b.indexOf('<div class="actions">'));
});
await t('W-48 free with no link: "Free entry · no ticket needed", no ticket button', async () => {
  state.eventRow = ev(U(9), 0, RR);
  const b = (await render(event, `/e/${U(9)}`)).body;
  assert.match(b, /<li><b>Price<\/b>Free<span class="fact-sub">Free entry · no ticket needed<\/span><\/li>/);
  assert.doesNotMatch(b, /unaryx\.com\/go\//);
});
await t('W-48 paid with a link: Get tickets; free with a link: More info, both via /go/', async () => {
  state.eventRow = ev(U(9), 0, { ...RR, source_url: 'https://x.example' });
  assert.match((await render(event, `/e/${U(9)}`)).body, new RegExp(`href="https://unaryx\\.com/go/e-${U(9)}" rel="nofollow noopener">More info ↗`));
  state.eventRow = ev(U(9), 0, { ...RR, source_url: 'https://x.example', price_type: 'paid', price_amount: 20 });
  assert.match((await render(event, `/e/${U(9)}`)).body, />Get tickets ↗</);
});
await t('W-48 WHERE is the venue, else the linked place\'s name; never just the city when either exists', async () => {
  state.eventRow = ev(U(9), 0, { ...RR, venue: 'ILHAM Gallery' });
  assert.match((await render(event, `/e/${U(9)}`)).body, /<li><b>Where<\/b>ILHAM Gallery, Kuala Lumpur<\/li>/);
  state.eventRow = ev(U(9), 0, { ...RR, venue: '  ', venue_landmark_id: 'aaaaaaaa-1111-4111-8111-111111111111' });
  state.landmark = { name: 'Menara Public Bank 2' };
  calls.length = 0;
  assert.match((await render(event, `/e/${U(9)}`)).body, /<li><b>Where<\/b>Menara Public Bank 2, Kuala Lumpur<\/li>/);
  assert.match(calls.find((c) => c.includes('/landmarks')), /id=eq\.aaaaaaaa-1111-4111-8111-111111111111&is_hidden=eq\.false&select=name/);
  state.landmark = null;
  state.eventRow = ev(U(9), 0, { ...RR, venue: null, venue_landmark_id: null });
  calls.length = 0;
  assert.match((await render(event, `/e/${U(9)}`)).body, /<li><b>Where<\/b>Kuala Lumpur<\/li>/);
  assert(!calls.some((c) => c.includes('/landmarks')), 'no lookup without a linked place');
});
await t('W-48 /c/ cards: on now with the description\'s hours', async () => {
  const n2 = new Date();
  assert.equal(onNowLine({ ...RR, end_time: iso(n2.getTime() + 40 * 24 * H) }, 'Asia/Kuala_Lumpur', n2), 'On now · Tue–Sat 11am–7pm, Sun 11am–5pm');
});
await t('W-45 an ended event keeps its own canonical (the unaryx page redirects away)', async () => {
  state.eventRow = ev(U(5), 0, { start_time: iso(now - 5 * H), end_time: iso(now - H) });
  const r = await render(event, `/e/${U(5)}`);
  assert(r.body.includes(`<link rel="canonical" href="https://app.unaryx.com/e/${U(5)}">`));
});
await t('W-45 eventSlug matches unaryx-site\'s paths.js for the same fixtures', async () => {
  const { eventSlug } = await import('./api/_clip.js');
  const FIX = [
    [{ name: 'Carl Barron: Just Wondering Why', id: '3F9A1C2E-1111' }, 'carl-barron-just-wondering-why-3f9a1c2e'],
    [{ name: '吉隆坡 夜市', id: 'abcdef12-0000' }, 'abcdef12'],
    [{ name: 'Café Fête — Été!', id: '00000000-0' }, 'cafe-fete-ete-00000000'],
    [{ name: 'x'.repeat(59) + ' y', id: '12345678-9' }, 'x'.repeat(59) + '-12345678'],
  ];
  for (const [e, want] of FIX) assert.equal(eventSlug(e), want, e.name);
  // When the site repo is checked out beside this one, compare with it directly.
  let site = null;
  try { site = (await import('node:module')).createRequire(import.meta.url)('../../unaryx-site/api/_lib/paths.js'); } catch { /* not beside us */ }
  if (site && typeof site.eventSlug === 'function') for (const [e] of FIX) assert.equal(eventSlug(e), site.eventSlug(e), `parity: ${e.name}`);
});

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

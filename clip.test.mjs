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
  if (u.includes('/rest/v1/landmarks')) {
    if (u.includes('id=eq.')) return ok(state.landmark ? [state.landmark] : []);
    return ok(state.places || []);
  }
  if (u.includes('/rest/v1/world_events')) {
    if (state.restFails) return { ok: false, status: 503, json: async () => ({}) };
    if (u.includes('id=eq.')) return ok(state.eventRow ? [state.eventRow] : []);
    return ok(state.events);
  }
  return { ok: false, status: 404, json: async () => ({}) };
};

const { default: venue, pickStep, splitTonight } = await import('./api/venue.js');
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
  assert.deepEqual(a.applinks.details[0].components.map((c) => c['/']), ['/place/*', '/trip/*', '/i/*', '/city/*', '/c/*', '/e/*', '/u/*']);
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

await t('/c/: events within 800 m only, when there are any (Ops W6: Near <venue>, a 10-minute walk)', async () => {
  state.events = [ev(U(1), 0.0045), ev(U(2), 0.018), ev(U(3), 0.09)];
  const r = await render(venue, '/c/worq-ttdi');
  assert.equal(r.status, 200);
  assert.match(r.body, /<h1 class="venue-h1">Near WORQ TTDI<\/h1>/);
  assert.match(r.body, /<p class="sub">Within a 10-minute walk<\/p>/);
  assert.match(r.body, /· Card from WORQ TTDI/);
  assert.match(r.body, new RegExp(`<a class="row" href="/e/${U(1)}">`));
  assert.doesNotMatch(r.body, new RegExp(U(2)));
  assert.doesNotMatch(r.body, new RegExp(U(3)));
});
await t('/c/: widens to 3 km, then to the city', async () => {
  state.events = [ev(U(2), 0.018), ev(U(3), 0.09)];
  let r = await render(venue, '/c/worq-ttdi');
  assert.match(r.body, /Within 3 km/);
  assert.match(r.body, new RegExp(U(2)));
  assert.doesNotMatch(r.body, new RegExp(U(3)));
  state.events = [ev(U(3), 0.09)];
  r = await render(venue, '/c/worq-ttdi');
  assert.match(r.body, /Around Kuala Lumpur/);
  assert.match(r.body, new RegExp(U(3)));
});
await t('/c/: the query is approved rows, the next 7 days, a box around the venue', async () => {
  calls.length = 0;
  await render(venue, '/c/worq-ttdi');
  const q = calls.find((c) => c.includes('/rest/v1/world_events'));
  assert.match(q, /status=eq\.approved/);
  assert.match(q, /end_time=gte\./);
  assert.match(q, /start_time=lte\./);
  assert.match(q, /latitude=gte\..*latitude=lte\..*longitude=gte\..*longitude=lte\./);
  const until = Date.parse(decodeURIComponent(q.match(/start_time=lte\.([^&]+)/)[1]));
  assert(until > now + 6 * 24 * H && until - now <= 7 * 24 * H + 60000, 'a week ahead');
});
await t('/c/: On tonight and This week split at the venue\'s midnight; rows have no buttons', async () => {
  const later = now + 3 * 24 * H;
  // On now (started an hour ago), so it's "tonight" at any hour the suite runs;
  // now + 1 h crosses the venue's midnight after 11pm.
  state.events = [ev(U(1), 0.0045, { start_time: iso(now - H), end_time: iso(now + 30 * 60000) }),
    ev(U(2), 0.004, { start_time: iso(later), end_time: iso(later + 2 * H) })];
  const r = await render(venue, '/c/worq-ttdi');
  const tonight = r.body.indexOf('<h2>On tonight</h2>');
  const week = r.body.indexOf('<h2>This week</h2>');
  assert(tonight > 0 && week > tonight);
  assert(r.body.indexOf(U(1)) > tonight && r.body.indexOf(U(1)) < week);
  assert(r.body.indexOf(U(2)) > week);
  assert.doesNotMatch(r.body, /Get tickets|maps-google|maps-apple"|ev-maps/);
  assert.match(r.body, /<span class="row-meta">From RM35 · Taman Tun Park · 500 m<\/span>/);
  const s2 = splitTonight([{ start_time: iso(now - H), km: 1 }, { start_time: iso(later), km: 0.2 }], 'Asia/Kuala_Lumpur', new Date(now));
  assert.deepEqual([s2.tonight.length, s2.week.length], [1, 1]);
});
await t('/c/: Worth a walk: the two nearest places within 800 m, never lodging or filler, linked to /place/', async () => {
  const desc = 'A neighbourhood cafe with good coffee, long tables and a garden at the back worth sitting in.';
  const pl = (id, dLat, extra = {}) => ({ id, name: `Place ${id}`, category: 'Cafe & Workspace', description: desc,
    cover_image_url: null, latitude: VENUE.lat + dLat, longitude: VENUE.lng, ...extra });
  state.events = [ev(U(1), 0.0045)];
  state.places = [pl('p3', 0.006), pl('p1', 0.002), pl('hotel', 0.001, { name: 'Grand Hotel' }),
    pl('filler', 0.001, { description: 'Highly rated Pub nearby.' }), pl('p2', 0.004), pl('far', 0.02)];
  calls.length = 0;
  const r = await render(venue, '/c/worq-ttdi');
  assert.match(r.body, /<h2>Worth a walk<\/h2>/);
  assert.match(r.body, /<a class="row row-place" href="\/place\/p1">/);
  assert.match(r.body, /<a class="row row-place" href="\/place\/p2">/);
  assert.doesNotMatch(r.body, /\/place\/(p3|hotel|filler|far)"/);
  assert.match(r.body, /Cafe &amp; Workspace · 3 min walk/);
  assert.match(calls.find((c) => c.includes('/rest/v1/landmarks')), /is_hidden=eq\.false/);
  state.places = [];
  assert.doesNotMatch((await render(venue, '/c/worq-ttdi')).body, /Worth a walk/);
});
await t('/c/: nothing this week anywhere → a link to the city\'s /events, still 200', async () => {
  state.events = [];
  const r = await render(venue, '/c/worq-ttdi');
  assert.equal(r.status, 200);
  assert.match(r.body, /Nothing listed nearby this week/);
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
    const r = await render(venue, url);
    assert.equal(r.status, 200, url);
    if (url !== '/c/worq-ttdi') {
      assert.match(r.body, /<h1 class="venue-h1">What's on near you<\/h1>/, url);
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
  assert.match(r.body, /Near WORQ TTDI/);
  assert.match(r.body, /Nothing listed nearby this week/);
  state.restFails = false;
});
await t('/c/: a hostile event name is escaped', async () => {
  state.events = [ev(U(1), 0.0045, { name: '<script>alert(1)</script>' })];
  const r = await render(venue, '/c/worq-ttdi');
  assert.doesNotMatch(r.body, /<script>alert/);
  assert.match(r.body, /&lt;script&gt;/);
});
await t('eyebrow: on now until (closes today), on now, tonight, a later day, a run', async () => {
  const { eyebrow } = await import('./api/_clip.js');
  const tz = 'Asia/Kuala_Lumpur';
  const n = new Date('2027-03-05T04:00:00Z'); // 12:00 in KL
  assert.equal(eyebrow({ start_time: '2027-03-05T01:00:00Z', end_time: '2027-03-05T11:00:00Z' }, tz, n), 'On now · until 7:00pm');
  assert.equal(eyebrow({ start_time: '2027-03-01T01:00:00Z', end_time: '2027-04-05T11:00:00Z', recurrence_type: 'period' }, tz, n), 'On now');
  assert.equal(eyebrow({ start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' }, tz, n), 'Tonight · 7:30pm');
  assert.equal(eyebrow({ start_time: '2027-03-05T06:00:00Z', end_time: '2027-03-05T08:00:00Z' }, tz, n), 'Today · 2:00pm');
  assert.equal(eyebrow({ start_time: '2027-03-06T12:00:00Z', end_time: '2027-03-06T14:00:00Z' }, tz, n), 'Sat 6 Mar · 8:00pm');
  assert.equal(eyebrow({ start_time: '2027-03-06T02:00:00Z', end_time: '2027-03-20T10:00:00Z', recurrence_type: 'period' }, tz, n), 'From Sat 6 Mar');
});
await t('pickStep: 800 m beats 3 km beats the city; nothing → null', async () => {
  const at = (km) => ({ km, latitude: VENUE.lat, longitude: VENUE.lng });
  assert.equal(pickStep([at(0.5), at(2)], null).events.length, 1);
  assert.equal(pickStep([at(2.9)], null).label, 'Within 3 km');
  assert.equal(pickStep([at(10)], null), null);
});

await t('/e/: id forms (bare, e-<uuid>, query) and junk', async () => {
  assert.equal(eventId(`/e/${U(1)}`), U(1));
  assert.equal(eventId(`/e/e-${U(1).toUpperCase()}`), U(1));
  assert.equal(eventId(`/e/${U(1)}?path=x&utm_source=y`), U(1));
  assert.equal(eventId('/e/nope'), null);
  assert.equal(eventId("/e/1' or 1=1"), null);
});
await t('/e/: a paid event (Ops W1): Get tickets, then Directions | Save in Suna; facts; JSON-LD', async () => {
  // 19:30–22:00 in Kuala Lumpur (UTC+8) on a fixed future date.
  state.eventRow = ev(U(4), 0.0045, { start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  state.events = [];
  const r = await render(event, `/e/${U(4)}`);
  assert.equal(r.status, 200);
  assert.match(r.body, /<h1>Event 4444<\/h1>/);
  assert.match(r.body, /<p class="hero-sub">Taman Tun Park<\/p>/);
  assert.match(r.body, /<span class="pill pill-now">Fri 5 Mar · 7:30pm<\/span><span class="pill">Paid<\/span>/);
  assert.match(r.body, /<dt>When<\/dt><dd>Fri 5 Mar 2027 · 7:30pm–10:00pm<\/dd>/);
  assert.match(r.body, /<dt>Where<\/dt><dd>Taman Tun Park, Kuala Lumpur<\/dd>/);
  assert.match(r.body, /<dt>Price<\/dt><dd>From RM35<\/dd>/);
  const actions = r.body.match(/<div class="actions">([\s\S]*?)<\/div><\/div><\/div><\/div>|<div class="actions">([\s\S]*?)<\/div>\n/)[0];
  const order = ['>Get tickets ↗<', '>Directions<', '>Save in Suna<'].map((x) => actions.indexOf(x));
  assert(order.every((i, k) => i > 0 && (k === 0 || i > order[k - 1])), `order ${order}`);
  assert.equal((r.body.match(/class="btn"/g) || []).length, 1, 'one sand button');
  assert.match(r.body, new RegExp(`<a class="btn" href="https://unaryx\\.com/go/e-${U(4)}" target="_blank" rel="nofollow noopener">Get tickets ↗</a><a class="btn btn-outline half" id="directions"`));
  assert.match(r.body, /<a class="btn btn-outline half save-suna" data-scheme="suna:\/\/event\?id=4444/);
  assert.doesNotMatch(r.body, /Get tickets ↗<\/a><p/, 'no line under Get tickets');
  assert.match(r.body, /Suna may earn a commission on some ticket links/);
  assert.doesNotMatch(r.body, /Open in Suna|Get Suna|class="bar"/);
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
  assert.doesNotMatch(r.body, /noindex/);
  assert.match(r.body, /<a class="mark" href="https:\/\/unaryx\.com\/events">/);
});
await t('/e/: Directions is Google Maps in the HTML, with the Apple/Google sheet for iPhone', async () => {
  state.eventRow = ev(U(4), 0.0045, { start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  const r = await render(event, `/e/${U(4)}`);
  assert.match(r.body, /id="directions" href="https:\/\/www\.google\.com\/maps\/dir\/\?api=1&amp;destination=3\.14231\d*,101\.6295679&amp;travelmode=walking" target="_blank" rel="noopener">Directions<\/a>/);
  assert.match(r.body, /<div class="sheet-dim" id="dir-sheet" hidden>/);
  assert.match(r.body, /<p class="sheet-title" id="dir-title">Directions to Taman Tun Park<\/p>/);
  assert.match(r.body, /<a class="sheet-opt" href="https:\/\/maps\.apple\.com\/\?daddr=3\.14231\d*,101\.6295679&amp;dirflg=w" target="_blank" rel="noopener">Apple Maps<\/a>/);
  assert.match(r.body, />Cancel<\/button>/);
  state.eventRow = ev(U(4), 0, { latitude: 0, longitude: 0, start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  assert.doesNotMatch((await render(event, `/e/${U(4)}`)).body, /id="directions"/, 'no pin, no Directions');
});
await t('/e/: More on this week: 3 nearest in 5 km, never this one, rows link to /e/', async () => {
  state.eventRow = ev(U(4), 0, { start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  state.events = [ev(U(4), 0), ev(U(1), 0.001), ev(U(2), 0.002), ev(U(3), 0.003), ev(U(5), 0.004), ev(U(6), 0.2)];
  const r = await render(event, `/e/${U(4)}`);
  assert.match(r.body, /<h2>More on this week<\/h2>/);
  const rows = [...r.body.matchAll(/<a class="row" href="\/e\/([0-9a-f-]+)">/g)].map((m) => m[1][0]);
  assert.deepEqual(rows.sort(), ['1', '2', '3']);
  state.events = [ev(U(6), 0.2)];
  assert.match((await render(event, `/e/${U(4)}`)).body, new RegExp(`href="/e/${U(6)}"`), 'else the city');
  // Another date of the same show is this one too; a second listing shows once.
  state.events = [ev(U(1), 0.001, { name: 'Event 4444' }), ev(U(2), 0.002), ev(U(3), 0.003, { name: 'Event 2222' })];
  const ids = [...(await render(event, `/e/${U(4)}`)).body.matchAll(/<a class="row" href="\/e\/([0-9a-f-]+)">/g)].map((m) => m[1][0]);
  assert.deepEqual(ids, ['2']);
  state.events = [];
});
await t('/e/: the query is one approved row by id', async () => {
  calls.length = 0;
  await render(event, `/e/${U(4)}`);
  const q = calls.find((c) => c.includes('/rest/v1/world_events'));
  assert.match(q, new RegExp(`id=eq\\.${U(4)}&status=eq\\.approved&`));
});
await t('/e/: an ended event (Ops W4): Ended pill, the state card, on this week instead, noindex, no buttons', async () => {
  state.eventRow = ev(U(5), 0, { start_time: iso(now - 5 * H), end_time: iso(now - H) });
  state.events = [ev(U(1), 0.001)];
  const r = await render(event, `/e/${U(5)}`);
  assert.match(r.body, /<main class="over">/);
  assert.match(r.body, /<span class="pill pill-over">Ended<\/span>/);
  assert.match(r.body, /<p class="state-lead">This ended on [A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}\.<\/p>/);
  assert.match(r.body, /Here’s what’s on near Taman Tun Park this week\./);
  assert.match(r.body, /<h2>On this week instead<\/h2>/);
  assert.match(r.body, new RegExp(`href="/e/${U(1)}"`));
  assert.match(r.body, /<a class="btn btn-outline" href="https:\/\/unaryx\.com\/events\/kuala-lumpur">See what’s on in Kuala Lumpur<\/a>/);
  assert.match(r.body, /<meta name="robots" content="noindex">/);
  assert.doesNotMatch(r.body.split('<script>(function(){')[0], /Get tickets|id="directions"|save-suna|commission/);
  state.events = [];
});
await t('/e/: no price → no offers, Save in Suna; free → price 0, More from the organiser', async () => {
  state.eventRow = ev(U(6), 0, { price_type: null, price_amount: null, start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  let r = await render(event, `/e/${U(6)}`);
  let ld = JSON.parse(r.body.match(/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.offers, undefined);
  assert.match(r.body, /<a class="btn save-suna"/);
  assert.doesNotMatch(r.body, /Get tickets|<dt>Price|no ticket needed|class="pill">/);
  state.eventRow = ev(U(6), 0, { price_type: 'free', price_amount: null, start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  r = await render(event, `/e/${U(6)}`);
  ld = JSON.parse(r.body.match(/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld.offers.price, 0);
  assert.match(r.body, new RegExp(`<a class="link" href="https://unaryx\\.com/go/e-${U(6)}" target="_blank" rel="nofollow noopener">More from the organiser ↗</a>`));
  assert.match(r.body, /<p class="note">Free entry · no ticket needed<\/p><a class="btn save-suna"/);
  assert.doesNotMatch(r.body, /Get tickets|commission/);
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
  // W-48 (2): the Directions sheet and Save in Suna's hand-off, iPhone and iPad (iPadOS says Macintosh, with touch).
  assert(maps.PAGE_SCRIPT.includes(String(maps.IOS_UA)) && maps.PAGE_SCRIPT.includes('maxTouchPoints>1'));
  assert.match(maps.PAGE_SCRIPT, /setTimeout\(function\(\)\{if\(document\.hidden\|\|Date\.now\(\)-t>2000\)return;window\.location\.href=store\},1500\)/);
});
await t('W-47 maps links: walking directions, and nothing for a missing or 0,0 pin', async () => {
  assert.equal(maps.googleMapsURL(3.1, 101.6), 'https://www.google.com/maps/dir/?api=1&destination=3.1,101.6&travelmode=walking');
  assert.equal(maps.appleMapsURL(3.1, 101.6), 'https://maps.apple.com/?daddr=3.1,101.6&dirflg=w');
  for (const [a, b] of [[null, null], [0, 0], [NaN, 1], [91, 0], ['x', 'y']]) assert.equal(maps.mapsLinks(a, b), '', `${a},${b}`);
});
await t('W-48 (2) Save in Suna: store href with the page ct everywhere, the app scheme for iPhone; See it all in Suna on /c/', async () => {
  state.eventRow = ev(U(4), 0, { start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' });
  let r = await render(event, `/e/${U(4)}`);
  assert(r.body.includes(`data-scheme="suna://event?id=${U(4)}" href="${STORE('web-e').replace(/&/g, '&amp;')}">Save in Suna</a>`));
  assert(r.body.includes(maps.PAGE_SCRIPT));
  state.events = [ev(U(1), 0.0045)];
  r = await render(venue, '/c/worq-ttdi');
  assert(r.body.includes(`<a class="btn save-suna" data-scheme="suna://venue?slug=worq-ttdi" href="${STORE('partner-worq-ttdi').replace(/&/g, '&amp;')}">See it all in Suna</a>`));
  assert.match(r.body, /<body class="has-bar">/);
  assert.equal((r.body.match(/class="btn[ "]/g) || []).length, 1, 'one sand button');
  r = await render(venue, '/c/nope');
  assert.doesNotMatch(r.body, /class="btn save-suna"/, 'an unknown venue has nowhere in the app to open');
});

// ---- W-48: what people need, from Brian's own test of /e/ ----
const RR = {
  start_time: '2026-06-16T03:00:00Z', end_time: '2027-11-01T09:00:00Z', recurrence_type: 'period',
  daily_start_time: '11:00', daily_end_time: '19:00', price_type: 'free', price_amount: null, source_url: null,
  description: "M+ and ILHAM survey of Rauschenberg's projects in Asia on Level 5; free entry, Tue-Sat 11am-7pm, Sun 11am-5pm, closes 1 Nov.",
};
await t('W-48 the description\'s days and hours beat "daily" (now under Hours, Ops W2)', async () => {
  const m = await import('./api/_clip.js');
  assert.equal(m.hoursFromDescription(RR.description), 'Tue–Sat 11am–7pm, Sun 11am–5pm');
  assert.equal(m.hoursFromDescription('Open daily 10am to 6pm'), 'Daily 10am to 6pm');
  assert.equal(m.hoursFromDescription('Doors at 7pm. A daily dose of jazz.'), null);
  state.eventRow = ev(U(9), 0, RR);
  const r = await render(event, `/e/${U(9)}`);
  assert.match(r.body, /<dt>When<\/dt><dd>Until Mon 1 Nov 2027<\/dd>/);
  assert.match(r.body, /<dt>Hours<\/dt><dd>Tue–Sat 11am–7pm, Sun 11am–5pm<\/dd>/);
  assert.doesNotMatch(r.body, /daily/);
  // No hours in the description: the stored daily times, as before.
  state.eventRow = ev(U(9), 0, { ...RR, description: 'A survey of his work.' });
  assert.match((await render(event, `/e/${U(9)}`)).body, /<dt>Hours<\/dt><dd>11:00–19:00 daily<\/dd>/);
  // I-100's hours_text, when Ops has written it, beats both.
  assert.equal(m.hoursFact({ ...RR, hours_text: 'Tue–Sat 11 AM – 7 PM\nSun 11 AM – 5 PM · closed Mon' }, 'Asia/Kuala_Lumpur'), 'Tue–Sat 11 AM – 7 PM\nSun 11 AM – 5 PM · closed Mon');
  // A one-day event's times are in When; no Hours row.
  assert.equal(m.hoursFact({ start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z', daily_start_time: '19:30', daily_end_time: '22:00' }, 'Asia/Kuala_Lumpur'), null);
});
await t('W-53 /c/ Worth a walk: own photo, else the stock image, never Google; no stock image twice', async () => {
  const { stockFor } = await import('./api/_stock.js');
  const desc = 'A neighbourhood cafe with good coffee, long tables and a garden at the back worth sitting in.';
  const pl = (id, dLat, extra = {}) => ({ id, name: `Place ${id}`, category: 'Cafe & Workspace', description: desc,
    cover_image_url: null, latitude: VENUE.lat + dLat, longitude: VENUE.lng, city: { country_code: 'MY' }, ...extra });
  const A = 'aaaaaaaa-1111-4111-8111-111111111111';
  const deal = (id) => stockFor({ landmarkId: id, category: 'Cafe & Workspace', countryCode: 'MY' }).path;
  // A second place the dealer gives the same image as A.
  let B = null;
  for (let i = 0; !B && i < 5000; i++) {
    const id = `${String(i).padStart(8, '0')}-2222-4222-8222-222222222222`;
    if (deal(id) === deal(A)) B = id;
  }
  assert(B, 'found a colliding id');
  state.events = [ev(U(1), 0.0045)];
  state.places = [pl(A, 0.002, { cover_image_url: 'https://lh3.googleusercontent.com/p/AF1Qip-x=s1600' }), pl(B, 0.004)];
  calls.length = 0;
  let b = (await render(venue, '/c/worq-ttdi')).body;
  assert(calls.some((c) => c.includes('/rest/v1/landmarks') && c.includes('city:cities(country_code)')), 'reads the country for the region');
  assert(!/googleusercontent|googleapis\.com\/(maps|v1)/.test(b), 'no Google photo on the page');
  assert(!calls.some((c) => /googleusercontent|googleapis/.test(c)), 'nothing fetched from Google');
  const pics = [...b.matchAll(/<span class="thumb stock"><img src="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(pics.length, 2);
  assert.notEqual(pics[0], pics[1], 'the same stock image twice');
  assert(pics[0].includes(`/place-stock/${deal(A).replace(/\/([^/]+)$/, '/_w/640/$1')}`), 'A keeps its own deal');
  assert.match(b, /<span class="stock-tint" style="background:#[0-9A-F]{6};opacity:0\.\d+"><\/span>/);
  // Our own photo wins.
  const own = 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/landmark-covers/a/cover.jpg';
  state.places = [pl(A, 0.002, { cover_image_url: own })];
  b = (await render(venue, '/c/worq-ttdi')).body;
  assert(b.includes(`<img src="${own}"`));
  assert.doesNotMatch(b, /thumb stock/);
  // No pool (Sacred Space gets no stock): the no-photo tile.
  state.places = [pl(A, 0.002, { category: 'Sacred Space' })];
  assert.match((await render(venue, '/c/worq-ttdi')).body, /<a class="row row-place" href="\/place\/aaaaaaaa[^"]*"><span class="ph"/);
  state.places = [];
});
await t('W-51 hours_text is read, and beats the description and the daily times on /e/', async () => {
  calls.length = 0;
  state.eventRow = ev(U(9), 0, { ...RR, hours_text: 'Tue–Sat 11am–7pm\nSun 11am–5pm · closed Mon' });
  const b = (await render(event, `/e/${U(9)}`)).body;
  assert(calls.some((u) => u.includes('/rest/v1/world_events') && u.includes('id=eq.') && /select=[^&]*hours_text/.test(u)), 'EVENT_SELECT reads hours_text');
  assert.match(b, /<dt>Hours<\/dt><dd>Tue–Sat 11am–7pm\nSun 11am–5pm · closed Mon<\/dd>/);
  // The meta description is one line: its lines fold with commas.
  assert.match(b, /<meta name="description" content="[^"]*· Tue–Sat 11am–7pm, Sun 11am–5pm · closed Mon/);
  assert.doesNotMatch(b, /11:00–19:00/);
  // Blank hours_text is no hours_text: the description's hours, as before.
  state.eventRow = ev(U(9), 0, { ...RR, hours_text: '  ' });
  assert.match((await render(event, `/e/${U(9)}`)).body, /<dt>Hours<\/dt><dd>Tue–Sat 11am–7pm, Sun 11am–5pm<\/dd>/);
  state.eventRow = ev(U(9), 0, { ...RR, description: 'A survey of his work.', hours_text: null });
  assert.match((await render(event, `/e/${U(9)}`)).body, /<dt>Hours<\/dt><dd>11:00–19:00 daily<\/dd>/);
});
await t('W-48 the description sits under About, after the facts', async () => {
  state.eventRow = ev(U(9), 0, RR);
  const b = (await render(event, `/e/${U(9)}`)).body;
  assert(b.indexOf('<dl class="facts">') < b.indexOf('<h2>About</h2>') && b.indexOf('<h2>About</h2>') < b.indexOf('<p class="desc">'));
});
await t('W-48 free with no link: "Free entry · no ticket needed" above Save in Suna, no organiser link', async () => {
  state.eventRow = ev(U(9), 0, RR);
  const b = (await render(event, `/e/${U(9)}`)).body;
  assert.match(b, /<p class="note">Free entry · no ticket needed<\/p><a class="btn save-suna"[^>]*>Save in Suna<\/a><p class="caption">Opens Suna, or the App Store if you don’t have it<\/p>/);
  assert.match(b, /<dt>Price<\/dt><dd>Free<\/dd>/);
  assert.doesNotMatch(b, /unaryx\.com\/go\/|More from the organiser/);
});
await t('W-48 paid with a link: Get tickets; free with a link: Save in Suna plus the organiser link, both via /go/', async () => {
  state.eventRow = ev(U(9), 0, { ...RR, source_url: 'https://x.example' });
  let b = (await render(event, `/e/${U(9)}`)).body;
  assert.match(b, new RegExp(`href="https://unaryx\\.com/go/e-${U(9)}" target="_blank" rel="nofollow noopener">More from the organiser ↗`));
  assert.doesNotMatch(b, /Get tickets/);
  state.eventRow = ev(U(9), 0, { ...RR, source_url: 'https://x.example', price_type: 'paid', price_amount: 20 });
  b = (await render(event, `/e/${U(9)}`)).body;
  assert.match(b, />Get tickets ↗</);
  // Paid but no seller link: nothing to buy here, so Save in Suna is the sand button.
  state.eventRow = ev(U(9), 0, { ...RR, source_url: null, price_type: 'paid', price_amount: 20 });
  b = (await render(event, `/e/${U(9)}`)).body;
  assert.doesNotMatch(b, /Get tickets/);
  assert.match(b, /<a class="btn save-suna"/);
});
await t('W-48 WHERE is the venue, else the linked place\'s name; never just the city when either exists', async () => {
  state.eventRow = ev(U(9), 0, { ...RR, venue: 'ILHAM Gallery' });
  assert.match((await render(event, `/e/${U(9)}`)).body, /<dt>Where<\/dt><dd>ILHAM Gallery, Kuala Lumpur<\/dd>/);
  state.eventRow = ev(U(9), 0, { ...RR, venue: '  ', venue_landmark_id: 'aaaaaaaa-1111-4111-8111-111111111111' });
  state.landmark = { name: 'Menara Public Bank 2' };
  calls.length = 0;
  assert.match((await render(event, `/e/${U(9)}`)).body, /<dt>Where<\/dt><dd>Menara Public Bank 2, Kuala Lumpur<\/dd>/);
  assert.match(calls.find((c) => c.includes('/landmarks')), /id=eq\.aaaaaaaa-1111-4111-8111-111111111111&is_hidden=eq\.false&select=name/);
  state.landmark = null;
  state.eventRow = ev(U(9), 0, { ...RR, venue: null, venue_landmark_id: null });
  calls.length = 0;
  assert.match((await render(event, `/e/${U(9)}`)).body, /<dt>Where<\/dt><dd>Kuala Lumpur<\/dd>/);
  assert(!calls.some((c) => c.includes('/landmarks')), 'no lookup without a linked place');
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

// ---- W-50: what leaves our sites opens a new tab; our own pages don't ----
const { badLinkTargets } = await import('./link-targets.mjs');
await t('W-50 /e/ (paid, free with a link, ended) and /c/: outbound links open a new tab, internal ones never', async () => {
  const fixed = { start_time: '2027-03-05T11:30:00Z', end_time: '2027-03-05T14:00:00Z' };
  state.events = [ev(U(1), 0.001), ev(U(2), 0.002)];
  for (const row of [ev(U(4), 0.0045, fixed), ev(U(6), 0, { ...fixed, price_type: 'free', price_amount: null }),
    ev(U(5), 0, { start_time: iso(now - 5 * H), end_time: iso(now - H) })]) {
    state.eventRow = row;
    const body = (await render(event, `/e/${row.id}`)).body;
    assert.deepEqual(badLinkTargets(body), [], row.id);
  }
  state.eventRow = ev(U(4), 0.0045, fixed);
  const paid = (await render(event, `/e/${U(4)}`)).body.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.equal((paid.match(/target="_blank"/g) || []).length, 5, 'Get tickets, organiser, Directions and its two sheet options');
  assert.match(paid, /<a class="row" href="\/e\/[^"]+">/, 'rows stay in the tab');
  assert.match(paid, /save-suna" data-scheme="[^"]+" href="https:\/\/apps\.apple\.com[^"]+">Save in Suna/, 'Save in Suna stays in the tab');
  state.places = [{ id: 'p1', name: 'Place p1', category: 'Cafe', description: 'A neighbourhood cafe with good coffee, long tables and a garden at the back.', cover_image_url: null, latitude: VENUE.lat + 0.002, longitude: VENUE.lng }];
  assert.deepEqual(badLinkTargets((await render(venue, '/c/worq-ttdi')).body), []);
  assert.deepEqual(badLinkTargets((await render(venue, '/c/nope')).body), []);
  state.places = []; state.events = [];
  // And the check itself bites.
  assert.equal(badLinkTargets('<a href="/go/e-1" rel="nofollow noopener">x</a><a href="/e/1" target="_blank" rel="noopener">y</a>').length, 2);
});

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

// app.unaryx.com/e/<event id>: one event (W-42; laid out to Ops's W1–W4 in W-48 (2)).
//
// What a shared event link shows anyone the app or the Clip doesn't open
// for. Brian, 14 Oct: "too many buttons". So one sand button per page:
//   paid, with a seller link  → Get tickets ↗ through unaryx.com/go (the one
//                                place an outbound link is checked and
//                                attributed), then Directions | Save in Suna;
//   anything else             → Save in Suna, then Directions, with "Free
//                                entry · no ticket needed" above when it's free.
// No line under Get tickets (Brian, 21:50): the price is in the facts card and
// the commission note is in the footer.
//
// An event that has ended keeps its page (200, noindex) so a shared link
// never dead-ends: Ops's W4, with what's on this week instead. W-85 (I-210):
// once events-cleanup deletes the row, its tombstone (public read) keeps the
// page, W4 "ended" or W5 "cancelled"; past 90 days crawlers get 410 and
// nothing is cached, so they always reach it. Only a link to nothing at all
// gets "This event isn't listed".

import {
  EVENT_SELECT, rest, escapeHtml, cityFor, zoneFor, whenText, whenFact, hoursFact, eventState, priceShort,
  ourImage, eventLD, eventPageURL, eventsPage, storeURL, page, send, segment, eyebrow, eventRow,
  eventsAround, footer, MARK,
} from './_clip.js';
import { directions, saveInSuna } from './_maps.js';

const ORIGIN = 'https://app.unaryx.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The uuid from `/e/<uuid>` or `/e/e-<uuid>` (the /go id form), else null. */
export function eventId(rawURL) {
  const s = segment(rawURL, 'e').replace(/^e-/i, '');
  return UUID.test(s) ? s.toLowerCase() : null;
}

async function loadEvent(id) {
  const rows = await rest(`world_events?id=eq.${id}&status=eq.approved&select=${EVENT_SELECT}&limit=1`);
  const e = rows[0] || null;
  // WHERE is the venue, never just the city (W-48). Every live event has
  // venue text today; when one doesn't, the place it's linked to names it.
  if (e && !String(e.venue || '').trim() && e.venue_landmark_id) {
    try {
      const place = await rest(`landmarks?id=eq.${encodeURIComponent(e.venue_landmark_id)}&is_hidden=eq.false&select=name&limit=1`);
      if (place[0] && place[0].name) e.venue = place[0].name;
    } catch { /* the city it is */ }
  }
  return e;
}

/** A cleared-out event's tombstone, as an event-shaped row, or null. Never throws. */
async function loadTombstone(id) {
  try {
    const rows = await rest(`event_tombstones?event_id=eq.${id}&select=event_id,name,venue,latitude,longitude,start_time,end_time,reason,removed_at&limit=1`);
    const t = rows[0];
    if (!t || !Number.isFinite(t.latitude) || !Number.isFinite(t.longitude)) return null;
    return { ...t, id: t.event_id, image_url: null, cancelled: t.reason === 'cancelled', tombstone: true };
  } catch { return null; }
}

// Google, Bing and the others, and link-preview fetchers. People never match.
const CRAWLER = /bot\b|crawler|spider|slurp|bingpreview|facebookexternalhit|embedly|google-inspectiontool|duckduckgo|yandex|baidu/i;
const GONE_AFTER_MS = 90 * 86400000;
export function pastGone(t, now = Date.now()) {
  const ended = Date.parse(t.end_time) || Date.parse(t.removed_at);
  return Number.isFinite(ended) && now - ended > GONE_AFTER_MS;
}

// Ops's notes: 3 events from the next 7 days nearest the pin, within 5 km,
// else the city; never ended, never this one.
const MORE_KM = 5;
const MORE_SHOWN = 3;

async function moreThisWeek(e, now) {
  const city = cityFor(e.latitude, e.longitude);
  const reach = Math.max(MORE_KM, city ? city.radius_km : 0);
  // Never this one: another date of the same show is this one too, and so is
  // a second listing of anything already in the rail.
  const key = (r) => String(r.name || '').trim().toLowerCase();
  const seen = new Set([key(e)]);
  const rows = (await eventsAround(e.latitude, e.longitude, { km: reach, now }))
    .filter((r) => r.id !== e.id && !seen.has(key(r)) && seen.add(key(r)));
  const near = rows.filter((r) => r.km <= MORE_KM);
  const pick = (near.length ? near : rows).slice(0, MORE_SHOWN);
  return pick.sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time));
}

const fmtDay = (d, tz) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' }).format(d).replace(',', '');

export function eventBody(e, now = new Date(), more = []) {
  const tz = zoneFor(e.latitude, e.longitude);
  const city = cityFor(e.latitude, e.longitude);
  // W-85: a cancelled event (a tombstone, cancelled) is over too: Ops's W5.
  const over = e.cancelled ? 'cancelled' : eventState(e, now.getTime());
  const img = ourImage(e.image_url);
  const venue = (e.venue && String(e.venue).trim()) || null;
  const where = [venue, city && city.name].filter(Boolean).join(', ');
  const price = priceShort(e);
  const pricePill = e.price_type === 'free' ? 'Free' : e.price_type === 'paid' ? 'Paid' : null;
  const store = storeURL('web-e', 'web-e');
  const save = (cls) => saveInSuna(`suna://event?id=${encodeURIComponent(e.id)}`, store, cls);
  const dir = (cls) => directions(e.latitude, e.longitude, venue || e.name, cls);
  const tickets = !over && e.price_type === 'paid' && e.source_url;
  const go = `https://unaryx.com/go/e-${escapeHtml(e.id)}`;

  const hero = `<header class="hero">
    ${img ? `<img src="${escapeHtml(img)}" alt="" fetchpriority="high" decoding="async">` : ''}
    <div class="hero-top">${MARK}</div>
    <div>
      <div class="pills">${over
        ? `<span class="pill pill-over">${over === 'cancelled' ? 'Cancelled' : 'Ended'}</span>`
        : `<span class="pill pill-now">${escapeHtml(eyebrow(e, tz, now))}</span>${pricePill ? `<span class="pill">${pricePill}</span>` : ''}`}</div>
      <h1>${escapeHtml(e.name)}</h1>
      ${venue ? `<p class="hero-sub">${escapeHtml(venue)}</p>` : ''}
    </div>
  </header>`;

  const rows = more.length
    ? `<ul class="rows">${more.map((r) => eventRow(r, { timeZone: tz, now, km: r.km })).join('')}</ul>` : '';

  if (over) {
    const near = venue ? `near ${venue}` : city ? `in ${city.name}` : 'nearby';
    return `<main class="over">
  ${hero}
  ${over === 'cancelled'
    ? `<div class="state"><p class="state-lead">The organiser cancelled this.</p>
    <p class="state-sub">Here’s what else is on nearby.</p></div>`
    : `<div class="state"><p class="state-lead">This ended on ${escapeHtml(fmtDay(new Date(e.end_time), tz))}.</p>
    <p class="state-sub">Here’s what’s on ${escapeHtml(near)} this week.</p></div>`}
  ${rows ? `<h2>On this week instead</h2>${rows}` : ''}
  <a class="btn btn-outline" href="${escapeHtml(eventsPage(city))}">See what’s on ${city ? `in ${escapeHtml(city.name)}` : 'this week'}</a>
  ${footer()}
</main>`;
  }

  let actions;
  if (tickets) {
    actions = `<a class="btn" href="${go}" target="_blank" rel="nofollow noopener">Get tickets ↗</a>`
      + dir('btn btn-outline half') + save('btn btn-outline half');
  } else {
    actions = (e.price_type === 'free' ? '<p class="note">Free entry · no ticket needed</p>' : '')
      + save('btn') + '<p class="caption">Opens Suna, or the App Store if you don’t have it</p>'
      + dir('btn btn-outline');
  }
  const hours = hoursFact(e, tz);
  const facts = [
    ['When', whenFact(e, tz, now)],
    ['Hours', hours],
    ['Where', where],
    ['Price', price],
  ].filter((f) => f[1]);
  const desc = String(e.description || '').trim();
  const organiser = e.source_url ? `<a class="link" href="${go}" target="_blank" rel="nofollow noopener">More from the organiser ↗</a>` : '';
  return `<main>
  ${hero}
  <div class="actions">${actions}</div>
  <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
  ${desc || organiser ? `<section class="about">${desc ? `<h2>About</h2><p class="desc">${escapeHtml(desc)}</p>` : ''}${organiser}</section>` : ''}
  ${rows ? `<h2>More on this week</h2>${rows}` : ''}
  ${footer({ tickets: Boolean(tickets) })}
</main>`;
}

export function missingBody() {
  return `<main>
  <div class="clipbar">${MARK}</div>
  <h1 class="venue-h1">This event isn't listed</h1>
  <p class="empty">It may have finished, been cancelled, or the link may be incomplete.</p>
  <div class="actions"><a class="btn btn-outline" href="https://unaryx.com/events">See what’s on this week</a></div>
  ${footer()}
</main>`;
}

export default async function handler(req, res) {
  const id = eventId(req.url);
  let e = null;
  try { e = id ? await loadEvent(id) : null; } catch { /* the honest page below, never a 500 */ }
  // W-85: cleared out by events-cleanup? Its tombstone keeps the page.
  const tomb = !e && id ? await loadTombstone(id) : null;
  if (tomb) {
    const gone = pastGone(tomb);
    if (gone && CRAWLER.test(String(req.headers['user-agent'] || ''))) {
      res.status(410).setHeader('Content-Type', 'text/plain; charset=utf-8')
        .setHeader('Cache-Control', 'no-store').setHeader('X-Robots-Tag', 'noindex');
      res.send('This event has ended and its page is gone.');
      return;
    }
    const now = new Date();
    let more = [];
    try { more = await moreThisWeek(tomb, now); } catch { /* the page without the rail */ }
    const city = cityFor(tomb.latitude, tomb.longitude);
    const venue = (tomb.venue && String(tomb.venue).trim()) || (city && city.name) || '';
    const html = page({
      title: `${tomb.name}${venue ? ` · ${venue}` : ''} · ${tomb.cancelled ? 'Cancelled' : 'Ended'} · Suna`,
      description: tomb.cancelled ? 'The organiser cancelled this. Here’s what else is on nearby.' : 'This has ended. Here’s what’s on nearby this week.',
      canonical: `${ORIGIN}/e/${tomb.id}`,
      body: eventBody(tomb, now, more),
      noindex: true,
    });
    if (gone) {
      // The edge keys on the URL, not the reader: nothing kept, so a crawler
      // always reaches the 410 above.
      res.status(200).setHeader('Content-Type', 'text/html; charset=utf-8').setHeader('Cache-Control', 'no-store');
      res.send(html);
    } else send(res, html);
    return;
  }
  if (!e) {
    send(res, page({
      title: 'Event not found · Suna',
      description: "What's on this week, within a short walk, on Suna.",
      canonical: `${ORIGIN}/e/${id || ''}`,
      body: missingBody(),
    }), 300);
    return;
  }
  const now = new Date();
  let more = [];
  try { more = await moreThisWeek(e, now); } catch { /* the page without the rail */ }
  const tz = zoneFor(e.latitude, e.longitude);
  const city = cityFor(e.latitude, e.longitude);
  const own = `${ORIGIN}/e/${e.id}`;
  // The indexable copy is the event's page on unaryx.com (W-45); this one is
  // the Clip's and the share link's, so it points there and keeps its own
  // og:url. An ended event's page there redirects away, so it keeps its own.
  const canonical = (!eventState(e) && eventPageURL(e)) || own;
  const venue = (e.venue && String(e.venue).trim()) || (city && city.name) || '';
  const description = [whenText(e, tz), venue].filter(Boolean).join(' · ');
  send(res, page({
    title: `${e.name}${venue ? ` · ${venue}` : ''} · Suna`,
    description,
    canonical,
    ogUrl: own,
    image: ourImage(e.image_url),
    body: eventBody(e, now, more),
    ld: eventLD(e, canonical),
    // Ended: still a page for anyone holding the link, but not one to index.
    noindex: Boolean(eventState(e, now.getTime())),
  }));
}

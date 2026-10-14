// app.unaryx.com/e/<event id>: one event (W-42).
//
// What a shared event link shows anyone the app or the Clip doesn't open
// for: the name, when (in the venue's own time), where, the photo, Get
// tickets ↗ through unaryx.com/go (the one place an outbound link is checked
// and attributed), Take me there (Google Maps, plus Apple Maps on Apple
// devices: W-47), Open in Suna on iPhone, and the Event JSON-LD the
// /events pages emit.
//
// An event that has ended is greyed the way W-28 greys an itinerary stop.
// A cancelled one can't be told apart from a missing one: the public policy
// returns approved rows only. Both get the same honest page with a 200 and a
// way on to /events, never a 404.

import {
  EVENT_SELECT, rest, escapeHtml, cityFor, zoneFor, whenLine, eventState, priceLine, ourImage,
  eventLD, eventsPage, storeURL, page, send, segment,
} from './_clip.js';
import { mapsLinks, openInSuna } from './_maps.js';

const ORIGIN = 'https://app.unaryx.com';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The uuid from `/e/<uuid>` or `/e/e-<uuid>` (the /go id form), else null. */
export function eventId(rawURL) {
  const s = segment(rawURL, 'e').replace(/^e-/i, '');
  return UUID.test(s) ? s.toLowerCase() : null;
}

async function loadEvent(id) {
  const rows = await rest(`world_events?id=eq.${id}&status=eq.approved&select=${EVENT_SELECT}&limit=1`);
  return rows[0] || null;
}

export function eventBody(e, now = new Date()) {
  const tz = zoneFor(e.latitude, e.longitude);
  const city = cityFor(e.latitude, e.longitude);
  const over = eventState(e, now.getTime());
  const img = ourImage(e.image_url);
  const venue = (e.venue && String(e.venue).trim()) || null;
  const price = priceLine(e);
  const facts = [
    ['When', whenLine(e, tz, now)],
    ['Where', [venue, city && city.name].filter(Boolean).join(', ')],
    price && ['Price', price],
  ].filter((f) => f && f[1]);
  const desc = String(e.description || '').trim();
  const actions = [
    // Not once it's over: there is nothing left to buy.
    !over && e.source_url
      ? `<a class="btn" href="https://unaryx.com/go/e-${escapeHtml(e.id)}" rel="nofollow noopener">${e.price_type === 'free' ? 'Sign up ↗' : 'Get tickets ↗'}</a>`
      : '',
    // Take me there: Google Maps for everyone, Apple Maps beside it on Apple devices.
    !over ? mapsLinks(e.latitude, e.longitude) : '',
  ].filter(Boolean).join('');
  const open = openInSuna(`suna://event?id=${encodeURIComponent(e.id)}`, storeURL('web-e', 'web-e'));
  return `<main class="${over ? 'over' : ''}">
  ${img ? `<img class="hero" src="${escapeHtml(img)}" alt="" fetchpriority="high" decoding="async">` : ''}
  ${over ? '<p class="over-pill">Ended</p>' : ''}
  <h1>${escapeHtml(e.name)}</h1>
  <ul class="facts">${facts.map(([k, v]) => `<li><b>${k}</b>${escapeHtml(v)}</li>`).join('')}</ul>
  <div class="actions">${open}${actions}</div>
  ${desc ? `<p class="desc">${escapeHtml(desc)}</p>` : ''}
  ${over ? `<p class="empty"><a class="link" href="${escapeHtml(eventsPage(city))}">See what's on this week</a></p>` : ''}
</main>
<div class="bar">
  <a class="cta" href="${escapeHtml(storeURL('web-e', 'web-e'))}">Get Suna</a>
  <p class="bar-sub">Free on the App Store. Events and places within a short walk.</p>
</div>`;
}

export function missingBody() {
  return `<main>
  <h1>This event isn't listed</h1>
  <p class="empty">It may have finished, been cancelled, or the link may be incomplete.
  <a class="link" href="https://unaryx.com/events">See what's on this week</a>.</p>
</main>
<div class="bar">
  <a class="cta" href="${escapeHtml(storeURL('web-e', 'web-e'))}">Get Suna</a>
  <p class="bar-sub">Free on the App Store. Events and places within a short walk.</p>
</div>`;
}

export default async function handler(req, res) {
  const id = eventId(req.url);
  let e = null;
  try { e = id ? await loadEvent(id) : null; } catch { /* the honest page below, never a 500 */ }
  if (!e) {
    send(res, page({
      title: 'Event not found · Suna',
      description: "What's on this week, within a short walk, on Suna.",
      canonical: `${ORIGIN}/e/${id || ''}`,
      body: missingBody(),
    }), 300);
    return;
  }
  const tz = zoneFor(e.latitude, e.longitude);
  const city = cityFor(e.latitude, e.longitude);
  const canonical = `${ORIGIN}/e/${e.id}`;
  const venue = (e.venue && String(e.venue).trim()) || (city && city.name) || '';
  const description = [whenLine(e, tz), venue].filter(Boolean).join(' · ');
  send(res, page({
    title: `${e.name}${venue ? ` · ${venue}` : ''} · Suna`,
    description,
    canonical,
    image: ourImage(e.image_url),
    body: eventBody(e),
    ld: eventLD(e, canonical),
  }));
}

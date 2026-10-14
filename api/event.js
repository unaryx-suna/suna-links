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
  EVENT_SELECT, rest, escapeHtml, cityFor, zoneFor, whenText, eventState, priceLine, ourImage,
  eventLD, eventPageURL, eventsPage, storeURL, page, send, segment,
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

export function eventBody(e, now = new Date()) {
  const tz = zoneFor(e.latitude, e.longitude);
  const city = cityFor(e.latitude, e.longitude);
  const over = eventState(e, now.getTime());
  const img = ourImage(e.image_url);
  const venue = (e.venue && String(e.venue).trim()) || null;
  const price = priceLine(e);
  // A free event with nowhere to sign up needs saying so (W-48): people
  // otherwise go looking for a ticket that doesn't exist.
  const noTicket = e.price_type === 'free' && !e.source_url;
  const facts = [
    ['When', whenText(e, tz, now)],
    ['Where', [venue, city && city.name].filter(Boolean).join(', ')],
    price && ['Price', price, noTicket ? 'Free entry · no ticket needed' : null],
  ].filter((f) => f && f[1]);
  const desc = String(e.description || '').trim();
  const actions = [
    // Not once it's over: there is nothing left to buy.
    !over && e.source_url
      // Tickets only when there are tickets; otherwise the organiser's page is "More info".
      ? `<a class="btn" href="https://unaryx.com/go/e-${escapeHtml(e.id)}" rel="nofollow noopener">${e.price_type === 'paid' ? 'Get tickets ↗' : 'More info ↗'}</a>`
      : '',
    // Take me there: Google Maps for everyone, Apple Maps beside it on Apple devices.
    !over ? mapsLinks(e.latitude, e.longitude) : '',
  ].filter(Boolean).join('');
  const open = openInSuna(`suna://event?id=${encodeURIComponent(e.id)}`, storeURL('web-e', 'web-e'));
  return `<main class="${over ? 'over' : ''}">
  ${img ? `<img class="hero" src="${escapeHtml(img)}" alt="" fetchpriority="high" decoding="async">` : ''}
  ${over ? '<p class="over-pill">Ended</p>' : ''}
  <h1>${escapeHtml(e.name)}</h1>
  <ul class="facts">${facts.map(([k, v, sub]) => `<li><b>${k}</b>${escapeHtml(v)}${sub ? `<span class="fact-sub">${escapeHtml(sub)}</span>` : ''}</li>`).join('')}</ul>
  ${desc ? `<p class="desc">${escapeHtml(desc)}</p>` : ''}
  <div class="actions">${open}${actions}</div>
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
    body: eventBody(e),
    ld: eventLD(e, canonical),
  }));
}

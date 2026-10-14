// app.unaryx.com/c/<venue slug>: "What's on near <venue>" (W-42).
//
// The page a partner's QR card or NFC tag opens for anyone the App Clip
// doesn't reach (Android, desktop, Safari before the card). The venue comes
// from unaryx.com/clip/venues.json (W-40), the same list the Clip reads.
//
// Today's events, widening the way the Clip does (I-95 (a)): within 800 m,
// else within 3 km, else anywhere in the venue's city. A card must always
// land on something, so an empty city still links to its /events page.
//
// An unknown slug is a plain "What's on near you" page with a 200: a printed
// card can outlive its venue entry, and a 404 there is a dead end.

import {
  VENUES_URL, EVENT_SELECT, rest, escapeHtml, distanceKm, cityFor, zoneFor, endOfLocalDay,
  whenLine, fmtTime, ourImage, distanceLabel, eventsPage, storeURL, page, send, segment,
} from './_clip.js';
import { mapsLinks, openInSuna } from './_maps.js';

const ORIGIN = 'https://app.unaryx.com';
export const STEPS_KM = [0.8, 3];
const MAX_SHOWN = 8;

let venuesCache = null;
async function loadVenues() {
  if (venuesCache && venuesCache.until > Date.now()) return venuesCache.list;
  const r = await fetch(VENUES_URL, { signal: AbortSignal.timeout(3000) });
  if (!r.ok) throw new Error(`venues ${r.status}`);
  const body = await r.json();
  const list = Array.isArray(body && body.venues) ? body.venues : [];
  venuesCache = { list, until: Date.now() + 10 * 60000 };
  return list;
}

/** Approved events on at some point between now and the venue's midnight, nearest first per step. */
async function eventsNear(venue, now) {
  const city = cityFor(venue.lat, venue.lng);
  const tz = zoneFor(venue.lat, venue.lng);
  const reach = Math.max(STEPS_KM[STEPS_KM.length - 1], city ? city.radius_km : 0);
  const dLat = reach / 111;
  const dLng = reach / (111 * Math.cos((venue.lat * Math.PI) / 180));
  const rows = await rest('world_events?status=eq.approved'
    + `&end_time=gte.${encodeURIComponent(now.toISOString())}`
    + `&start_time=lte.${encodeURIComponent(endOfLocalDay(now, tz).toISOString())}`
    + `&latitude=gte.${venue.lat - dLat}&latitude=lte.${venue.lat + dLat}`
    + `&longitude=gte.${venue.lng - dLng}&longitude=lte.${venue.lng + dLng}`
    + `&select=${EVENT_SELECT}&order=start_time.asc&limit=300`);
  return { rows: rows.map((e) => ({ ...e, km: distanceKm(venue.lat, venue.lng, e.latitude, e.longitude) })), city, tz };
}

/** The first step with anything in it: { label, events }, or null. */
export function pickStep(rows, city) {
  for (const km of STEPS_KM) {
    const hit = rows.filter((e) => e.km <= km);
    if (hit.length) return { label: km < 1 ? 'Today, a short walk away' : `Today, within ${km} km`, events: hit };
  }
  if (city) {
    const hit = rows.filter((e) => { const c = cityFor(e.latitude, e.longitude); return c && c.slug === city.slug; });
    if (hit.length) return { label: `Today in ${city.name}`, events: hit };
  }
  return null;
}

/**
 * "On now · until 10pm" only when it closes today. A months-long exhibition's
 * end_time is its last day's closing, so it reads its daily hours instead.
 */
export function onNowLine(e, tz, now) {
  const end = new Date(e.end_time);
  if (end <= endOfLocalDay(now, tz)) return `On now · until ${fmtTime(end, tz)}`;
  if (e.daily_start_time && e.daily_end_time) return `On now · ${e.daily_start_time}–${e.daily_end_time}`;
  return 'On now';
}

function eventCard(e, tz, now) {
  const img = ourImage(e.image_url);
  const when = Date.parse(e.start_time) <= now.getTime() ? onNowLine(e, tz, now) : whenLine(e, tz, now);
  const meta = [when, e.venue && String(e.venue).trim(), distanceLabel(e.km)].filter(Boolean).join(' · ');
  return `<li class="ev"><a href="/e/${escapeHtml(e.id)}">`
    + (img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async">` : '<span class="ph" aria-hidden="true"></span>')
    + `<span><p class="ev-name">${escapeHtml(e.name)}</p><p class="ev-meta">${escapeHtml(meta)}</p></span></a>`
    + (mapsLinks(e.latitude, e.longitude) ? `<div class="ev-maps">${mapsLinks(e.latitude, e.longitude)}</div>` : '')
    + '</li>';
}

export function venueBody(venue, found, now) {
  const name = venue ? venue.name : null;
  const heading = name ? `What's on near ${name}` : "What's on near you";
  const store = storeURL(venue && venue.ct, 'web-c');
  let list;
  if (!venue) {
    list = '<p class="empty">Suna shows what\'s on within a short walk of wherever you are: events tonight and places worth the detour.'
      + ' <a class="link" href="https://unaryx.com/events">See this week\'s events</a>.</p>';
  } else if (found && found.step) {
    const shown = found.step.events
      .slice().sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time) || a.km - b.km)
      .slice(0, MAX_SHOWN);
    list = `<p class="sub">${escapeHtml(found.step.label)}</p><ul class="events">${shown.map((e) => eventCard(e, found.tz, now)).join('')}</ul>`;
  } else {
    list = `<p class="empty">Nothing listed near ${escapeHtml(name)} today.`
      + ` <a class="link" href="${escapeHtml(eventsPage(found && found.city))}">See what's on this week</a>.</p>`;
  }
  // Only a known venue has somewhere in the app to open to.
  const open = venue
    ? `<div class="actions">${openInSuna(`suna://venue?slug=${encodeURIComponent(venue.slug)}`, store)}</div>` : '';
  return `<main>
  <h1>${escapeHtml(heading)}</h1>
  ${open}
  ${list}
</main>
<div class="bar">
  <a class="cta" href="${escapeHtml(store)}">Get Suna</a>
  <p class="bar-sub">Free on the App Store. Events and places within a short walk.</p>
</div>`;
}

export default async function handler(req, res) {
  const slug = segment(req.url, 'c').toLowerCase();
  const now = new Date();
  let venue = null;
  let found = null;
  try {
    venue = slug ? (await loadVenues()).find((v) => v && v.slug === slug) || null : null;
  } catch { /* the list is unreachable: the plain page, never an error */ }
  if (venue) {
    try {
      const near = await eventsNear(venue, now);
      found = { ...near, step: pickStep(near.rows, near.city) };
    } catch {
      found = { city: cityFor(venue.lat, venue.lng), step: null };
    }
  }
  const title = venue ? `What's on near ${venue.name} · Suna` : "What's on near you · Suna";
  const description = venue
    ? `Events today within a short walk of ${venue.name}, on Suna.`
    : 'Events tonight and places worth the detour, within a short walk. On Suna.';
  const canonical = `${ORIGIN}/c/${venue ? encodeURIComponent(venue.slug) : ''}`;
  // Five minutes at the edge: "on now" goes stale faster than an itinerary.
  send(res, page({ title, description, canonical, body: venueBody(venue, found, now) }), 300);
}

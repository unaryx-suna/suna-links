// app.unaryx.com/c/<venue slug>: "What's on near <venue>" (W-42).
//
// The page a partner's QR card or NFC tag opens for anyone the App Clip
// doesn't reach (Android, desktop, Safari before the card). The venue comes
// from unaryx.com/clip/venues.json (W-40), the same list the Clip reads.
//
// Laid out to Ops's W6 (W-48 (2)): On tonight, This week, Worth a walk, each
// row a whole link to its /e/ or /place/ page (no buttons on rows), and one
// sticky See it all in Suna. Events widen the way the Clip does (I-95 (a)):
// within 800 m, else 3 km, else anywhere in the venue's city. A card must
// always land on something, so an empty city still links to its /events page.
//
// An unknown slug is a plain "What's on near you" page with a 200: a printed
// card can outlive its venue entry, and a 404 there is a dead end.

import {
  VENUES_URL, rest, escapeHtml, distanceKm, cityFor, zoneFor, endOfLocalDay, ourImage,
  eventsPage, storeURL, page, send, segment, eventRow, eventsAround, footer,
} from './_clip.js';
import { saveInSuna } from './_maps.js';
import { isLodging, hasRealContent } from './sitemap.js';
import { stockFor } from './_stock.js';
import { sized } from './_preview.js';

const ORIGIN = 'https://app.unaryx.com';
export const STEPS_KM = [0.8, 3];
const MAX_TONIGHT = 4;
const MAX_WEEK = 4;
const MAX_PLACES = 2;
// Walking pace for "N min walk": 80 m a minute, the app's figure.
const WALK_KM_PER_MIN = 0.08;

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

/** Approved events on at some point in the next week within the city's reach of the venue. */
async function eventsNear(venue, now) {
  const city = cityFor(venue.lat, venue.lng);
  const reach = Math.max(STEPS_KM[STEPS_KM.length - 1], city ? city.radius_km : 0);
  const rows = await eventsAround(venue.lat, venue.lng, { km: reach, now });
  return { rows, city, tz: zoneFor(venue.lat, venue.lng) };
}

/**
 * The first step with anything on this week, widening the way the Clip does
 * (I-95 (a)): within 800 m, else 3 km, else the venue's city. A card must
 * always land on something. { label, events } or null.
 */
export function pickStep(rows, city) {
  for (const km of STEPS_KM) {
    const hit = rows.filter((e) => e.km <= km);
    if (hit.length) return { label: km < 1 ? 'Within a 10-minute walk' : `Within ${km} km`, events: hit };
  }
  if (city) {
    const hit = rows.filter((e) => { const c = cityFor(e.latitude, e.longitude); return c && c.slug === city.slug; });
    if (hit.length) return { label: `Around ${city.name}`, events: hit };
  }
  return null;
}

/** Splits a step's events into on-tonight (on before the venue's midnight) and later this week. */
export function splitTonight(events, tz, now) {
  const midnight = endOfLocalDay(now, tz).getTime();
  const byStart = (a, b) => Date.parse(a.start_time) - Date.parse(b.start_time) || a.km - b.km;
  const tonight = events.filter((e) => Date.parse(e.start_time) < midnight).sort(byStart);
  const week = events.filter((e) => Date.parse(e.start_time) >= midnight).sort(byStart);
  return { tonight: tonight.slice(0, MAX_TONIGHT), week: week.slice(0, MAX_WEEK) };
}

/** Up to two places within a 10-minute walk worth the detour: never lodging, never a filler description. */
async function placesNear(venue) {
  const km = STEPS_KM[0];
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((venue.lat * Math.PI) / 180));
  const rows = await rest('landmarks?is_hidden=eq.false&name=not.is.null'
    + `&latitude=gte.${venue.lat - dLat}&latitude=lte.${venue.lat + dLat}`
    + `&longitude=gte.${venue.lng - dLng}&longitude=lte.${venue.lng + dLng}`
    + '&select=id,name,category,description,cover_image_url,latitude,longitude,city:cities(country_code)&limit=200');
  return rows
    .filter((p) => p.id && !isLodging(p) && hasRealContent(p))
    .map((p) => ({ ...p, km: distanceKm(venue.lat, venue.lng, p.latitude, p.longitude) }))
    .filter((p) => p.km <= km && p.km > 0.02)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_PLACES);
}

/**
 * The row's picture (I-112, W-53): our own photo, else the stock image the
 * app deals that place (under its dealt tint, as on /i/), else the no-photo
 * tile. Never a Google photo. `taken` keeps one stock image off the page twice.
 */
function placeThumb(p, taken) {
  const own = ourImage(p.cover_image_url);
  if (own) return `<img src="${escapeHtml(own)}" alt="" loading="lazy" decoding="async">`;
  const stock = stockFor({
    landmarkId: p.id, category: p.category, countryCode: p.city && p.city.country_code,
    latitude: p.latitude, longitude: p.longitude,
  }, taken);
  if (!stock) return '<span class="ph" aria-hidden="true"></span>';
  return `<span class="thumb stock"><img src="${escapeHtml(sized(stock.url, 640) || stock.url)}" alt="" loading="lazy" decoding="async">`
    + `<span class="stock-tint" style="background:${stock.tint};opacity:${stock.tintOpacity}"></span></span>`;
}

export function placeRow(p, taken = new Set()) {
  const mins = Math.max(1, Math.round(p.km / WALK_KM_PER_MIN));
  const meta = [p.category, `${mins} min walk`].filter(Boolean).join(' · ');
  return `<li><a class="row row-place" href="/place/${escapeHtml(p.id)}">`
    + placeThumb(p, taken)
    + `<span class="row-text"><span class="row-name">${escapeHtml(p.name)}</span><span class="row-meta">${escapeHtml(meta)}</span></span>`
    + '<span class="chev" aria-hidden="true">›</span></a></li>';
}

export function venueBody(venue, found, now, places = []) {
  const name = venue ? venue.name : null;
  const store = storeURL(venue && venue.ct, 'web-c');
  const mark = '<a href="https://unaryx.com/events"><span class="mark-dot" aria-hidden="true"></span>Suna</a>';
  let content;
  if (!venue) {
    content = `<h1 class="venue-h1">What's on near you</h1>
  <p class="empty">Suna shows what's on within a short walk of wherever you are: events tonight and places worth the detour.
  <a class="link" href="https://unaryx.com/events">See this week's events</a>.</p>`;
  } else {
    const step = found && found.step;
    const { tonight, week } = step ? splitTonight(step.events, found.tz, now) : { tonight: [], week: [] };
    const rows = (list) => `<ul class="rows">${list.map((e) => eventRow(e, { timeZone: found.tz, now, km: e.km })).join('')}</ul>`;
    const taken = new Set(); // one stock image at most once on the page
    content = `<h1 class="venue-h1">Near ${escapeHtml(name)}</h1>
  <p class="sub">${escapeHtml(step ? step.label : 'Nothing listed nearby this week')}</p>
  ${tonight.length ? `<h2>On tonight</h2>${rows(tonight)}` : ''}
  ${week.length ? `<h2>This week</h2>${rows(week)}` : ''}
  ${places.length ? `<h2>Worth a walk</h2><ul class="rows">${places.map((p) => placeRow(p, taken)).join('')}</ul>` : ''}
  ${!step ? `<p class="empty"><a class="link" href="${escapeHtml(eventsPage(found && found.city))}">See what's on this week</a></p>` : ''}`;
  }
  // Only a known venue has somewhere in the app to open to; the rest get the store.
  const cta = venue
    ? saveInSuna(`suna://venue?slug=${encodeURIComponent(venue.slug)}`, store, 'btn', 'See it all in Suna')
    : `<a class="btn" href="${escapeHtml(store)}">Get Suna</a>`;
  return `<main>
  <div class="clipbar">${mark}${name ? `<span>· Card from ${escapeHtml(name)}</span>` : ''}</div>
  ${content}
  ${footer()}
</main>
<div class="bar">
  ${cta}
  <p class="caption">Opens Suna, or the App Store if you don’t have it. Free.</p>
</div>`;
}

export default async function handler(req, res) {
  const slug = segment(req.url, 'c').toLowerCase();
  const now = new Date();
  let venue = null;
  let found = null;
  let places = [];
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
    try { places = await placesNear(venue); } catch { /* the page without Worth a walk */ }
  }
  const title = venue ? `What's on near ${venue.name} · Suna` : "What's on near you · Suna";
  const description = venue
    ? `Events tonight and this week within a short walk of ${venue.name}, on Suna.`
    : 'Events tonight and places worth the detour, within a short walk. On Suna.';
  const canonical = `${ORIGIN}/c/${venue ? encodeURIComponent(venue.slug) : ''}`;
  // Five minutes at the edge: "on now" goes stale faster than an itinerary.
  send(res, page({ title, description, canonical, body: venueBody(venue, found, now, places), bodyClass: 'has-bar' }), 300);
}

// Shared by the App Clip's two web pages (W-42): /c/<venue> (api/venue.js) and
// /e/<event id> (api/event.js).
//
// Brian registered both as App Clip experiences on 14 Oct. With Suna installed
// the AASA hands these links to the app; without it, iOS Safari shows the
// Clip card (the apple-itunes-app meta below), and Android and desktop get
// these pages.
//
// WHAT IT READS, all of it already public:
//   world_events, status=approved, with the columns unaryx.com/events reads
//     (unaryx-site api/_lib/events-data.js). The policy is "Public can view
//     approved events", so a cancelled or swept ('completed') row reads as
//     nothing at all, and the page says so plainly rather than guessing.
//   unaryx.com/clip/venues.json, the venues the QR cards point at (W-40).
//
// The date formatting is mirrored from events-data.js: the two repos deploy
// separately, and these pages must say the same time /events does.

import { MAPS_HEAD, MAPS_CSS, PAGE_SCRIPT } from './_maps.js';

export const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';
const HEADERS = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` };

export const VENUES_URL = 'https://unaryx.com/clip/venues.json';

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// The four event cities, mirrored from public.event_cities, which anon cannot
// read (unaryx-site data/cities.json holds the same four rows).
export const CITIES = [
  { slug: 'melbourne', name: 'Melbourne', country_code: 'AU', lat: -37.8136, lng: 144.9631, radius_km: 60, timezone: 'Australia/Melbourne' },
  { slug: 'sydney', name: 'Sydney', country_code: 'AU', lat: -33.8688, lng: 151.2093, radius_km: 60, timezone: 'Australia/Sydney' },
  { slug: 'kuala-lumpur', name: 'Kuala Lumpur', country_code: 'MY', lat: 3.139, lng: 101.687, radius_km: 50, timezone: 'Asia/Kuala_Lumpur' },
  { slug: 'singapore', name: 'Singapore', country_code: 'SG', lat: 1.3521, lng: 103.8198, radius_km: 30, timezone: 'Asia/Singapore' },
];
const CITY_PATH = { 'kuala-lumpur': 'kuala-lumpur', melbourne: 'melbourne', sydney: 'sydney', singapore: 'singapore' };
const CURRENCY = { AU: 'AUD', MY: 'MYR', SG: 'SGD' };

// The columns /events reads, plus venue_landmark_id (W-48: the place's name
// when the venue text is empty) and hours_text (I-100, W-51: the hours as Ops
// writes them). Same table, same approved-only policy.
export const EVENT_SELECT = [
  'id', 'name', 'description', 'category', 'latitude', 'longitude', 'image_url',
  'start_time', 'end_time', 'daily_start_time', 'daily_end_time',
  'recurrence_type', 'recurrence_days', 'recurrence_until',
  'price_type', 'price_amount', 'price_currency', 'source_url', 'venue',
  'organizer_name', 'performer_names', 'on_sale_from', 'venue_landmark_id', 'hours_text',
].join(',');

const STORE = 'https://apps.apple.com/app/id6759053765';
const CT = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** The App Store link, always attributed; a `ct` that isn't a clean token falls back. */
export function storeURL(ct, fallback) {
  const token = CT.test(String(ct || '')) ? ct : fallback;
  return `${STORE}?pt=128539200&ct=${encodeURIComponent(token)}&mt=8`;
}

export async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`rest ${r.status}`);
  const rows = await r.json();
  return Array.isArray(rows) ? rows : [];
}

export function distanceKm(aLat, aLng, bLat, bLng) {
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** The event city whose radius holds the point, or null. */
export function cityFor(lat, lng) {
  let best = null;
  let bestKm = Infinity;
  for (const city of CITIES) {
    const km = distanceKm(lat, lng, city.lat, city.lng);
    if (km <= city.radius_km && km < bestKm) { best = city; bestKm = km; }
  }
  return best;
}

/** The zone for a point: its city's, else the nearest city's (every gathered event is in one). */
export function zoneFor(lat, lng) {
  const city = cityFor(lat, lng);
  if (city) return city.timezone;
  return CITIES.slice().sort((a, b) => distanceKm(lat, lng, a.lat, a.lng) - distanceKm(lat, lng, b.lat, b.lng))[0].timezone;
}

/**
 * The event's own page on unaryx.com (W-45): /events/<city>/<name>-<id8>.
 * Mirrors unaryx-site api/_lib/paths.js `eventSlug`; clip.test.mjs checks
 * the two produce the same address for the same fixtures.
 */
export function eventSlug(event) {
  const name = String(event.name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    .slice(0, 60).replace(/-+$/, '');
  const id8 = String(event.id || '').toLowerCase().slice(0, 8);
  return name ? `${name}-${id8}` : id8;
}

export function eventPageURL(event) {
  const city = cityFor(event.latitude, event.longitude);
  return city && CITY_PATH[city.slug] ? `https://unaryx.com/events/${CITY_PATH[city.slug]}/${eventSlug(event)}` : null;
}

/** unaryx.com's events page for a city, or the all-cities page. */
export function eventsPage(city) {
  return city && CITY_PATH[city.slug] ? `https://unaryx.com/events/${CITY_PATH[city.slug]}` : 'https://unaryx.com/events';
}

function zoned(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = p.value;
    return acc;
  }, {});
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour: +(parts.hour === '24' ? '00' : parts.hour), minute: +parts.minute,
  };
}

function offsetFor(date, timeZone) {
  const name = new Intl.DateTimeFormat('en-GB', { timeZone, timeZoneName: 'longOffset' })
    .formatToParts(date).find((p) => p.type === 'timeZoneName')?.value || 'GMT';
  const m = name.match(/GMT([+-])(\d{2}):?(\d{2})?/);
  return m ? `${m[1]}${m[2]}:${m[3] || '00'}` : '+00:00';
}

function offsetMinutes(date, timeZone) {
  const m = offsetFor(date, timeZone).match(/^([+-])(\d{2}):(\d{2})$/);
  return m ? (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/** The instant the venue's local day ends (midnight tonight, there). Two passes for DST. */
export function endOfLocalDay(now, timeZone) {
  const z = zoned(now, timeZone);
  const asIfUTC = Date.UTC(z.year, z.month - 1, z.day + 1, 0, 0, 0, 0);
  const first = offsetMinutes(new Date(asIfUTC), timeZone);
  let ts = asIfUTC - first * 60000;
  const second = offsetMinutes(new Date(ts), timeZone);
  if (second !== first) ts = asIfUTC - second * 60000;
  return new Date(ts);
}

/** ISO 8601 with the zone's offset, as the /events JSON-LD writes it. */
export function localISO(date, timeZone) {
  const z = zoned(date, timeZone);
  const pad = (n) => String(n).padStart(2, '0');
  return `${z.year}-${pad(z.month)}-${pad(z.day)}T${pad(z.hour)}:${pad(z.minute)}:00${offsetFor(date, timeZone)}`;
}

const fmtDate = (d, tz, y) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, day: 'numeric', month: 'short', ...(y ? { year: 'numeric' } : {}) }).format(d);
const fmtWeekday = (d, tz) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, weekday: 'short' }).format(d);
export const fmtTime = (d, tz) => new Intl.DateTimeFormat('en-AU', { timeZone: tz, hour: 'numeric', minute: '2-digit', hour12: true })
  .format(d).replace(/\s/g, '').toLowerCase();
const sameLocalDay = (a, b, tz) => {
  const x = zoned(a, tz); const y = zoned(b, tz);
  return x.year === y.year && x.month === y.month && x.day === y.day;
};

/** One line for when an event is on, in the venue's time (events-data.js `whenLine`). */
export function whenLine(event, timeZone, now = new Date()) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const until = event.recurrence_until ? new Date(event.recurrence_until) : null;
  const crossesYear = zoned(start, timeZone).year !== zoned(now, timeZone).year
    || zoned(end, timeZone).year !== zoned(now, timeZone).year;
  const daily = event.daily_start_time && event.daily_end_time
    ? `${event.daily_start_time}–${event.daily_end_time}` : null;
  if (event.recurrence_type === 'weekly') {
    const days = Array.isArray(event.recurrence_days) && event.recurrence_days.length
      ? event.recurrence_days.join(', ') : 'weekly';
    const tail = until ? ` until ${fmtDate(until, timeZone, crossesYear)}` : '';
    return `${days}${tail}${daily ? ` · ${daily}` : ''}`;
  }
  if (event.recurrence_type === 'period' || !sameLocalDay(start, end, timeZone)) {
    return `${fmtDate(start, timeZone, crossesYear)} – ${fmtDate(end, timeZone, crossesYear)}${daily ? ` · ${daily} daily` : ''}`;
  }
  const hours = daily || `${fmtTime(start, timeZone)}–${fmtTime(end, timeZone)}`;
  return `${fmtWeekday(start, timeZone)} ${fmtDate(start, timeZone, crossesYear)} · ${hours}`;
}

// ---- opening hours written in the description (W-48) ----
//
// Brian, 14 Oct: Rauschenberg's description says "Tue-Sat 11am-7pm, Sun
// 11am-5pm", and the page said "11:00–19:00 daily", which is wrong on
// Sundays and Mondays. daily_start_time/daily_end_time hold one pair of
// times; when the description spells out days and hours, those win.
const DAY = '(?:(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)[a-z]*\\.?|daily|every day)';
const TIME = '\\d{1,2}(?:[:.]\\d{2})?\\s*(?:am|pm)?';
const SEG = `${DAY}(?:\\s*[-–—]\\s*${DAY})?(?:\\s*(?:,|&|and)\\s*${DAY})*\\s*:?\\s*${TIME}\\s*[-–—to]+\\s*${TIME}`;
const HOURS = new RegExp(`${SEG}(?:\\s*[,;]\\s*${SEG})*`, 'i');

/** "Tue–Sat 11am–7pm, Sun 11am–5pm" from a description, or null. */
export function hoursFromDescription(text) {
  const m = String(text || '').match(HOURS);
  if (!m) return null;
  const line = m[0].replace(/\s*[-—]\s*/g, '–').replace(/\s*–\s*/g, '–').replace(/\s+/g, ' ').trim();
  return line.charAt(0).toUpperCase() + line.slice(1);
}

/**
 * whenLine, except where Ops's hours_text or the description's own hours
 * contradict "daily": then the dates, then that hours line.
 */
export function whenText(event, timeZone, now = new Date()) {
  const hours = ownHours(event, ', ')
    || (event.daily_start_time && event.daily_end_time ? hoursFromDescription(event.description) : null);
  if (!hours) return whenLine(event, timeZone, now);
  const base = whenLine({ ...event, daily_start_time: null, daily_end_time: null }, timeZone, now);
  // A one-day event's line already carries its times; only a run gets the hours.
  return / – |until|weekly|, /.test(base) || event.recurrence_type ? `${base.split(' · ')[0]} · ${hours}` : base;
}

/** The facts card's When (Ops's W2): a run that has started reads "Until Sun 1 Nov"; its hours go under Hours. */
export function whenFact(event, timeZone, now = new Date()) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const run = event.recurrence_type === 'period' || event.recurrence_type === 'weekly' || !sameLocalDay(start, end, timeZone);
  if (!run) return whenLine(event, timeZone, now);
  if (event.recurrence_type !== 'weekly' && start <= now) {
    const crossesYear = zoned(end, timeZone).year !== zoned(now, timeZone).year;
    return `Until ${fmtWeekday(end, timeZone)} ${fmtDate(end, timeZone, crossesYear)}`;
  }
  return whenLine({ ...event, daily_start_time: null, daily_end_time: null }, timeZone, now);
}

/**
 * The facts card's Hours, for a run only (a one-day event's When has its
 * times). The organiser's own words when Ops has written them (`hours_text`,
 * I-100); else the hours the description spells out; else the daily times.
 * Never "daily" when the description says otherwise (W-48).
 */
export function hoursFact(event, timeZone) {
  const own = ownHours(event);
  if (own) return own;
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const run = event.recurrence_type === 'period' || event.recurrence_type === 'weekly' || !sameLocalDay(start, end, timeZone);
  if (!run || !event.daily_start_time || !event.daily_end_time) return null;
  return hoursFromDescription(event.description) || `${event.daily_start_time}–${event.daily_end_time} daily`;
}

/**
 * Ops's hours_text (I-100: ≤ 120 chars, may run over lines), or null. `join`
 * folds its lines into one for a single-line place like the meta description.
 */
export function ownHours(event, join = null) {
  const own = typeof event.hours_text === 'string' ? event.hours_text.trim() : '';
  if (!own) return null;
  return join ? own.split(/\s*\n+\s*/).join(join) : own;
}

/** 'ended' once its end time has passed, else null. (Cancelled rows aren't readable; see the top.) */
export function eventState(event, now = Date.now()) {
  const ends = Date.parse(event && event.end_time || '');
  return Number.isFinite(ends) && ends <= now ? 'ended' : null;
}

/** "Free", "A$35", or null when we do not know. */
export function priceLine(event) {
  if (event.price_type === 'free') return 'Free';
  if (event.price_amount == null) return null;
  const amount = Number(event.price_amount);
  const symbol = { AUD: 'A$', MYR: 'RM', SGD: 'S$', USD: 'US$' }[event.price_currency] || `${event.price_currency || ''} `;
  return `${symbol}${Number.isInteger(amount) ? String(amount) : amount.toFixed(2)}`;
}

/** Only our own Storage copies are shown, never an organiser's URL. */
export function ourImage(url) {
  return url && url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`) ? url : null;
}

/** "350 m", "1.2 km". */
export function distanceLabel(km) {
  return km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km.toFixed(1)} km`;
}

/** The Event JSON-LD node /events emits, for one event. */
export function eventLD(event, url) {
  const city = cityFor(event.latitude, event.longitude);
  const tz = zoneFor(event.latitude, event.longitude);
  const desc = String(event.description || '');
  const node = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    startDate: localISO(new Date(event.start_time), tz),
    endDate: localISO(new Date(event.end_time), tz),
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: (event.venue && String(event.venue).trim()) || (city ? city.name : 'Venue'),
      ...(city ? { address: { '@type': 'PostalAddress', addressLocality: city.name, addressCountry: city.country_code } } : {}),
      geo: { '@type': 'GeoCoordinates', latitude: event.latitude, longitude: event.longitude },
    },
    url,
  };
  if (desc) node.description = desc.length > 150 ? `${desc.slice(0, 147).trimEnd()}…` : desc;
  const image = ourImage(event.image_url);
  if (image) node.image = image;
  const organizer = typeof event.organizer_name === 'string' && event.organizer_name.trim();
  if (organizer) node.organizer = { '@type': 'Organization', name: organizer.slice(0, 200) };
  const performers = [...new Set((Array.isArray(event.performer_names) ? event.performer_names : [])
    .map((n) => (typeof n === 'string' ? n.trim().slice(0, 200) : '')).filter(Boolean))].slice(0, 10);
  if (performers.length) node.performer = performers.map((name) => ({ '@type': 'PerformingGroup', name }));
  const currency = event.price_currency || (city && CURRENCY[city.country_code]) || null;
  let offer = null;
  if (currency && event.price_type === 'free') offer = { price: 0, priceCurrency: currency };
  else if (currency && event.price_type === 'paid' && event.price_amount != null && Number(event.price_amount) >= 0) {
    offer = { price: Number(event.price_amount), priceCurrency: currency };
  }
  if (offer) {
    node.offers = { '@type': 'Offer', url, availability: 'https://schema.org/InStock', ...offer };
    const onSale = event.on_sale_from ? new Date(event.on_sale_from) : null;
    if (onSale && !Number.isNaN(onSale.getTime())) node.offers.validFrom = localISO(onSale, tz);
  }
  return node;
}

// ---- W-48 (2): the rows and labels on Ops's cleaner /e/ and /c/ ----

/**
 * The short orange label over an event: "On now · until 7pm", "Tonight ·
 * 7:30pm", "Today · 10am", "Sat 17 Oct · 8pm", "From Sat 17 Oct". Shown in
 * small caps (an eyebrow), so it's written in sentence case here.
 */
export function eyebrow(event, timeZone, now = new Date()) {
  const start = new Date(event.start_time);
  const end = new Date(event.end_time);
  const tonight = endOfLocalDay(now, timeZone);
  if (start <= now) {
    if (end <= tonight) return `On now · until ${fmtTime(end, timeZone)}`;
    return 'On now';
  }
  const multiDay = event.recurrence_type === 'period' || !sameLocalDay(start, end, timeZone);
  if (start <= tonight) {
    const z = zoned(start, timeZone);
    return `${z.hour >= 17 ? 'Tonight' : 'Today'} · ${fmtTime(start, timeZone)}`;
  }
  const day = `${fmtWeekday(start, timeZone)} ${fmtDate(start, timeZone, false)}`;
  return multiDay ? `From ${day}` : `${day} · ${fmtTime(start, timeZone)}`;
}

/** "Free", "From A$35", "Paid", or null: the price as a row or the facts card says it. */
export function priceShort(event) {
  if (event.price_type === 'free') return 'Free';
  const p = priceLine(event);
  if (p) return `From ${p}`;
  return event.price_type === 'paid' ? 'Paid' : null;
}

/** A whole-row link to an event's /e/ page (Ops: no buttons on rows). */
export function eventRow(event, { timeZone, now = new Date(), km = null } = {}) {
  const img = ourImage(event.image_url);
  const venue = event.venue && String(event.venue).trim();
  const meta = [priceShort(event), venue, km != null ? distanceLabel(km) : null].filter(Boolean).join(' · ');
  return `<li><a class="row" href="/e/${escapeHtml(event.id)}">`
    + (img ? `<img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async">` : '<span class="ph" aria-hidden="true"></span>')
    + `<span class="row-text"><span class="row-eyebrow">${escapeHtml(eyebrow(event, timeZone, now))}</span>`
    + `<span class="row-name">${escapeHtml(event.name)}</span>`
    + (meta ? `<span class="row-meta">${escapeHtml(meta)}</span>` : '')
    + '</span><span class="chev" aria-hidden="true">›</span></a></li>';
}

/**
 * Approved events on at some point in the next `days` days within `km` of a
 * point, nearest first, each with its distance. One bounded query.
 */
export async function eventsAround(lat, lng, { km, days = 7, now = new Date(), limit = 300 } = {}) {
  const dLat = km / 111;
  const dLng = km / (111 * Math.cos((lat * Math.PI) / 180));
  const until = new Date(now.getTime() + days * 86400000);
  const rows = await rest('world_events?status=eq.approved'
    + `&end_time=gte.${encodeURIComponent(now.toISOString())}`
    + `&start_time=lte.${encodeURIComponent(until.toISOString())}`
    + `&latitude=gte.${lat - dLat}&latitude=lte.${lat + dLat}`
    + `&longitude=gte.${lng - dLng}&longitude=lte.${lng + dLng}`
    + `&select=${EVENT_SELECT}&order=start_time.asc&limit=${limit}`);
  return rows
    .map((e) => ({ ...e, km: distanceKm(lat, lng, e.latitude, e.longitude) }))
    .filter((e) => e.km <= km)
    .sort((a, b) => a.km - b.km);
}

/** The line at the foot of every page; the commission note only where a page links to tickets. */
export function footer({ tickets = false } = {}) {
  return '<footer class="foot"><a href="https://unaryx.com/events">Suna</a> · events and places within a short walk'
    + (tickets ? '<br>Suna may earn a commission on some ticket links' : '') + '</footer>';
}

/** The Suna mark, top left, back to unaryx.com/events (Ops's W1). */
export const MARK = '<a class="mark" href="https://unaryx.com/events"><span class="mark-dot" aria-hidden="true"></span>Suna</a>';

/**
 * The page around a body. Same palette and font as /i/. The meta tag is what
 * surfaces the Clip card in Safari: both routes are registered experiences.
 */
/**
 * W-115: on Android, App Store buttons become the Android waitlist
 * (public/android.js). `from` is the page kind, `city` its slug if known.
 */
export function androidTag({ from = 'page', city = '' } = {}) {
  return `<script src="/android.js" data-from="${escapeHtml(from)}"${city ? ` data-city="${escapeHtml(city)}"` : ''}></script>`;
}

export function page({ title, description, canonical, ogUrl, image, body, ld, noindex = false, bodyClass = '', android = null }) {
  const tags = [
    noindex ? '<meta name="robots" content="noindex">' : '',
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(ogUrl || canonical)}">`,
    `<meta property="og:site_name" content="Suna">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : '',
    // `<` escaped so a name can never close the script.
    ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n  ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="apple-itunes-app" content="app-id=6759053765, app-clip-bundle-id=com.unaryx.TravelMug.Clip">
  ${MAPS_HEAD}
  ${tags}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700&display=swap">
  <style>
    /* Ops's W1–W6 (Figma 2602:3659): #111 ground, #222 cards, one sand button per page. */
    :root { --bg: #111; --card: #222; --line: #5a5a5a; --text: #fff; --body: #d0d0d0; --muted: #9a9a9a;
      --sand: #f6cb94; --ink-on-sand: #111; --now: #ff8c18; --pill: #2c2c2c; --sheet: #2b2b2b;
      --font: Urbanist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    ${MAPS_CSS}
    body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font); }
    main { max-width: 480px; margin: 0 auto; padding: 0 16px 32px; }
    .mark { display: inline-flex; align-items: center; gap: 6px; padding: 5px 10px 5px 6px; border-radius: 999px;
      background: rgba(0,0,0,.45); color: var(--text); font-weight: 700; font-size: 14px; text-decoration: none; }
    .mark-dot { width: 18px; height: 18px; border-radius: 50%; background: var(--sand); }
    .hero { position: relative; margin: 0 -16px; min-height: 360px; display: flex; flex-direction: column;
      justify-content: space-between; padding: 16px; background: linear-gradient(#5c4d3d, var(--bg)); overflow: hidden; }
    .hero > img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .hero::after { content: ""; position: absolute; inset: 0; background: linear-gradient(rgba(17,17,17,0) 30%, var(--bg)); }
    .hero > * { position: relative; z-index: 1; }
    .hero > img { z-index: 0; }
    .hero-top { align-self: flex-start; }
    .pills { display: flex; gap: 7px; margin: 0 0 7px; }
    .pill { padding: 4px 9px; border-radius: 999px; background: var(--pill); color: #fff; font-size: 11px; font-weight: 700;
      text-transform: uppercase; letter-spacing: .02em; }
    .pill-now { background: var(--now); }
    .pill-over { background: #4a4a4a; color: var(--body); text-transform: none; letter-spacing: 0; }
    h1 { font-size: 30px; line-height: 1.2; font-weight: 700; margin: 0; }
    .hero-sub { color: var(--body); font-size: 14px; margin: 6px 0 0; }
    .over .hero > img { filter: grayscale(1); }
    .over h1, .over .hero-sub { opacity: .6; }
    .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px 8px; margin: 20px 0 24px; }
    .actions > * { grid-column: 1 / -1; }
    .actions .half { grid-column: auto; }
    .btn { display: flex; align-items: center; justify-content: center; height: 48px; padding: 0 16px; border-radius: 999px;
      text-decoration: none; font-weight: 600; font-size: 16px; background: var(--sand); color: var(--ink-on-sand); border: 0; }
    .btn-outline { background: transparent; color: var(--text); border: 1px solid var(--line); }
    .note { text-align: center; font-size: 14px; font-weight: 600; margin: 0; }
    .caption { text-align: center; color: var(--muted); font-size: 12px; margin: -2px 0 4px; }
    .facts { background: var(--card); border-radius: 18px; padding: 14px; margin: 0 0 28px; display: grid; gap: 10px;
      font-weight: 500; }
    .facts div { display: flex; gap: 12px; align-items: flex-start; }
    .facts dt { width: 56px; flex: none; color: var(--muted); font-size: 13px; line-height: 19px; }
    .facts dd { margin: 0; flex: 1; font-size: 14px; line-height: 19px; white-space: pre-line; }
    h2 { font-size: 17px; font-weight: 600; margin: 0 0 10px; }
    .desc { color: var(--body); font-size: 15px; line-height: 21px; margin: 0 0 10px; white-space: pre-line; }
    .link { color: var(--sand); font-size: 14px; font-weight: 600; text-decoration: none; }
    .about { margin: 0 0 32px; }
    .rows { list-style: none; padding: 0; margin: 0 0 24px; display: grid; gap: 10px; }
    .row { position: relative; display: flex; align-items: center; gap: 12px; min-height: 84px; padding: 10px 40px 10px 10px;
      border-radius: 20px; background: var(--card); color: inherit; text-decoration: none; }
    .row img, .row .ph { width: 64px; height: 64px; border-radius: 14px; object-fit: cover; background: #3b332b; flex: none; }
    .row-place { min-height: 72px; }
    .row-place img, .row-place .ph { width: 52px; height: 52px; }
    .row .thumb { position: relative; flex: none; width: 52px; height: 52px; border-radius: 14px; overflow: hidden; }
    .row .thumb img { display: block; border-radius: 0; }
    .row .stock-tint { position: absolute; inset: 0; }
    .row-text { display: grid; gap: 3px; min-width: 0; }
    .row-eyebrow { color: var(--now); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .02em; }
    .row-name { font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row-meta { color: var(--muted); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chev { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 24px; font-weight: 500; }
    .state { background: var(--card); border-radius: 18px; padding: 16px; margin: 20px 0 36px; }
    .state p { margin: 0; }
    .state-lead { font-size: 16px; font-weight: 600; }
    .state-sub { color: var(--muted); font-size: 13px; margin-top: 8px !important; }
    .empty { color: var(--body); font-size: 15px; line-height: 1.5; }
    .foot { text-align: center; color: var(--muted); font-size: 12px; line-height: 1.6; margin: 32px 0 0; }
    .foot a { color: inherit; text-decoration: none; }
    .clipbar { display: flex; align-items: center; gap: 8px; padding-top: 16px; color: var(--muted); font-size: 13px; }
    .clipbar a { display: flex; align-items: center; gap: 8px; color: var(--text); font-weight: 700; font-size: 16px; text-decoration: none; }
    .clipbar .mark-dot { width: 22px; height: 22px; }
    .venue-h1 { font-size: 28px; margin: 16px 0 4px; }
    .sub { color: var(--muted); font-size: 13px; margin: 0 0 26px; }
    .has-bar main { padding-bottom: 150px; }
    .bar { position: fixed; left: 0; right: 0; bottom: 0; background: var(--bg); border-top: 1px solid rgba(90,90,90,.5);
      padding: 16px 16px calc(12px + env(safe-area-inset-bottom)); }
    .bar .btn { max-width: 448px; margin: 0 auto; }
    .bar .caption { margin: 8px 0 0; }
    .sheet-dim { position: fixed; inset: 0; z-index: 10; background: rgba(0,0,0,.5); display: flex; align-items: flex-end; justify-content: center;
      padding: 8px 8px calc(12px + env(safe-area-inset-bottom)); }
    .sheet { width: 100%; max-width: 386px; display: grid; gap: 12px; }
    .sheet-group { background: var(--sheet); border-radius: 16px; overflow: hidden; display: grid; text-align: center; }
    .sheet-title { color: var(--muted); font-size: 13px; font-weight: 500; margin: 0; padding: 18px 16px; }
    .sheet-opt { color: var(--sand); font-size: 18px; font-weight: 600; text-decoration: none; padding: 18px 16px;
      border-top: 1px solid rgba(90,90,90,.6); }
    .sheet-cancel { color: var(--text); font: 700 18px var(--font); border: 0; height: 60px; cursor: pointer; }
  </style>
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ''}>
${body}
${PAGE_SCRIPT}
${androidTag(android || undefined)}
</body>
</html>`;
}

/** Writes the page. Cached briefly at the edge, like /i/. */
export function send(res, html, sMaxAge = 600) {
  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', `public, max-age=300, s-maxage=${sMaxAge}, stale-while-revalidate=3600`)
    .send(html);
}

/** The last path segment after `/<prefix>/`, decoded, without the rewrite's query. */
export function segment(rawURL, prefix) {
  const path = String(rawURL || '').split('?')[0];
  const raw = (path.split(`/${prefix}/`)[1] || '').split('/')[0];
  try { return decodeURIComponent(raw).trim(); } catch { return ''; }
}

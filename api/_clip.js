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

import { MAPS_HEAD, MAPS_CSS, OPEN_SCRIPT } from './_maps.js';

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

// The same columns /events reads, so nothing new is exposed.
export const EVENT_SELECT = [
  'id', 'name', 'description', 'category', 'latitude', 'longitude', 'image_url',
  'start_time', 'end_time', 'daily_start_time', 'daily_end_time',
  'recurrence_type', 'recurrence_days', 'recurrence_until',
  'price_type', 'price_amount', 'price_currency', 'source_url', 'venue',
  'organizer_name', 'performer_names', 'on_sale_from',
].join(',');

const STORE = 'https://apps.apple.com/au/app/suna-things-to-do-near-you/id6759053765';
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

/**
 * The page around a body. Same palette and font as /i/. The meta tag is what
 * surfaces the Clip card in Safari: both routes are registered experiences.
 */
export function page({ title, description, canonical, image, body, ld }) {
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
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
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;600;700&display=swap">
  <style>
    :root { --bg: #111; --card: #1a1a1a; --line: #2a2a2a; --text: #fff; --body: #dadada; --muted: #979592;
      --sand: #f6cb94; --ink-on-sand: #1e1b16;
      --font: Urbanist, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    ${MAPS_CSS}
    body { margin: 0; background: var(--bg); color: var(--text); font-family: var(--font); }
    main { max-width: 480px; margin: 0 auto; padding: 24px 20px 140px; }
    h1 { font-size: 28px; line-height: 1.15; margin: 8px 0 6px; }
    .sub { color: var(--muted); font-size: 15px; margin: 0 0 20px; }
    .hero { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 16px; background: var(--card); display: block; }
    .facts { list-style: none; padding: 0; margin: 18px 0; display: grid; gap: 10px; }
    .facts li { color: var(--body); font-size: 15px; }
    .facts b { color: var(--muted); font-weight: 600; display: block; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
    .desc { color: var(--body); font-size: 15px; line-height: 1.5; white-space: pre-line; }
    .actions { display: flex; gap: 10px; flex-wrap: wrap; margin: 20px 0; }
    .btn { flex: 1 1 140px; text-align: center; padding: 13px 16px; border-radius: 22px; text-decoration: none;
      font-weight: 600; font-size: 15px; border: 1px solid var(--line); color: var(--text); background: var(--card); }
    .events { list-style: none; padding: 0; margin: 0; display: grid; gap: 12px; }
    .ev > a { display: flex; gap: 12px; padding: 10px; border-radius: 14px; background: var(--card);
      border: 1px solid var(--line); color: inherit; text-decoration: none; }
    .ev img, .ev .ph { width: 72px; height: 72px; border-radius: 10px; object-fit: cover; background: #222; flex: none; }
    .ev-name { font-weight: 700; font-size: 16px; margin: 2px 0 4px; }
    .ev-meta { color: var(--muted); font-size: 13px; margin: 0; }
    .ev-maps { display: flex; gap: 8px; margin: 6px 0 0; }
    .ev-maps .btn { flex: 1 1 0; padding: 8px 10px; font-size: 13px; border-radius: 16px; }
    .empty { color: var(--body); font-size: 15px; line-height: 1.5; }
    .link { color: var(--sand); }
    .over-pill { display: inline-block; margin: 0 0 6px; padding: 3px 8px; border-radius: 999px;
      background: #3a3a3a; color: #d6d6d6; font-size: 11px; font-weight: 600; }
    .over .hero { filter: grayscale(1); opacity: .5; }
    .over h1, .over .sub, .over .facts, .over .desc { opacity: .5; }
    .bar { position: fixed; left: 0; right: 0; bottom: 0; padding: 14px 20px calc(14px + env(safe-area-inset-bottom));
      background: linear-gradient(to top, var(--bg) 70%, transparent); text-align: center; }
    .cta { display: block; max-width: 440px; margin: 0 auto; background: var(--sand); color: var(--ink-on-sand);
      padding: 15px 20px; border-radius: 26px; text-decoration: none; font-weight: 600; font-size: 17px; }
    .bar-sub { margin: 8px auto 0; font-size: 12px; color: var(--muted); }
  </style>
</head>
<body>
${body}
${OPEN_SCRIPT}
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

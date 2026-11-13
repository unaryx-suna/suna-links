// Server-rendered place page.
//
// W-197 (Ops OPS-135, design claude/design/APP-WEB-REDESIGN-0511.html):
// the whole page is rendered here now, not only its <head>: hero, open now,
// Save in Suna + Directions, Good to know, what's on within 1 km this month,
// three places a short walk away, and the app card. A place we can't show
// (unknown, hidden, merged, ambiguous) gets "This place isn't on Suna any
// more" with what's on in the nearest city, never a blank page. The notes
// below about the <head> still hold.
//
// `public/place.html` is a static shell whose <title> is the literal
// "Suna — Discover Places" for every place in the catalogue. Shared into a chat
// it previews as that string with no image; crawled, thousands of URLs present
// one identical title, which is the canonical signal for "this site is a
// template, not content".
//
// This fills the <head> before the bytes are served, the same way
// api/itinerary.js does, from the same publishable key. The page still renders
// client-side for humans — the App Clip banner, the deep link and the fallback
// behaviour in place.html are untouched.
//
// DELIBERATELY NOT LOGGED. api/_open-log.js records itinerary link opens, which
// feed the creator conversion denominator; mixing place views into `link_opens`
// would change what that number means without anyone deciding to. If place
// views are worth counting, they get their own decision and their own rows.

import { segmentAfter, tailOf } from './_slug.js';
import { MAPS_HEAD, PAGE_SCRIPT, hasPin } from './_maps.js';
import { CSS, HEAD_FONTS, esc, tzFor, hoursInfo, km, placeBody, missingBody } from './_placepage.js';
import { stockFor, isGooglePhoto } from './_stock.js';
import { creditFor } from './_preview.js';
import { hasRealContent, PUBLISHED_TIPS } from './sitemap.js';

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
// Publishable key: public by design, the same one place.html already ships.
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';

/**
 * What `/place/...` names, tolerating a trailing segment or query:
 * `{ uuid }` for `/place/<uuid>`, `{ short }` for `/place/<slug>--<8 hex>` or a
 * bare `/place/<8 hex>` (what Discover and the place sheet's Share send, W-59),
 * else null.
 *
 * Only the part after the last `--` is read, so the slug can be anything,
 * Cyrillic included, and never reaches a query. Validated before use: an id
 * that is neither shape cannot match a row, so it costs no round trip.
 */
function placeRefFrom(pathname) {
  // W-227: `--` may arrive as an em or en dash, typed or percent-encoded.
  const tail = tailOf(segmentAfter(pathname, 'place')).toLowerCase();
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(tail)) return { uuid: tail };
  if (/^[0-9a-f]{8}$/.test(tail)) return { short: tail };
  return null;
}

/**
 * The PostgREST filter for a place reference. A short id is the UUID range
 * whose first 8 hex characters it is, as the app and the Clip query it
 * (`ClipShareLink.uuidRange`): a range on the uuid column, never `ilike` on a
 * cast, so it stays on the primary key index.
 */
function idFilter(ref) {
  return ref.uuid
    ? `id=eq.${ref.uuid}`
    : `id=gte.${ref.short}-0000-0000-0000-000000000000&id=lte.${ref.short}-ffff-ffff-ffff-ffffffffffff`;
}

// W-61: the schema.org type for each of our categories. Only types that
// describe the place honestly: "Culinary Spot" covers stalls and hawker
// centres as well as restaurants, so it is FoodEstablishment, the parent of
// Restaurant. Anything without a clear match is a TouristAttraction.
const SCHEMA_TYPE = {
  'Culinary Spot': 'FoodEstablishment',
  'Cafe & Workspace': 'CafeOrCoffeeShop',
  'Nature & Parks': 'Park',
  'Museum': 'Museum',
  'Sacred Space': 'PlaceOfWorship',
  'Historic Site': 'LandmarksOrHistoricalBuildings',
  'Monument & Statue': 'LandmarksOrHistoricalBuildings',
  'Mall': 'ShoppingCenter',
  'Travel Hub': 'Place',
};

/**
 * The place's JSON-LD: what we know, nothing we don't. No rating, no
 * review, no opening hours (we don't hold them in a form we'd stand by).
 * The image is our own cover only, never the stock picture. `<` is escaped
 * so a name can't close the script.
 * W-183: when the landmark records a real credit for that cover (_preview.js
 * creditFor: never the bootstrap's 'Suna' marker), the image is an
 * ImageObject carrying it. The page shows no photo of its own, so this is
 * where a place page credits its photographer.
 */
function placeLD(place, canonical, cover) {
  const lat = Number(place.latitude); const lng = Number(place.longitude);
  const node = {
    '@context': 'https://schema.org',
    '@type': SCHEMA_TYPE[place.category] || 'TouristAttraction',
    name: place.name,
    url: canonical,
  };
  if (place.address) node.address = String(place.address).trim();
  if (Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0)) {
    node.geo = { '@type': 'GeoCoordinates', latitude: lat, longitude: lng };
  }
  const credit = cover ? creditFor(place) : null;
  if (credit) {
    node.image = { '@type': 'ImageObject', url: cover, creditText: credit.replace(/^Photo: /, ''),
      creator: { '@type': 'Person', name: String(place.photographer_name).trim() } };
  } else if (cover) node.image = cover;
  const text = String(place.description || '').trim();
  if (text) node.description = text;
  return `<script type="application/ld+json">${JSON.stringify(node).replace(/</g, '\\u003c')}</script>`;
}

/** Cut to about `max` characters on a word boundary, with an ellipsis. */
function cutWords(text, max) {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  const space = head.lastIndexOf(' ');
  return `${(space > max / 2 ? head.slice(0, space) : head).replace(/[\s,;:.–-]+$/, '')}…`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Absolute, crawler-fetchable URL for a stored cover, or null. */
function coverURL(path) {
  if (!path || isGooglePhoto(path)) return null;
  if (/^https?:\/\//i.test(path)) return path;
  return `${SUPABASE_URL}/storage/v1/object/public/itinerary-covers/${path
    .split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Verifies the image resolves before advertising it.
 *
 * Bounded at 2.5s, matching b414f20's reasoning exactly: a scraper gives a
 * preview a few seconds before giving up on the CARD, so an unbounded check
 * trades a missing image for a missing card — strictly worse than the bug it
 * prevents.
 */
async function imageResolves(url) {
  if (!url) return false;
  try {
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * The listing on this place, if there is one with a live offer.
 *
 * `public.listing_public(uuid)` is the ONLY public read of `local_listings`,
 * and it returns exactly three fields: slug, offer_text, offer_until. The
 * table itself holds the business's WhatsApp number and is unreadable with
 * this key — verified 9 Oct, every PostgREST route including the embedded
 * join returns 401. That is why this is an RPC and not a select.
 */
async function listingFor(id) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/listing_public`, {
      method: 'POST',
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_landmark: id }),
      signal: AbortSignal.timeout(2000),
    });
    if (!r.ok) return null;
    const rows = await r.json();
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch {
    // A place page must never fail because a listing lookup did.
    return null;
  }
}

/**
 * The Book tickets link (W-25), when unaryx.com has a live partner link for
 * this place.
 *
 * The list is unaryx.com/go/places.json: ids only, built by the same gates
 * as the /go redirect, so this page can never offer a link /go would refuse.
 * The link itself is always our own /go/p-<id>, never the partner URL: the
 * partner, its sub-id and the click line stay in one place. Bounded and
 * silent on failure, like the listing: a place page must not wait on, or
 * break because of, a commission link.
 */
const GO_ORIGIN = 'https://unaryx.com';
async function bookingFor(id) {
  if (!id) return null;
  try {
    const r = await fetch(`${GO_ORIGIN}/go/places.json`, { signal: AbortSignal.timeout(1500) });
    if (!r.ok) return null;
    const body = await r.json();
    const ids = Array.isArray(body?.places) ? body.places : [];
    return ids.includes(id.toLowerCase())
      ? `${GO_ORIGIN}/go/p-${encodeURIComponent(id.toLowerCase())}?src=web-place`
      : null;
  } catch {
    return null;
  }
}

/** `?src=partner-<slug>`, trimmed to the slug. Nothing is trusted yet. */
function claimedSlug(url) {
  const m = String(url || '').match(/[?&]src=partner-([a-z0-9][a-z0-9-]{0,29})\b/);
  return m ? m[1] : null;
}

/** The business's own offer, as plain escaped text. */
function offerLine(listing) {
  if (!listing || !listing.offer_text) return '';
  let line = `From the business: ${listing.offer_text}`;
  if (listing.offer_until) {
    const d = new Date(`${listing.offer_until}T00:00:00+08:00`);
    if (!Number.isNaN(d.getTime())) {
      line += ` (until ${new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Kuala_Lumpur', day: 'numeric', month: 'long',
      }).format(d)})`;
    }
  }
  return line;
}

/** The canonical address for this place, free of rewrite artefacts. */
function canonicalURL(origin, id) {
  return `${origin}/place/${encodeURIComponent(id)}`;
}

// For place.test.mjs only.
export const _bookingFor = bookingFor;
export const _placeLD = placeLD;
export const _cutWords = cutWords;

// ---- W-197: what's around the place --------------------------------------
const REST_HEADERS = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` };
async function rest(path, ms = 2000) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: REST_HEADERS, signal: AbortSignal.timeout(ms) });
    return r.ok ? await r.json() : [];
  } catch { return []; }
}
/** A bounding box `r` km round a point, as PostgREST filters on latitude/longitude. */
function box(lat, lng, r) {
  const dLat = r / 111.32, dLng = r / (111.32 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return `latitude=gte.${(lat - dLat).toFixed(5)}&latitude=lte.${(lat + dLat).toFixed(5)}`
    + `&longitude=gte.${(lng - dLng).toFixed(5)}&longitude=lte.${(lng + dLng).toFixed(5)}`;
}
const EVENT_COLS = 'id,name,start_time,end_time,image_url,latitude,longitude,venue,recurrence_until';
/** When an event is over: its end, else three hours after it starts; a recurring one runs to its last day. */
function endsAt(e) {
  if (e.recurrence_until) return Date.parse(`${String(e.recurrence_until).slice(0, 10)}T23:59:59Z`);
  return e.end_time ? Date.parse(e.end_time) : Date.parse(e.start_time) + 3 * 3600e3;
}
/**
 * Approved events within `r` km that haven't ended and start within 31 days,
 * soonest first, at most 3. world_events has 976 rows and no geo index; the
 * box, the status and the time window bound the read, and the limit caps it.
 */
async function eventsNear(lat, lng, r, now) {
  const soon = new Date(now + 31 * 864e5).toISOString(), past = new Date(now - 3 * 3600e3).toISOString();
  const rows = await rest(`world_events?status=eq.approved&${box(lat, lng, r)}`
    + `&start_time=lte.${soon}&or=(end_time.gte.${past},start_time.gte.${past},recurrence_until.gte.${new Date(now).toISOString().slice(0, 10)})`
    + `&select=${EVENT_COLS}&order=start_time.asc&limit=30`);
  return (Array.isArray(rows) ? rows : [])
    .filter((e) => hasPin(e.latitude, e.longitude) && endsAt(e) > now)
    .map((e) => ({ ...e, km: km(lat, lng, e.latitude, e.longitude), now }))
    .filter((e) => e.km <= r)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))
    .slice(0, 3);
}
/** Up to 3 visible places with their own cover within ~500 m, nearest first. */
async function walksNear(id, lat, lng) {
  const rows = await rest(`landmarks?is_hidden=eq.false&merged_into=is.null&cover_image_url=not.is.null&id=neq.${encodeURIComponent(id)}`
    + `&${box(lat, lng, 0.5)}&select=id,name,category,cover_image_url,latitude,longitude&limit=40`);
  return (Array.isArray(rows) ? rows : [])
    .map((w) => ({ ...w, cover: coverURL(w.cover_image_url), km: km(lat, lng, w.latitude, w.longitude) }))
    .filter((w) => w.cover && w.km <= 0.5)
    .sort((a, b) => a.km - b.km)
    .slice(0, 3);
}
// The not-found page's city: the reader's nearest, by the edge's coordinates.
const CITIES = [
  { slug: 'kuala-lumpur', name: 'Kuala Lumpur', short: 'KL', lat: 3.139, lng: 101.687, tz: 'Asia/Kuala_Lumpur' },
  { slug: 'singapore', name: 'Singapore', short: 'Singapore', lat: 1.3521, lng: 103.8198, tz: 'Asia/Singapore' },
  { slug: 'melbourne', name: 'Melbourne', short: 'Melbourne', lat: -37.8136, lng: 144.9631, tz: 'Australia/Melbourne' },
  { slug: 'sydney', name: 'Sydney', short: 'Sydney', lat: -33.8688, lng: 151.2093, tz: 'Australia/Sydney' },
];
function cityFor(headers) {
  const lat = Number(headers['x-vercel-ip-latitude']), lng = Number(headers['x-vercel-ip-longitude']);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return CITIES[0];
  return CITIES.slice().sort((a, b) => km(lat, lng, a.lat, a.lng) - km(lat, lng, b.lat, b.lng))[0];
}

const STORE = (ct) => `https://apps.apple.com/app/id6759053765?pt=128539200&ct=${encodeURIComponent(ct)}&mt=8`;

function page({ tags, body, android }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <!-- Triggers the App Clip card automatically in iOS Safari -->
  <meta name="apple-itunes-app" content="app-id=6759053765, app-clip-bundle-id=com.unaryx.TravelMug.Clip">
  <link rel="icon" type="image/svg+xml" href="/icons/suna-mark.svg">
  <meta name="theme-color" content="#0f1110">
  ${tags}
  ${HEAD_FONTS}
  ${MAPS_HEAD}
  <style>${CSS}</style>
</head>
<body>
<div class="wrap">
${body}
</div>
${PAGE_SCRIPT}
<script src="/android.js" data-from="${android}"></script>
</body>
</html>`;
}

export default async function handler(req, res) {
  const ref = placeRefFrom(req.url || '');
  // The full UUID. A short link has none until exactly one row answers it.
  let id = ref && ref.uuid ? ref.uuid : '';
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  const now = Date.now();

  let title = 'Discover this place on Suna';
  let description = 'Places worth walking to, with notes from people who went.';
  let image = null;
  let indexable = false;
  // The row, its own cover, and what the page shows.
  let resolved = null;

  if (ref) {
    try {
      // Visible rows only. A merged row is always hidden, and this key can't
      // read hidden rows (RLS), so its `merged_into` can't be followed from
      // here: a merged place's link gets the not-found page, never a wrong one.
      // `limit=2` so a short id that two places share is seen as ambiguous.
      const url = `${SUPABASE_URL}/rest/v1/landmarks`
        + `?${idFilter(ref)}`
        + `&is_hidden=eq.false&merged_into=is.null`
        + `&select=id,name,category,description,address,cover_image_url,photographer_name,cover_source,city_id,latitude,longitude,operating_hours,city:cities(country_code)&limit=2`;
      const r = await fetch(url, { headers: REST_HEADERS, signal: AbortSignal.timeout(2500) });
      const rows = r.ok ? await r.json() : [];
      const place = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (place && place.id) id = String(place.id).toLowerCase();

      if (place) {
        // City is a separate lookup rather than a PostgREST embed: the embed
        // needs a declared relationship, and a failure there would take the
        // whole row with it. A missing city costs a few words in a title.
        let cityName = '';
        if (place.city_id) {
          const cityRows = await rest(`cities?id=eq.${encodeURIComponent(place.city_id)}&select=name&limit=1`);
          cityName = cityRows?.[0]?.name || '';
        }

        // "Tal Barahi Temple — Architecture in Pokhara | Suna"
        const middle = [place.category, cityName ? `in ${cityName}` : ''].filter(Boolean).join(' ');
        title = [place.name, middle].filter(Boolean).join(' — ') + ' | Suna';

        const text = (place.description || '').trim().replace(/\s+/g, ' ');
        // About 155 characters, on a word (W-61): what a results page shows.
        if (text) description = cutWords(text, 155);
        else if (place.address) description = `${place.name} — ${place.address}`;

        // The preview image (I-112, W-53): the place's own cover when it
        // resolves, else the stock image the app deals it. Never Google.
        const candidate = coverURL(place.cover_image_url);
        const stock = stockFor({
          landmarkId: id, category: place.category, countryCode: place.city && place.city.country_code,
          latitude: place.latitude, longitude: place.longitude,
        });
        const pinned = hasPin(place.latitude, place.longitude);
        const [ok, events, walks, tips] = await Promise.all([
          imageResolves(candidate),
          pinned ? eventsNear(Number(place.latitude), Number(place.longitude), 1, now) : [],
          pinned ? walksNear(id, Number(place.latitude), Number(place.longitude)) : [],
          // W-223: this place's published tips: shown on the page, and counted by the index gate below.
          rest(`place_hints?landmark_id=eq.${encodeURIComponent(id)}&${PUBLISHED_TIPS}&select=body,attribution&order=id`),
        ]);
        const ownCover = ok ? candidate : null;
        image = ownCover || (stock ? stock.url : null);
        const tz = tzFor(place.city && place.city.country_code, place.longitude);
        resolved = { place, ownCover, cityName, tz, events, walks, tips: Array.isArray(tips) ? tips : [], hours: hoursInfo(place.operating_hours, tz, now) };

        // Only a page with real content of its own asks to be indexed. This
        // mirrors the sitemap's gate, and it is the half that matters: the
        // sitemap merely omits a thin page, whereas a crawler that reaches one
        // by following a link will index it unless the page says otherwise.
        indexable = hasRealContent({ description: text }, undefined, resolved.tips); // W-217 (3) + W-223: the sitemap's own gate, with the tips the page prints
      }
    } catch {
      // Fall through to the not-found page: a place page must never 500.
    }
  }

  // No canonical for a page that names no place we can show.
  const canonical = resolved && id ? canonicalURL(origin, id) : '';

  // The campaign token. `?src=partner-<slug>` is a claim by whoever shared the
  // link; it becomes `ct=partner-<slug>` only when the database agrees that
  // slug belongs to THIS place. Otherwise the page's own token applies, so a
  // guessed or stale slug costs nothing and attributes nothing.
  const [listing, booking] = await Promise.all([
    resolved && id ? listingFor(id) : null,
    resolved ? bookingFor(id) : null,
  ]);
  const claimed = claimedSlug(req.url);
  const campaign = (claimed && listing && listing.slug === claimed) ? `partner-${claimed}` : null;
  const store = STORE(campaign || 'place-page');
  const offer = offerLine(listing);

  const tags = [
    `<title>${escapeHtml(resolved ? title : "This place isn't on Suna any more · Suna")}</title>`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '',
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="place">`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : '',
    `<meta property="og:site_name" content="Suna">`,
    image ? `<meta name="twitter:card" content="summary_large_image">` : `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    image ? `<meta property="og:image:alt" content="${escapeHtml(title)}">` : '',
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : '',
    indexable ? '' : `<meta name="robots" content="noindex,follow">`,
    resolved && canonical ? placeLD(resolved.place, canonical, resolved.ownCover) : '',
    // The app gets the full UUID, never a percent-encoded slug from the path (W-59).
    id && resolved ? `<meta name="suna:place" content="${escapeHtml(id)}">` : '',
  ].filter(Boolean).join('\n  ');

  let body;
  let cache = 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400';
  if (resolved) {
    body = placeBody({
      place: resolved.place, cityName: resolved.cityName, tz: resolved.tz, hours: resolved.hours,
      cover: resolved.ownCover || image, events: resolved.events, walks: resolved.walks, tips: resolved.tips,
      store, scheme: `suna://place?id=${encodeURIComponent(id)}`, offer, booking, now,
    });
  } else {
    // W-197 (3): what's on in the reader's nearest city. It depends on where
    // the reader is, so the edge keeps one copy per country.
    const city = cityFor(req.headers);
    const events = (await eventsNear(city.lat, city.lng, 25, now)).map((e) => ({ ...e, meta: e.venue || '' }));
    body = missingBody({ cityName: city.name, cityShort: city.short, citySlug: city.slug, events, store, tz: city.tz });
    res.setHeader('Vary', 'x-vercel-ip-country');
    cache = 'public, max-age=300, s-maxage=600';
  }

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    // A partner link renders a different page from the same path, so it
    // cannot share a cache entry with the plain one. Vercel keys on the full
    // URL including the query, so `?src=` already separates them.
    .setHeader('Cache-Control', cache)
    .send(page({ tags, body, android: 'place' }));
}

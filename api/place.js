// Server-rendered place page.
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

import { mapsLinks, MAPS_HEAD, MAPS_CSS } from './_maps.js';
import { stockFor, isGooglePhoto } from './_stock.js';

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
  const segment = (pathname.split('/place/')[1] || '').split('/')[0].split('?')[0];
  const cut = segment.lastIndexOf('--');
  const tail = (cut < 0 ? segment : segment.slice(cut + 2)).toLowerCase();
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
  if (cover) node.image = cover;
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

export default async function handler(req, res) {
  const ref = placeRefFrom(req.url || '');
  // The full UUID. A short link has none until exactly one row answers it.
  let id = ref && ref.uuid ? ref.uuid : '';
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;

  // The static shell, fetched from this same deployment so the markup has one
  // definition and cannot drift.
  let html;
  try {
    const shell = await fetch(`${origin}/place.html`);
    html = await shell.text();
  } catch {
    res.status(302).setHeader('Location', '/place.html').end();
    return;
  }

  let title = 'Discover this place on Suna';
  let description = 'Places worth walking to, with notes from people who went.';
  let image = null;
  let indexable = false;
  // Take me there (W-47), when the place has a real pin.
  let maps = '';
  // The row and its own cover, for the JSON-LD (W-61).
  let resolved = null;

  if (ref) {
    try {
      // Visible rows only. A merged row is always hidden, and this key can't
      // read hidden rows (RLS), so its `merged_into` can't be followed from
      // here: a merged place's link gets the generic card, never a wrong one.
      // `limit=2` so a short id that two places share is seen as ambiguous.
      const url = `${SUPABASE_URL}/rest/v1/landmarks`
        + `?${idFilter(ref)}`
        + `&is_hidden=eq.false&merged_into=is.null`
        + `&select=id,name,category,description,address,cover_image_url,city_id,latitude,longitude,city:cities(country_code)&limit=2`;
      const r = await fetch(url, {
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` },
        signal: AbortSignal.timeout(2500),
      });
      const rows = r.ok ? await r.json() : [];
      const place = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
      if (place && place.id) id = String(place.id).toLowerCase();

      if (place) {
        // City is a separate lookup rather than a PostgREST embed: the embed
        // needs a declared relationship, and a failure there would take the
        // whole row with it. A missing city costs a few words in a title.
        let cityName = '';
        if (place.city_id) {
          try {
            const cr = await fetch(
              `${SUPABASE_URL}/rest/v1/cities?id=eq.${encodeURIComponent(place.city_id)}&select=name&limit=1`,
              {
                headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` },
                signal: AbortSignal.timeout(2000),
              }
            );
            const cityRows = cr.ok ? await cr.json() : [];
            cityName = cityRows?.[0]?.name || '';
          } catch { /* title just loses the city */ }
        }

        // "Tal Barahi Temple — Architecture in Pokhara | Suna"
        const middle = [place.category, cityName ? `in ${cityName}` : '']
          .filter(Boolean).join(' ');
        title = [place.name, middle].filter(Boolean).join(' — ') + ' | Suna';

        const text = (place.description || '').trim().replace(/\s+/g, ' ');
        // About 155 characters, on a word (W-61): what a results page shows.
        if (text) {
          description = cutWords(text, 155);
        } else if (place.address) {
          description = `${place.name} — ${place.address}`;
        }

        maps = mapsLinks(place.latitude, place.longitude, 'map-btn');

        // The preview image (I-112, W-53): the place's own cover when it
        // resolves, else the stock image the app deals it. Never Google.
        const candidate = coverURL(place.cover_image_url);
        const stock = stockFor({
          landmarkId: id, category: place.category, countryCode: place.city && place.city.country_code,
          latitude: place.latitude, longitude: place.longitude,
        });
        const ownCover = (await imageResolves(candidate)) ? candidate : null;
        image = ownCover || (stock ? stock.url : null);
        resolved = { place, ownCover };

        // Only a page with real content of its own asks to be indexed. This
        // mirrors the sitemap's gate, and it is the half that matters: the
        // sitemap merely omits a thin page, whereas a crawler that reaches one
        // by following a link will index it unless the page says otherwise.
        indexable = text.length >= 60 && !/^highly rated .+ nearby\.?$/i.test(text);
      }
    } catch {
      // Fall through with the generic values — a preview must never 500.
    }
  }

  // No canonical for a request that names no place: `/place/` is not an address
  // worth consolidating onto, and pointing at it would be worse than silence.
  const canonical = id ? canonicalURL(origin, id) : '';

  // The campaign token. `?src=partner-<slug>` is a claim by whoever shared the
  // link; it becomes `ct=partner-<slug>` only when the database agrees that
  // slug belongs to THIS place. Otherwise the ordinary token applies, so a
  // guessed or stale slug costs nothing and attributes nothing.
  const [listing, booking] = await Promise.all([
    id ? listingFor(id) : null,
    bookingFor(id),
  ]);
  const claimed = claimedSlug(req.url);
  const campaign = (claimed && listing && listing.slug === claimed)
    ? `partner-${claimed}`
    : null;
  const offer = offerLine(listing);
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : '',
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="place">`,
    canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : '',
    `<meta property="og:site_name" content="Suna">`,
    image
      ? `<meta name="twitter:card" content="summary_large_image">`
      : `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    image ? `<meta property="og:image:alt" content="${escapeHtml(title)}">` : '',
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : '',
    indexable ? '' : `<meta name="robots" content="noindex,follow">`,
    resolved && canonical ? placeLD(resolved.place, canonical, resolved.ownCover) : '',
    // Read by place.html to swap the App Store link's token and to show the
    // offer. Both are escaped: offer_text is written by the business.
    campaign ? `<meta name="suna:campaign" content="${escapeHtml(campaign)}">` : '',
    offer ? `<meta name="suna:offer" content="${escapeHtml(offer)}">` : '',
    // Read by place.html for Open in Suna: the full id, so the app gets the
    // UUID rather than a percent-encoded slug from the path (W-59).
    id ? `<meta name="suna:place" content="${escapeHtml(id)}">` : '',
    // Read by place.html to show "Book tickets". Our own /go URL, built here.
    booking ? `<meta name="suna:book" content="${escapeHtml(booking)}">` : '',
  ].filter(Boolean).join('\n  ');

  // Replace rather than append: a duplicate og:title is resolved differently by
  // each scraper, so leaving both is a coin flip.
  const rendered = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(property|name)="(og:[^"]*|twitter:[^"]*|description|robots)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace('</head>', `  ${tags}\n  ${MAPS_HEAD}\n  <style>${MAPS_CSS}</style>\n</head>`)
    .replace('<!--MAPS-->', maps ? `<p id="maps">${maps}</p>` : '');

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    // A partner link renders a different page from the same path, so it
    // cannot share a cache entry with the plain one. Vercel keys on the full
    // URL including the query, so `?src=` already separates them; this header
    // is unchanged, and an expired offer simply drops off within the window.
    .setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
    .send(rendered);
}

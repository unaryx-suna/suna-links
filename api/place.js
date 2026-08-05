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

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
// Publishable key: public by design, the same one place.html already ships.
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';

/** The place id from `/place/<uuid>`, tolerating a trailing segment or query. */
function placeIDFrom(pathname) {
  const raw = decodeURIComponent((pathname.split('/place/')[1] || '').split('/')[0].split('?')[0]);
  // Only ever used inside an equality filter, but validated anyway: an id that
  // is not a UUID cannot match a row, so rejecting it early saves a round trip
  // and keeps anything odd out of the query string entirely.
  return /^[0-9a-f-]{36}$/i.test(raw) ? raw : '';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Absolute, crawler-fetchable URL for a stored cover, or null. */
function coverURL(path) {
  if (!path) return null;
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

/** The canonical address for this place, free of rewrite artefacts. */
function canonicalURL(origin, id) {
  return `${origin}/place/${encodeURIComponent(id)}`;
}

export default async function handler(req, res) {
  const id = placeIDFrom(req.url || '');
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

  if (id) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/landmarks`
        + `?id=eq.${encodeURIComponent(id)}`
        + `&is_hidden=eq.false`
        + `&select=name,category,description,address,cover_image_url,city_id&limit=1`;
      const r = await fetch(url, {
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` },
        signal: AbortSignal.timeout(2500),
      });
      const rows = r.ok ? await r.json() : [];
      const place = Array.isArray(rows) ? rows[0] : null;

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
        if (text) {
          description = text.length > 200 ? `${text.slice(0, 197)}…` : text;
        } else if (place.address) {
          description = `${place.name} — ${place.address}`;
        }

        const candidate = coverURL(place.cover_image_url);
        image = (await imageResolves(candidate)) ? candidate : null;

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
  ].filter(Boolean).join('\n  ');

  // Replace rather than append: a duplicate og:title is resolved differently by
  // each scraper, so leaving both is a coin flip.
  const rendered = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(property|name)="(og:[^"]*|twitter:[^"]*|description|robots)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace('</head>', `  ${tags}\n</head>`);

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    .setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
    .send(rendered);
}

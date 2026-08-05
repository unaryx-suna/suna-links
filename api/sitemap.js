// The sitemap, generated from what is actually published.
//
// A creator post decays in about 48 hours. An indexed page does not — it is a
// floor that rises as content is added, which is the only acquisition channel
// here that compounds. That only holds if the sitemap stays true as content
// changes, so nothing in this file is hand-written: every URL comes from the
// database at request time.
//
// PAGINATION IS LOAD-BEARING. PostgREST caps a response at 1000 rows and says
// nothing about it — HTTP 200, a short array, no error field. The admin panel
// has two scans that ask for `limit=100000`, receive exactly 1000, and report
// the remaining 2300 landmarks as clean. A sitemap with that bug would silently
// stop listing most of the catalogue, so `fetchAll` below pages explicitly with
// Range and keeps going until a page comes back short.

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
// Publishable key: public by design, the same one every page here already ships.
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';

const SITE = 'https://app.unaryx.com';
const PAGE_SIZE = 1000;
/** Sitemaps are capped at 50,000 URLs by the spec; stop well short of it. */
const MAX_URLS = 45000;

/**
 * Every row for a query, one page at a time.
 *
 * Uses Range rather than limit/offset because PostgREST reports the true total
 * in `content-range`, so a short page is an unambiguous end-of-data signal
 * rather than a guess.
 */
async function fetchAll(path, { max = MAX_URLS } = {}) {
  const rows = [];
  for (let from = 0; from < max; from += PAGE_SIZE) {
    const to = Math.min(from + PAGE_SIZE - 1, max - 1);
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: {
        apikey: PUBLISHABLE_KEY,
        Authorization: `Bearer ${PUBLISHABLE_KEY}`,
        Range: `${from}-${to}`,
        'Range-Unit': 'items',
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!r.ok) break;
    const page = await r.json();
    if (!Array.isArray(page) || page.length === 0) break;
    rows.push(...page);
    // Short page means the table is exhausted.
    if (page.length < PAGE_SIZE) break;
  }
  return rows;
}

/**
 * The readable half of a share link, mirroring `ItineraryShareLink.swift`.
 *
 * The database stores only the bare ten-character token in `share_slug`; the
 * readable prefix is composed at share time and is a URL concern, never a
 * column. Reproducing it here means the sitemap advertises the same address the
 * app hands out, so the two do not compete as separate URLs for one page.
 */
function readablePrefix(name) {
  return String(name || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip diacritics
    .toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).join('-')
    .slice(0, 60);
}

function itineraryPath(row) {
  const prefix = readablePrefix(row.name);
  return prefix ? `/i/${prefix}--${row.share_slug}` : `/i/${row.share_slug}`;
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry({ loc, lastmod, changefreq, priority }) {
  return [
    '  <url>',
    `    <loc>${escapeXml(SITE + loc)}</loc>`,
    lastmod ? `    <lastmod>${escapeXml(String(lastmod).slice(0, 10))}</lastmod>` : '',
    changefreq ? `    <changefreq>${changefreq}</changefreq>` : '',
    priority ? `    <priority>${priority}</priority>` : '',
    '  </url>',
  ].filter(Boolean).join('\n');
}

export default async function handler(req, res) {
  const entries = [urlEntry({ loc: '/', changefreq: 'weekly', priority: '1.0' })];

  try {
    // Published creator itineraries. `public_itineraries` is the anon-readable
    // projection that already exists for the reader — the same view the preview
    // renderer uses — so this cannot accidentally list an unpublished plan.
    const itineraries = await fetchAll(
      'public_itineraries?select=share_slug,name,published_at&share_slug=not.is.null&order=published_at.desc'
    );
    for (const row of itineraries) {
      if (!row.share_slug) continue;
      entries.push(urlEntry({
        loc: itineraryPath(row),
        lastmod: row.published_at,
        changefreq: 'weekly',
        priority: '0.9',
      }));
    }

    // Public places.
    //
    // The quality gate is `hasRealContent`, applied in JS rather than as a
    // filter, because the obvious filter does nothing: every one of the 3,321
    // non-hidden landmarks has a non-null description, so `description=not.is.null`
    // admits the entire table. About one in ten of those descriptions is
    // generated filler of the form "Highly rated Pub nearby." — a page whose
    // only content is that sentence is thin, and thousands of thin pages is how
    // a domain teaches a search engine to ignore it. That is the opposite of the
    // floor this exists to build, so they are left out of the sitemap. They
    // still render and still resolve if linked directly; they are simply not
    // advertised for crawling.
    //
    // `is_hidden` is respected because it is the existing "do not surface this"
    // flag. Lodging is excluded to match PlaceFilter — the product rule is that
    // hotels and rentals are never surfaced, and a public page IS surfacing.
    const places = await fetchAll(
      'landmarks?select=id,name,category,description,updated_at'
      + '&is_hidden=eq.false'
      + '&name=not.is.null'
      + '&order=updated_at.desc'
    );
    for (const row of places) {
      if (!row.id || isLodging(row) || !hasRealContent(row)) continue;
      entries.push(urlEntry({
        loc: `/place/${row.id}`,
        lastmod: row.updated_at,
        changefreq: 'monthly',
        priority: '0.6',
      }));
    }
  } catch {
    // A sitemap that 500s teaches a crawler to stop asking. Serving the entries
    // gathered so far — at minimum the home page — is strictly better.
  }

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    + entries.join('\n')
    + '\n</urlset>\n';

  res
    .status(200)
    .setHeader('Content-Type', 'application/xml; charset=utf-8')
    // Cached hard: this is a crawler-facing document that changes when content
    // is published, not per request. Six hours at the edge, a day of stale
    // service while it revalidates.
    .setHeader('Cache-Control', 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400')
    .send(xml);
}

/**
 * Mirrors the whole-word half of `PlaceFilter.lodgingWords`.
 *
 * Whole-word matching, not substring, for the reason the Swift version gives:
 * "inn" must not trip on "Dinner". This is the conservative subset — the app
 * also matches phrases and private-access markers, and it stays the authority.
 * A place that slips through here is listed but still never recommended.
 */
const LODGING_WORDS = new Set([
  'hotel', 'hotels', 'resort', 'resorts', 'motel', 'motels',
  'hostel', 'hostels', 'hostal', 'guesthouse', 'aparthotel',
  'inn', 'auberge', 'ryokan', 'pension', 'lodge', 'lodging',
  'homestay', 'airbnb', 'villa', 'villas', 'bungalow', 'bungalows',
  'chalet', 'chalets', 'cottage', 'cottages', 'cabin', 'cabins',
  'campground', 'campgrounds', 'campsite', 'dormitory', 'gite', 'gîte',
]);

/**
 * Whether a place has enough of its own text to be worth indexing.
 *
 * Two rules, both measured against what the data actually looks like today:
 * the generated filler is uniformly short and matches one template, and 3,067
 * of 3,321 descriptions clear the length bar. Raise or drop either constant as
 * the descriptions improve — this is a judgement about content quality, not a
 * correctness rule, and it is meant to be revisited.
 */
const FILLER_DESCRIPTION = /^highly rated .+ nearby\.?$/i;
const MIN_DESCRIPTION_LENGTH = 60;

function hasRealContent(row) {
  const description = (row.description || '').trim();
  if (description.length < MIN_DESCRIPTION_LENGTH) return false;
  if (FILLER_DESCRIPTION.test(description)) return false;
  return true;
}

function isLodging(row) {
  const haystack = `${row.name || ''} ${row.category || ''}`.toLowerCase();
  return haystack
    .split(/[^a-zà-ÿ0-9]+/)
    .some((token) => token && LODGING_WORDS.has(token));
}

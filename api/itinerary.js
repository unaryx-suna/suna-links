// Server-rendered link preview for a published itinerary.
//
// Why this exists: `public/i.html` is a static file whose OG tags are literals —
// every itinerary ever shared previewed as "An itinerary on Suna" with NO
// og:image at all, and `twitter:card` was `summary`, the small card. The real
// title is written by client-side JS into `#title`, and no crawler runs JS, so
// Facebook, iMessage, WhatsApp, Slack and X all saw the same placeholder.
//
// Every creator post ends in a link. A blank card is the difference between a
// share that converts and one that does not, which makes og:image the single
// largest click-through lever the product has.
//
// The page still renders client-side for humans — this only fills the <head>
// before it is served, so nothing about the reader experience changes.

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
// Publishable key: public by design, same one the page already ships.
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';

/** The real slug from either link form: `nice-name--ab12cd34ef` or `ab12cd34ef`. */
function slugFrom(pathname) {
  const raw = decodeURIComponent((pathname.split('/i/')[1] || '').split('/')[0].split('?')[0]);
  if (!raw.includes('--')) return raw;
  const tail = raw.split('--').pop();
  return tail || raw;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Absolute, crawler-fetchable URL for a cover stored in the media bucket. */
function coverURL(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  // `creator-media` is private, so a signed URL would expire and a crawler
  // caches for days. Covers are served from the public bucket instead; a
  // private path yields no image rather than a broken one.
  return `${SUPABASE_URL}/storage/v1/object/public/creator-media/${path
    .split('/').map(encodeURIComponent).join('/')}`;
}

export default async function handler(req, res) {
  const slug = slugFrom(req.url || '');

  // The static shell, fetched from the same deployment. Serving it through this
  // function rather than duplicating the markup means the page has exactly one
  // definition and cannot drift.
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  let html;
  try {
    const shell = await fetch(`${origin}/i.html`);
    html = await shell.text();
  } catch {
    res.status(302).setHeader('Location', '/i.html').end();
    return;
  }

  let title = 'An itinerary on Suna';
  let description = 'A route someone actually walked, with their own photos and notes.';
  let image = null;

  if (slug) {
    try {
      const url = `${SUPABASE_URL}/rest/v1/public_itineraries`
        + `?share_slug=eq.${encodeURIComponent(slug)}`
        + `&select=name,intro_story,resolved_city_name,creator_username,cover_media_path&limit=1`;
      const r = await fetch(url, {
        headers: { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` },
      });
      const rows = r.ok ? await r.json() : [];
      const it = Array.isArray(rows) ? rows[0] : null;
      if (it) {
        // "Bangkok for you — a Suna itinerary by @booak55"
        const parts = [it.name].filter(Boolean);
        if (it.creator_username) parts.push(`by @${it.creator_username}`);
        title = parts.join(' — ') || title;

        // The creator's own opening line is the best description available;
        // fall back to something true rather than something promotional.
        const story = (it.intro_story || '').trim().replace(/\s+/g, ' ');
        description = story
          ? (story.length > 200 ? `${story.slice(0, 197)}…` : story)
          : (it.resolved_city_name
              ? `A route through ${it.resolved_city_name}, with their own photos and notes.`
              : description);

        image = coverURL(it.cover_media_path);
      }
    } catch {
      // Fall through with the generic values — a preview must never 500.
    }
  }

  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:url" content="${escapeHtml(origin + (req.url || ''))}">`,
    `<meta property="og:site_name" content="Suna">`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    // A large card only when there is a real image behind it — claiming
    // `summary_large_image` with no image renders a broken box.
    image
      ? `<meta name="twitter:card" content="summary_large_image">`
      : `<meta name="twitter:card" content="summary">`,
    `<meta name="twitter:title" content="${escapeHtml(title)}">`,
    `<meta name="twitter:description" content="${escapeHtml(description)}">`,
    image ? `<meta property="og:image" content="${escapeHtml(image)}">` : '',
    image ? `<meta property="og:image:alt" content="${escapeHtml(title)}">` : '',
    image ? `<meta name="twitter:image" content="${escapeHtml(image)}">` : '',
  ].filter(Boolean).join('\n  ');

  // Replace the static head block rather than appending: a duplicate og:title
  // is resolved differently by each scraper, so leaving both is a coin flip.
  const rendered = html
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(property|name)="(og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/gi, '')
    .replace('</head>', `  ${tags}\n</head>`);

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    // Short enough that publishing a fix propagates, long enough that a viral
    // link is not re-resolved per scrape.
    .setHeader('Cache-Control', 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
    .send(rendered);
}

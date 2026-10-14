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
// Since W-15 (12 Oct) it renders the BODY too for a public itinerary: the
// cover, the byline and every stop (api/_preview.js). A private, draft or
// missing slug still gets the generic page exactly as before.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordOpen, clientIP, scheduleBackground } from './_open-log.js';
import { loadItinerary, coverFor, coverVariants, previewBody, isBySuna } from './_preview.js';
// Suna herself, from the app's own source (the Lab's copy is byte-identical to
// TravelMug/Resources/suna-faces.js). Rendered here as SVG, so she cannot fail
// to load the way an <img> can.
import { sunaSvg, SUNA_DEFS, SUNA_CSS } from '../public/lab/suna-faces.js';
import { MAPS_HEAD, MAPS_CSS } from './_maps.js';

const mascot = () => sunaSvg('st-idle', 96, { label: 'Suna' });

// vercel.json `includeFiles` ships public/i.html inside this function, at
// the same path under the function's working directory. (Not import.meta:
// Vercel compiles these files to CommonJS, where it is a syntax error.)
let shellCache = null;
function readShell() {
  if (shellCache) return shellCache;
  try {
    shellCache = readFileSync(join(process.cwd(), 'public', 'i.html'), 'utf8');
  } catch {
    shellCache = null;
  }
  return shellCache;
}

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';

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

/** Absolute, crawler-fetchable URL for a cover in the public cover bucket. */
function coverURL(path) {
  if (!path) return null;
  if (/^https?:\/\//i.test(path)) return path;
  // `itinerary-covers` is PUBLIC (20260819_itinerary_covers_bucket.sql), which
  // is the only thing that works here: a crawler has no session, and it caches
  // a preview for days while a signed URL lasts an hour.
  //
  // This used to point at `creator-media`, the project's private bucket. The
  // public endpoint only resolves public buckets, so every URL it produced
  // answered `NoSuchBucket` and the card rendered an empty box.
  return `${SUPABASE_URL}/storage/v1/object/public/itinerary-covers/${path
    .split('/').map(encodeURIComponent).join('/')}`;
}

/**
 * Verifies the cover actually resolves before we advertise it.
 *
 * Covers predating the public bucket are still in `creator-media`, and their
 * bytes can't be moved server-side. Claiming `summary_large_image` on a URL
 * that 404s is worse than claiming no image — the post renders a large blank
 * card. One HEAD is cheap next to the render this response feeds.
 */
async function imageResolves(url) {
  if (!url) return false;
  try {
    // Bounded. Scrapers give a preview a few seconds before giving up entirely,
    // so an unbounded check would trade a missing image for a missing CARD —
    // strictly worse than the bug it exists to prevent.
    const r = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(2500) });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * The canonical URL for this request, without Vercel's rewrite artefacts.
 *
 * The `/i/:path*` rewrite appends its captured group to the query string, so
 * `req.url` arrives as `/i/old-kl--ab12?via=x&path=old-kl--ab12` and og:url was
 * advertising that `path=` param as part of the canonical address. Rebuilt from
 * the pathname plus the params the SHARE LINK actually carries.
 */
function canonicalURL(origin, rawURL) {
  const parsed = new URL(rawURL || '/', origin);
  parsed.searchParams.delete('path');
  return parsed.toString();
}

/**
 * The readable half of a share link, mirroring `ItineraryShareLink.swift`.
 *
 * `share_slug` holds only the bare ten-character token; the readable prefix is
 * composed at share time and is a URL concern, never a column. Reproducing it
 * here lets the canonical point at the same address the app hands out.
 */
function readablePrefix(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/).filter(Boolean).join('-')
    .slice(0, 60);
}

/**
 * ONE address per itinerary, whatever was requested.
 *
 * The same itinerary is reachable as `/i/cz2fcegzfk`, as
 * `/i/old-kl-on-foot--cz2fcegzfk`, and as either of those with a `?via=` per
 * creator who shared it. Left alone those are N separate URLs competing for one
 * piece of content, splitting whatever authority it earns. The canonical is
 * built from the itinerary's own name and slug — never from the request — so
 * every variant collapses onto the same address.
 *
 * `via` is dropped here on purpose. It is attribution, it belongs on og:url
 * where the shared address matters, and it must not fork the canonical.
 */
function canonicalItineraryURL(origin, slug, name) {
  if (!slug) return `${origin}/`;
  const prefix = readablePrefix(name);
  return `${origin}/i/${prefix ? `${prefix}--${slug}` : slug}`;
}

export default async function handler(req, res) {
  const slug = slugFrom(req.url || '');
  // Stamped before any awaiting happens, so the row records when the visitor
  // arrived rather than when the database write got round to it.
  const requestedAt = new Date();

  // The static shell, public/i.html: one definition of the page, so it cannot
  // drift. Read from the function's own bundle first. Fetching it over HTTP
  // from the same deployment (the old way, now the fallback) gets Vercel's
  // login page on a protected preview, so every /i/ preview rendered blank.
  const origin = `https://${req.headers['x-forwarded-host'] || req.headers.host}`;
  let html = readShell();
  if (!html) {
    try {
      const shell = await fetch(`${origin}/i.html`);
      html = await shell.text();
    } catch {
      res.status(302).setHeader('Location', '/i.html').end();
      return;
    }
  }

  let title = 'An itinerary on Suna';
  let description = 'A route someone actually walked, with their own photos and notes.';
  let image = null;
  // The itinerary's own name, kept separate from the composed title so the
  // canonical prefix matches what the app generates rather than "Name — by @x".
  let rawName = '';
  // The server-rendered body, or null for the generic page.
  let body = null;
  // True when the body carries signed moment URLs, which expire in an hour.
  let signed = false;

  if (slug) {
    try {
      const data = await loadItinerary(slug, coverURL);
      const it = data ? data.it : null;
      if (it) {
        // "Bangkok for you — a Suna itinerary by @booak55"
        rawName = it.name || '';
        const parts = [it.name].filter(Boolean);
        // A Suna or partner itinerary never names its owner account (W-31):
        // "by Suna", "by WORQ"; only a creator's own is "by @username".
        if (isBySuna(it)) parts.push('by Suna');
        else if (it.partner_name) parts.push(`by ${it.partner_name}`);
        else if (it.creator_username) parts.push(`by @${it.creator_username}`);
        title = parts.join(' — ') || title;

        // The creator's own opening line is the best description available;
        // fall back to something true rather than something promotional.
        const story = (it.intro_story || '').trim().replace(/\s+/g, ' ');
        description = story
          ? (story.length > 200 ? `${story.slice(0, 197)}…` : story)
          : (it.resolved_city_name
              ? `A route through ${it.resolved_city_name}, with their own photos and notes.`
              : description);

        // The itinerary's own cover when it resolves, else the first stop's
        // place photo: the same picture the page opens on.
        const cover = coverFor(data, await imageResolves(data.cover));
        image = cover;
        body = previewBody(data, cover, await coverVariants(cover, imageResolves), mascot());
        signed = data.signedMoments;
      }
    } catch {
      // Fall through with the generic values — a preview must never 500.
    }
  }

  const canonical = canonicalItineraryURL(origin, slug, title === 'An itinerary on Suna' ? '' : rawName);
  const shareURL = canonicalURL(origin, req.url);
  const tags = [
    `<title>${escapeHtml(title)}</title>`,
    // Consolidates the two link forms. `/i/old-kl-on-foot--cz2fcegzfk` and the
    // bare `/i/cz2fcegzfk` both resolve to this same itinerary, and `?via=` adds
    // a distinct URL per creator on top of that — without this they compete as
    // separate pages for one piece of content and split whatever authority it
    // earns. Points at the address as requested, `path=` artefact stripped.
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    `<meta property="og:title" content="${escapeHtml(title)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:type" content="article">`,
    `<meta property="og:url" content="${escapeHtml(shareURL)}">`,
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
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace('</head>', `  ${tags}\n</head>`)
    // Before first paint, so the Apple Maps button (W-47) never flashes in or out.
    .replace('</head>', () => (/maps-apple/.test(body || '')
      ? `  ${MAPS_HEAD}\n  <style>${MAPS_CSS}</style>\n</head>` : '</head>'))
    .replace(/<body>[\s\S]*?<!--\/BODY-->/, (generic) => (body
      ? `<body class="pv-body" data-preview="1">\n${body}`
      : generic))
    // Her gradients and her motion, only where she is drawn.
    .replace('<!--MASCOT-->', mascot())
    .replace('</head>', () => (/class="sn /.test(body || '<!--MASCOT-->')
      ? `<style>${SUNA_CSS}</style>\n</head>` : '</head>'))
    .replace(/<body([^>]*)>/, (m) => (/class="sn /.test(body || 'generic')
      ? `${m}\n<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${SUNA_DEFS}</defs></svg>` : m));

  // Record the open. Started BEFORE the response so the request is already in
  // flight, then handed to the platform to finish afterwards.
  //
  // The original version awaited this after `res.send()` and lost every row:
  // the invocation is suspended once the response is flushed, so the fetch
  // never completed. `waitUntil` is what actually keeps it alive; where that
  // hook is unavailable we block instead, which costs the visitor a little
  // latency and is strictly better than a counter that quietly records nothing.
  const params = new URL(req.url || '/', origin).searchParams;
  const logging = recordOpen({
    slug,
    via: params.get('via'),
    ctx: params.get('ctx'),
    referrer: req.headers.referer || req.headers.referrer || null,
    userAgent: req.headers['user-agent'] || null,
    ip: clientIP(req.headers),
    requestedAt,
    source: 'render',
  });
  const backgrounded = scheduleBackground(logging);

  // Whether logging is even CONFIGURED, stated on the response itself.
  //
  // Booleans only — never a value, never a key name. This exists because the
  // failure modes below are all silent by design (a counter must never break a
  // page), so "no rows appeared" was indistinguishable from "the environment
  // is not wired up". One `curl -sI` now answers that without needing access
  // to the log stream.
  res.setHeader(
    'x-open-log',
    `key=${process.env.SUPABASE_SERVICE_ROLE_KEY ? 1 : 0}`
    + `;salt=${process.env.OPEN_LOG_SALT ? 1 : 0}`
    + `;bg=${backgrounded ? 1 : 0}`
  );

  // Block only when the platform will not carry the write for us, or when
  // deliberately probing. `?__diag=1` also reports the insert's outcome.
  if (!backgrounded || params.get('__diag') === '1') {
    const status = await logging;
    res.setHeader('x-open-log-insert', status || 'unknown');
  }

  res
    .status(200)
    .setHeader('Content-Type', 'text/html; charset=utf-8')
    // Short enough that publishing a fix propagates, long enough that a viral
    // link is not re-resolved per scrape.
    // A page with signed moment URLs (valid 3600 s) is never served older
    // than 300 + 600 + 1800 = 2700 s, so no reader is handed a dead image.
    .setHeader('Cache-Control', signed
      ? 'public, max-age=300, s-maxage=600, stale-while-revalidate=1800'
      : 'public, max-age=300, s-maxage=600, stale-while-revalidate=86400')
    .send(rendered);

}

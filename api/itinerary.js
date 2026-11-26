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

import { segmentAfter, tailOf, decodeSegment, hasLongDash, withHyphens } from './_slug.js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recordOpen, clientIP, scheduleBackground } from './_open-log.js';
import { loadItinerary, coverFor, coverVariants, coverPreload, previewBody, isBySuna } from './_preview.js';
import { MAPS_HEAD, MAPS_CSS } from './_maps.js';
import { rest } from './_clip.js';   // W-314 OD-web-Q3-3: the name lookup

// W-183 (Brian via Ops OPS-106, 3 Nov: "the Suna bot is the wrong design"):
// today's Suna, the smooth bronze egg with the visor and no limbs (Ops's v5
// render, claude/content/asksuna/blocky-video-1/suna/suna-ref-idle-fullbody-
// 1080-alpha.png, trimmed to 288 px tall for a 96 px box at 3x). It replaces
// the old SVG Suna with arms and legs (public/lab/suna-faces.js), which no
// page here draws any more.
export const mascot = () => '<picture class="suna-3d"><source srcset="/icons/suna-3d-idle.webp" type="image/webp">'
  + '<img src="/icons/suna-3d-idle.png" width="72" height="96" alt="Suna" decoding="async"></picture>';

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

/** The real slug from any link form: `nice-name--ab12cd34ef`, the same with a long dash (W-227), or `ab12cd34ef`. */
function slugFrom(pathname) {
  return tailOf(segmentAfter(pathname, 'i'));
}

/**
 * W-227: where a request that isn't the canonical spelling goes, or null.
 *
 * `/i/<slug>`, an old name's prefix, `Chiang-Mai--<slug>` and the long-dash
 * forms all 301 to the one address the page calls canonical, with the query
 * kept (`via`, `ct`, `ctx`; never the rewrite's own `path`). An itinerary we
 * could not load has no canonical to go to: only a long dash is put back to
 * `--`, so the page's script and the app read a link they understand.
 */
export function redirectFor(rawURL, origin, canonical, found) {
  const parsed = new URL(rawURL || '/', origin);
  const segment = segmentAfter(parsed.pathname, 'i');
  if (!segment) return null;
  let target = null;
  if (found) {
    const want = decodeSegment(new URL(canonical).pathname.slice(3));
    if (segment !== want) target = new URL(canonical).pathname;
  } else if (hasLongDash(segment)) {
    target = `/i/${encodeURIComponent(withHyphens(segment))}`;
  }
  if (!target) return null;
  parsed.searchParams.delete('path');
  const query = parsed.searchParams.toString();
  return `${target}${query ? `?${query}` : ''}`;
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

/**
 * W-193 (Axel AXL-125): the `via` the open log records. A link shared with a
 * channel tag (`?ct=deepavali-bfd`) and no `via` used to count as no source;
 * it's now 'ct:<ct>'. A `via` always wins. Raw, as the log stores everything.
 */
export function openVia(params) {
  const via = params.get('via');
  if (via) return via;
  const ct = params.get('ct');
  return ct ? `ct:${ct}` : null;
}

const MAX_DESC = 155 - ' Copy this plan to Suna.'.length;   // 131
/** The story when it fits whole and says enough; else 'Start at A, then B, in City: summary.' trimmed by parts. */
export function planDescription(story, city, shown, summary) {
  if (story && story.length >= 70 && story.length <= MAX_DESC) return story;
  if (story && story.length > MAX_DESC) {
    const cut = story.slice(0, MAX_DESC).match(/^.*[.!?](?=\s|$)/);
    if (cut && cut[0].length >= 70) return cut[0];
  }
  const names = shown.map((x) => String(x.place_name || '').trim()).filter(Boolean).slice(0, 2);
  const where = city ? ` in ${city}` : '';
  const NOTE = ', with photos and notes for each stop';
  const two = names.length === 2 ? `Start at ${names[0]}, then ${names[1]}${where}` : '';
  const tries = [
    two && summary ? `${two}${NOTE}. ${summary[0].toUpperCase()}${summary.slice(1)}.` : '',
    two ? `${two}${NOTE}.` : '',
    two && summary ? `${two}: ${summary}.` : '',
    two ? `${two}.` : '',
    names.length ? `Start at ${names[0]}${where}, with photos and notes for each stop.` : '',
    city ? `A route through ${city}, with photos and notes for each stop.` : '',
    "A route someone actually walked, with their own photos and notes.",
  ].filter(Boolean);
  return tries.find((t) => t.length <= MAX_DESC) || tries[tries.length - 1];
}

/** The stops a visitor can see, as a schema.org ItemList (names only; no private notes). */
export function planLd(url, name, shown) {
  const items = shown.map((x) => String(x.place_name || '').trim()).filter(Boolean);
  if (!items.length) return null;
  return { '@context': 'https://schema.org', '@type': 'ItemList', name: name || 'A plan on Suna', url,
    itemListElement: items.map((n, i) => ({ '@type': 'ListItem', position: i + 1, name: n })) };
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
  let ld = null;   // W-314 OD-web-Q9-6: JSON-LD ItemList of the shown stops
  // The itinerary's own name, kept separate from the composed title so the
  // canonical prefix matches what the app generates rather than "Name — by @x".
  let rawName = '';
  // The server-rendered body, or null for the generic page.
  let body = null;
  let preload = '';   // W-314 W-Q9-3: the cover preload
  // True when the body carries signed moment URLs, which expire in an hour.
  let signed = false;
  // W-179: no public itinerary behind this link (missing, private or a
  // draft): the generic page stays (the app opens a private one for its
  // owner), but it's never one to index. A database failure isn't "none".
  let none = !slug;

  if (slug) {
    try {
      const data = await loadItinerary(slug, coverURL);
      const it = data ? data.it : null;
      none = !it;
      if (it) {
        // "Bangkok for you — a Suna itinerary by @booak55"
        rawName = it.name || '';
        const parts = [it.name].filter(Boolean);
        // A Suna or partner itinerary never names its owner account (W-31):
        // "by Suna", "by WORQ"; only a creator's own is "by @username".
        if (isBySuna(it)) parts.push('by Suna');
        else if (it.partner_name) parts.push(`by ${it.partner_name}`);
        else if (it.creator_username) parts.push(`by @${it.creator_username}`);
        title = parts.join(', ') || title;   // W-309 W3b FIX 4: 'A quieter day in Ipoh, by Suna' (no dash)

        // The creator's own opening line is the best description available;
        // fall back to something true rather than something promotional.
        const story = (it.intro_story || '').trim().replace(/\s+/g, ' ');
        // W-314 OD-web-Q9-C3: the preview ends with what to do: 'Copy this plan to Suna.' (the story is cut to fit 160).
        const END = ' Copy this plan to Suna.';
        // W-314 OD-web-Q9-6: 120-155 characters, from the first two stops when the story doesn't fit; no '…'.
        description = planDescription(story, it.resolved_city_name, data.shown || [], data.summary) + END;
        ld = planLd(canonicalItineraryURL(origin, slug, rawName), it.name, data.shown || []);

        // The itinerary's own cover when it resolves, else the first stop's
        // place photo: the same picture the page opens on.
        const cover = coverFor(data, await imageResolves(data.cover));
        // W-314 OD-web-Q9-6: every plan has a preview image; Suna's 1200x630 card when it has no photo.
        image = cover || 'https://unaryx.com/assets/og.png';
        // W-309 W3b BETTER 4: the desktop QR points at this plan's canonical address (its /i/ segment).
        data.slug = String(canonicalItineraryURL(origin, slug, rawName)).split('/i/')[1] || '';
        const variants = await coverVariants(cover, imageResolves);
        preload = coverPreload(cover, variants);
        body = previewBody(data, cover, variants, mascot());
        signed = data.signedMoments;
      }
    } catch {
      // Fall through with the generic values — a preview must never 500.
    }
  }

  // W-314 OD-web-Q3-3: a link with its code cut off ('/i/a-quieter-day-in-ipoh') finds the one public plan with
  // that readable name and 301s to it; when none (or several) match, the 404 says the plan isn't on Suna.
  const seg = segmentAfter(new URL(req.url || '/', origin).pathname, 'i') || '';
  let nameOnly = false;
  let nfPlans = '';
  if (none && slug && !seg.includes('--') && /^[a-z0-9]+(?:-[a-z0-9]+){2,}$/.test(seg)) {
    nameOnly = true;
    try {
      const rows = await rest(`public_itineraries?name=ilike.${encodeURIComponent(seg.replace(/-/g, '*') + '*')}&select=share_slug,name&limit=3`);
      const hits = (Array.isArray(rows) ? rows : []).filter((r) => r.share_slug && readablePrefix(r.name) === seg);
      if (hits.length === 1) {
        // The visitor's query only: Vercel's rewrite adds `path` (the /i/:path* capture), which is ours.
        const sp = new URL(req.url || '/', origin).searchParams; sp.delete('path');
        const q = sp.toString() ? `?${sp}` : '';
        res.status(301).setHeader('Location', canonicalItineraryURL(origin, hits[0].share_slug, hits[0].name) + q)
          .setHeader('Cache-Control', 'public, max-age=300, s-maxage=600').end();
        return;
      }
    } catch { /* fall through to the 404 */ }
    title = "This plan isn't on Suna";
    // W-314 OD-web-Q3-3: three plans people can open instead (the newest public ones).
    try {
      const recent = await rest('public_itineraries?select=share_slug,name,resolved_city_name&share_slug=not.is.null&order=published_at.desc&limit=3');
      nfPlans = recent.filter((r) => r.share_slug && r.name).map((r) =>
        `<li><a href="${escapeHtml(canonicalItineraryURL(origin, r.share_slug, r.name))}"><b>${escapeHtml(r.name)}</b>${r.resolved_city_name ? `<span>${escapeHtml(r.resolved_city_name)}</span>` : ''}</a></li>`).join('');
    } catch { nfPlans = ''; }
    description = 'The link may be cut short. Open Suna to see plans people have walked.';
  }
  const canonical = canonicalItineraryURL(origin, slug, title === 'An itinerary on Suna' || nameOnly ? '' : rawName);
  // W-227: any other spelling of this address goes to the canonical one, so
  // one itinerary is one URL and a mangled link still lands on the real page.
  // Before the open is recorded: the request the redirect leads to records it.
  const elsewhere = redirectFor(req.url, origin, canonical, !none && !!body);
  if (elsewhere) {
    res.status(301)
      .setHeader('Location', elsewhere)
      .setHeader('Cache-Control', 'public, max-age=300, s-maxage=600')
      .end();
    return;
  }
  // W-227: og:url is the canonical address too (it used to be the address as
  // requested, so a bare /i/<slug> advertised a second URL for one page).
  const shareURL = canonical;
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
    none ? '<meta name="robots" content="noindex">' : '',
    ld ? `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>` : '',
  ].filter(Boolean).join('\n  ');

  // Replace the static head block rather than appending: a duplicate og:title
  // is resolved differently by each scraper, so leaving both is a coin flip.
  const rendered = html
    .replace('<h1 id="title">An itinerary on Suna</h1>', nameOnly ? '<h1 id="title">This plan isn\'t on Suna</h1>' + (nfPlans ? `<style>.nf-plans{list-style:none;margin:16px 0;padding:0;display:grid;gap:8px;text-align:left}.nf-plans a{display:flex;flex-direction:column;justify-content:center;min-height:56px;padding:10px 16px;border-radius:14px;background:rgba(255,255,255,.08);color:#fff;text-decoration:none}.nf-plans b{font-size:16px}.nf-plans span{font-size:13px;color:rgba(255,255,255,.7)}</style><p class="nf-try">Try one of these:</p><ul class="nf-plans">${nfPlans}</ul>` : '') : '<h1 id="title">An itinerary on Suna</h1>')
    .replace(/<title>[\s\S]*?<\/title>/i, '')
    .replace(/<meta\s+(property|name)="(og:[^"]*|twitter:[^"]*|description)"[^>]*>\s*/gi, '')
    .replace(/<link\s+rel="canonical"[^>]*>\s*/gi, '')
    .replace('</head>', `  ${preload ? `${preload}\n  ` : ''}${tags}\n</head>`)
    // Before first paint, so the Apple Maps button (W-47) never flashes in or out.
    .replace('</head>', () => (/maps-apple/.test(body || '')
      ? `  ${MAPS_HEAD}\n  <style>${MAPS_CSS}</style>\n</head>` : '</head>'))
    .replace(/<body>[\s\S]*?<!--\/BODY-->/, (generic) => (body
      ? `<body class="pv-body" data-preview="1">\n${body}`
      : generic))
    .replace('<!--MASCOT-->', mascot());

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
    via: openVia(params),
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
    // W-314 W-Q3-7: no public plan behind the link is a 404 with the same friendly page (the app still opens
    // a private plan for its owner through the universal link; the status only tells crawlers there's no page).
    .status(none ? 404 : 200)
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

// The itinerary preview, server-rendered (W-15).
//
// Brian, 12 Oct, opening a shared link on a phone without Suna: the page
// showed a title and a download button, nothing of the itinerary itself. A
// shared itinerary is how most new people arrive, so the page now shows it:
// the cover, whose it is, and every stop with its photo, time, area and note.
// It is all in the HTML, so it is on screen at first paint and readable with
// JavaScript off.
//
// THE TEASER (W-15c, Brian 12 Oct): only the first SHOWN_STOPS stops are
// shown. The rest are one locked card with their count and times, and their
// names, notes and images never leave this file: the loader keeps only what
// the locked card needs, so nothing later can render them by accident.
//
// WHAT IT READS:
//   public_itineraries, public_itinerary_stops   the anon-safe views. The
//     stops view only returns public, published creator itineraries, so a
//     private, draft or missing slug finds nothing and the caller serves the
//     generic page, never revealing that a private itinerary exists.
//   creator-media (service role, server only)    a signed URL for a shown
//     stop's moment, and only for a path the view just returned.
//
// ONE IMAGE PER SHOWN STOP, the first that exists: the creator's moment, the
// place's own photo, the stock image the app deals that place (_stock.js).
// Never a photographer credit, never more than one.

import { stockFor, isGooglePhoto } from './_stock.js';
import { mapsLinks } from './_maps.js';

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';
const HEADERS = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` };

export const SHOWN_STOPS = 3;

/** The App Store link before i.html's script picks the `via` token (W-30):
 *  never bare, so even a no-JS tap is attributed to /i/. */
const STORE_WEB_I = 'https://apps.apple.com/au/app/suna-things-to-do-near-you/id6759053765?pt=128539200&amp;ct=web-i&amp;mt=8';

/**
 * "By Suna" (W-31, Brian 13 Oct): Suna's own itineraries for a city and its
 * sights. Ops sets partner_slug 'suna' with set_itinerary_partner. The owner
 * is a real account under the hood and is NEVER shown: not in the byline, the
 * title, og: tags or anywhere else this page renders.
 */
export function isBySuna(it) {
  return !!it && it.partner_slug === 'suna';
}
// Signed moment URLs last an hour; the page's cache stays well inside that.
const SIGN_SECONDS = 3600;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

async function rest(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: HEADERS, signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`rest ${r.status}`);
  return r.json();
}

/**
 * The pre-sized copy of one of our Storage photos, or null.
 * `/object/public/<bucket>/<dir>/<file>` -> `.../<dir>/_w/<width>/<file>`, the
 * layout image-variants-sweep writes. Anything else (an outside URL, an SVG)
 * has no variant and is used as it is.
 */
export function sized(url, width) {
  if (!url || !/\/storage\/v1\/object\/public\//.test(url)) return null;
  const clean = url.split('?')[0];
  if (/\.svg$/i.test(clean)) return null;
  const i = clean.lastIndexOf('/');
  return `${clean.slice(0, i)}/_w/${width}${clean.slice(i)}`;
}

/** An <img> that asks for the variant and falls back to the original. */
function photo(url, width, cls, alt, eager) {
  const small = sized(url, width) || url;
  const load = eager ? 'fetchpriority="high"' : 'loading="lazy"';
  return `<img class="${cls}" src="${escapeHtml(small)}" data-full="${escapeHtml(url)}"`
    + ` onerror="if(this.src!==this.dataset.full){this.src=this.dataset.full}"`
    + ` alt="${escapeHtml(alt)}" decoding="async" ${load}>`;
}

/**
 * Signed URLs for shown stops' moments in the private `creator-media` bucket.
 *
 * With the service role, on the server, and ONLY for paths the public view
 * just returned (I-11: anon gets 404 there, because the storage policy reads
 * tables anon cannot). Nothing from the request is ever signed. Without the
 * key the moments are skipped and the stop falls through to the place photo.
 */
async function signMoments(paths) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || !paths.length) return new Map();
  const r = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/creator-media`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expiresIn: SIGN_SECONDS, paths }),
    signal: AbortSignal.timeout(3000),
  });
  if (!r.ok) return new Map();
  const out = new Map();
  for (const row of await r.json()) {
    if (row && row.signedURL && !row.error) out.set(row.path, `${SUPABASE_URL}/storage/v1${row.signedURL}`);
  }
  return out;
}

const publicObject = (bucket, path) => `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${
  String(path).split('/').map(encodeURIComponent).join('/')}`;

/** "Day 2 · 9:00 AM" -> { day: 2, time: "9:00 AM" }. */
export function splitTime(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^Day\s+(\d+)\s*·\s*(.*)$/i);
  return m ? { day: Number(m[1]), time: m[2].trim() } : { day: null, time: text };
}

/** "~1h 30m" -> "~1 hr 30 min", "~45m" -> "~45 min". Anything else as stored. */
export function readableDuration(raw) {
  const text = String(raw || '').trim();
  const m = text.match(/^(~?)\s*(?:(\d+)\s*h)?\s*(?:(\d+)\s*m)?$/i);
  if (!text || !m || (!m[2] && !m[3])) return text;
  return m[1] + [m[2] && `${m[2]} hr`, m[3] && `${m[3]} min`].filter(Boolean).join(' ');
}

/** Everything the page needs, or null for a slug that must look generic. */
export async function loadItinerary(slug, coverURL) {
  if (!slug) return null;
  const rows = await rest(`public_itineraries?share_slug=eq.${encodeURIComponent(slug)}`
    + '&select=id,name,intro_story,resolved_city_name,recommended_timing,creator_username,'
    + 'creator_avatar_url,partner_slug,partner_name,cover_media_path,is_creator&limit=1');
  const it = Array.isArray(rows) ? rows[0] : null;
  if (!it) return null;
  const all = await rest(`public_itinerary_stops?plan_id=eq.${encodeURIComponent(it.id)}`
    + '&select=order_index,place_name,city_name,suggested_time,duration_label,creator_note,'
    + 'latitude,longitude,landmark_id,category,country_code,place_image_url,moment_path,moment_bucket,'
    + 'event_id,event_state,event_ends_at'
    + '&order=order_index.asc');

  // The whole itinerary is counted; only the first stops are kept.
  const summary = summaryLine(it, all);
  const shown = all.slice(0, SHOWN_STOPS);
  const locked = all.slice(SHOWN_STOPS).map((s) => splitTime(s.suggested_time).time).filter(Boolean);
  const lockedCount = Math.max(all.length - SHOWN_STOPS, 0);
  const multiDay = new Set(all.map((s) => splitTime(s.suggested_time).day).filter((d) => d !== null)).size > 1;

  let signed = new Map();
  try {
    signed = await signMoments(shown
      .filter((s) => s.moment_path && s.moment_bucket === 'creator-media')
      .map((s) => s.moment_path));
  } catch { /* a moment is optional; the stop falls through to the next image */ }

  // One stock image at most once per page (I-112, W-53).
  const images = new Map();
  const taken = new Set();
  for (const s of shown) images.set(s, imageFor(s, signed, taken));
  return {
    it, shown, images, summary, multiDay, lockedCount, lockedTimes: locked,
    signedMoments: [...images.values()].some((im) => im && im.kind === 'moment' && im.signed),
    cover: coverURL(it.cover_media_path),
  };
}

/** One image for a shown stop: moment, else place photo, else stock. Never Google (W-53). */
function imageFor(s, signed, taken) {
  if (s.moment_path) {
    if (s.moment_bucket === 'creator-media' && signed.get(s.moment_path)) {
      return { kind: 'moment', url: signed.get(s.moment_path), signed: true };
    }
    if (s.moment_bucket === 'community-post-photos') {
      return { kind: 'moment', url: publicObject('community-post-photos', s.moment_path) };
    }
  }
  if (s.place_image_url && !isGooglePhoto(s.place_image_url)) return { kind: 'place', url: s.place_image_url };
  const stock = stockFor({
    landmarkId: s.landmark_id, category: s.category, countryCode: s.country_code,
    latitude: s.latitude, longitude: s.longitude,
  }, taken);
  return stock ? { kind: 'stock', url: stock.url, tint: stock.tint, tintOpacity: stock.tintOpacity } : null;
}

/**
 * The cover: the itinerary's own, else the first shown stop's place photo.
 * Never a signed moment (it is also og:image, which crawlers keep for days,
 * long after an hour's signature) and never a stock image.
 */
export function coverFor(data, coverResolves) {
  if (coverResolves) return data.cover;
  const first = data.shown.find((s) => s.place_image_url && !isGooglePhoto(s.place_image_url));
  return first ? first.place_image_url : null;
}

/** "Kuala Lumpur · 1 day · 4 stops", from what is actually stored. */
export function summaryLine(it, stops) {
  const days = new Set(stops.map((s) => splitTime(s.suggested_time).day).filter((d) => d !== null));
  const parts = [];
  if (it.resolved_city_name) parts.push(it.resolved_city_name);
  if (stops.length) parts.push(`${Math.max(days.size, 1)} day${days.size > 1 ? 's' : ''}`);
  parts.push(`${stops.length} stop${stops.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function stopImage(image, name) {
  if (!image) return '';
  if (image.kind === 'place') return `<div class="stop-pic">${photo(image.url, 640, 'stop-img', name, false)}</div>`;
  if (image.kind === 'stock') {
    // The app's designed backdrop: the dealt image (its _w/640 copy; every
    // place-stock image has one) under its dealt tint.
    return `<div class="stop-pic stock">${photo(image.url, 640, 'stop-img', name, false)}`
      + `<span class="stock-tint" style="background:${image.tint};opacity:${image.tintOpacity}"></span></div>`;
  }
  const img = `<img class="stop-img" src="${escapeHtml(image.url)}" alt="${escapeHtml(name)}" decoding="async" loading="lazy">`;
  return `<div class="stop-pic">${img}</div>`;
}

/**
 * An event stop that is over (W-28, Brian 13 Oct; the app half is I-63):
 * 'cancelled', 'ended' or null. The view decides with the app's rule
 * (I-86); `event_ends_at` is checked here too, because this page is cached
 * and an event can end while a render is still being served.
 */
export function eventState(s, now = Date.now()) {
  if (!s || !s.event_id) return null;
  if (s.event_state === 'cancelled' || s.event_state === 'ended') return s.event_state;
  const ends = Date.parse(s.event_ends_at || '');
  return Number.isFinite(ends) && ends <= now ? 'ended' : null;
}

function stopBlock(s, n, image) {
  const { time } = splitTime(s.suggested_time);
  // Ops's E2: a grey pill first, the photo desaturated, the rest at 50%.
  // A viewer can't delete a stop on the web, so E2's Delete has no place here.
  const state = eventState(s);
  const pill = state ? `<p class="over-pill">${state === 'cancelled' ? 'Cancelled' : 'Ended'}</p>` : '';
  const meta = [String(n).padStart(2, '0'), time, readableDuration(s.duration_label)].filter(Boolean).join(' · ');
  const note = String(s.creator_note || '').trim();
  const area = String(s.city_name || '').trim();
  const name = s.place_name || 'Stop';
  // Take me there (W-47), for a stop with a real pin that isn't over.
  const maps = state ? '' : mapsLinks(s.latitude, s.longitude, 'map-btn');
  return `<li class="stop${state ? ' stop-over' : ''}">
      <article class="card">
        ${stopImage(image, name)}
        <div class="stop-text">
          ${pill}<p class="stop-meta">${escapeHtml(meta)}</p>
          <h3 class="stop-name">${escapeHtml(name)}</h3>
          ${area ? `<p class="stop-area">${escapeHtml(area)}</p>` : ''}
          ${note ? `<p class="stop-note">${escapeHtml(note)}</p>` : ''}
          ${maps ? `<div class="stop-maps">${maps}</div>` : ''}
        </div>
      </article>
    </li>`;
}

/** Stops 4 onward: how many and when, nothing else. */
function lockedBlock(count, times) {
  if (!count) return '';
  const chips = times.map((t) => `<span class="chip">${escapeHtml(t)}</span>`).join('');
  return `<li class="stop stop-locked">
      <article class="card locked">
        <p class="locked-head"><img src="/icons/lock.svg" width="16" height="16" alt="">+${count} more stop${count === 1 ? '' : 's'}</p>
        ${chips ? `<div class="chips">${chips}</div>` : ''}
        <p class="locked-sub">See the full route in Suna</p>
        <a class="cta locked-cta" data-open-suna href="${STORE_WEB_I}">Download Suna</a>
      </article>
    </li>`;
}

/**
 * The cover's <img>. It is the page's largest paint, so it never guesses: the
 * caller has already checked which sized copies exist (a cover uploaded since
 * the nightly sweep has none, and a 400 before the fallback cost the KL test
 * page seconds). Phones get 640, wide screens 1280.
 */
function coverImg(cover, variants) {
  const alt = '';
  if (!variants || !variants[640]) {
    return `<img class="cover-img" src="${escapeHtml(cover)}" alt="${alt}" decoding="async" fetchpriority="high">`;
  }
  const set = [`${variants[640]} 640w`, variants[1280] && `${variants[1280]} 1280w`].filter(Boolean).join(', ');
  return `<img class="cover-img" src="${escapeHtml(variants[640])}" srcset="${escapeHtml(set)}"`
    + ` sizes="(min-width: 700px) 640px, 100vw" data-full="${escapeHtml(cover)}"`
    + ` onerror="if(this.src!==this.dataset.full){this.srcset='';this.src=this.dataset.full}"`
    + ` alt="${alt}" decoding="async" fetchpriority="high">`;
}

/** Which sized copies of the cover exist, checked once per render. */
export async function coverVariants(cover, resolves) {
  if (!cover) return null;
  const [a, b] = [sized(cover, 640), sized(cover, 1280)];
  if (!a) return null;
  const [okA, okB] = await Promise.all([resolves(a), resolves(b)]);
  return { 640: okA ? a : null, 1280: okB ? b : null };
}

/** The body of the preview page: Figma B1, "The shared itinerary". */
export function previewBody(data, cover, variants, mascot) {
  const { it, shown, images, summary, multiDay, lockedCount, lockedTimes } = data;
  const title = it.name || 'An itinerary on Suna';

  // On the web, Follow does what the bar's button does: opens Suna, or the
  // App Store. The client points both at the same place.
  let byline = '';
  if (isBySuna(it)) {
    // Suna's mark as the avatar, the app's orange "Suna's pick" pill in place
    // of the Partner tag, and no Follow: there is no account to follow.
    byline = '<div class="by"><span class="by-avatar by-mark" aria-hidden="true">'
      + '<img src="/icons/suna-mark.svg" width="16" height="24" alt=""></span>'
      + '<div class="by-text"><p class="by-name">By Suna<span class="pick">Suna\'s pick</span></p></div></div>';
  } else if (it.partner_name) {
    // A partner's name replaces the creator's: no avatar, no Follow.
    byline = `<div class="by"><div class="by-text"><p class="by-name">By ${escapeHtml(it.partner_name)}`
      + '<span class="tag">Partner</span></p></div></div>';
  } else if (it.creator_username) {
    const initial = escapeHtml(it.creator_username.slice(0, 1).toUpperCase());
    const avatar = it.creator_avatar_url
      ? `<img class="by-avatar" src="${escapeHtml(it.creator_avatar_url)}" alt="" width="40" height="40" decoding="async" onerror="this.style.visibility='hidden'">`
      : `<span class="by-avatar by-initial" aria-hidden="true">${initial}</span>`;
    // W-27: the purple Creator pill for a paid creator (I-60). The view
    // already reads false for partner rows and banned or shadowbanned
    // profiles, and a partner's byline above never reaches this branch.
    const creator = it.is_creator === true ? '<span class="pick creator">Creator</span>' : '';
    byline = `<div class="by">${avatar}<div class="by-text"><p class="by-name">@${escapeHtml(it.creator_username)}${creator}</p>`
      + '<p class="by-sub">Their itinerary</p></div>'
      + `<a class="follow" data-open-suna href="${STORE_WEB_I}" aria-label="Follow @${escapeHtml(it.creator_username)} in Suna">Follow</a></div>`;
  }
  const intro = String(it.intro_story || '').trim();

  // Day headings only when the itinerary really spans more than one day.
  let lastDay = null;
  const items = shown.map((s, i) => {
    const { day } = splitTime(s.suggested_time);
    let head = '';
    if (multiDay && day !== null && day !== lastDay) {
      head = `<li class="day"><h3 class="day-label">Day ${day + 1}</h3></li>`;
      lastDay = day;
    }
    return head + stopBlock(s, i + 1, images.get(s));
  }).join('\n    ') + lockedBlock(lockedCount, lockedTimes);

  return `<main class="pv">
  <header class="cover${cover ? '' : ' cover-plain'}">
    ${cover ? coverImg(cover, variants) : `<div class="cover-mascot">${mascot || ''}</div>`}
    <div class="fade-top"></div>
    <div class="fade-bottom"></div>
    <button class="round-btn" id="share" type="button" aria-label="Share this itinerary"><img src="/icons/share.svg" width="16" height="16" alt=""></button>
    <div class="cover-text">
      <h1 id="title">${escapeHtml(title)}</h1>
      <p class="cover-sub">${escapeHtml(summary)}</p>
    </div>
  </header>
  ${byline || intro ? `<section class="about">
    ${byline}
    ${intro ? `<p class="intro">${escapeHtml(intro)}</p>` : ''}
  </section>` : ''}
  ${shown.length ? `<h2 class="route-head">The route</h2>
  <ol class="route">
    ${items}
  </ol>` : ''}
</main>
<div class="bar">
  <a class="cta" id="cta" href="${STORE_WEB_I}"><img src="/icons/copy.svg" width="17" height="17" alt="">Copy itinerary</a>
  <p class="bar-sub">Pick a day, and Suna takes you through it.</p>
</div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
}

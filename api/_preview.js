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
// Never more than one.
//
// W-183 (Brian via Ops OPS-106, 3 Nov: "don't use stock images for
// itineraries", "only … the itineraries we create"): on SUNA'S OWN plans
// (partner 'suna', or owned by @sunatravels) a stop shows the place's real
// photo, else its moment, else no picture (a plain card); never a stock image.
// Other people's plans keep the order above. Under a place's real photo:
// "Photo: <photographer> · <licence>" when the landmark records a real
// credit ('Suna' in photographer_name marks a row the bootstrap made, not a
// photographer, so it is never shown).

import { stockFor, isGooglePhoto } from './_stock.js';
import { hasPin, googleMapsURL } from './_maps.js';

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';
const HEADERS = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` };

export const SHOWN_STOPS = 3;

/** The App Store link before i.html's script picks the `via` token (W-30):
 *  never bare, so even a no-JS tap is attributed to /i/. */
const STORE_WEB_I = 'https://apps.apple.com/app/id6759053765?pt=128539200&amp;ct=web-i&amp;mt=8';

/**
 * "By Suna" (W-31, Brian 13 Oct): Suna's own itineraries for a city and its
 * sights. Ops sets partner_slug 'suna' with set_itinerary_partner. The owner
 * is a real account under the hood and is NEVER shown: not in the byline, the
 * title, og: tags or anywhere else this page renders.
 */
export function isBySuna(it) {
  return !!it && it.partner_slug === 'suna';
}

/** W-183: Suna's own plans, "By Suna" or owned by @sunatravels: no stock images. */
export function isSunaOwn(it) {
  return isBySuna(it) || (!!it && String(it.creator_username || '').toLowerCase() === 'sunatravels');
}

/** A URL in the place-stock bucket: the app's dealt stock image, never a real photo of the place. */
export function isStockPhoto(url) {
  return /\/storage\/v1\/object\/(public|sign)\/place-stock\//.test(String(url || ''));
}

/** A real photo of the place: ours or an outside one, never Google's (W-53), never a stock image. */
function realPlacePhoto(url) {
  return !!url && !isGooglePhoto(url) && !isStockPhoto(url);
}

// W-183: the licence each recorded cover source carries, shown after the name.
// Commons and community photos have no recorded licence (see creditFor).
const LICENCE = { pexels: 'Pexels License', unsplash: 'Unsplash License' };

/**
 * "Photo: <name> · <licence>" for a landmark's cover, or null. Only a real
 * credit: a name that isn't the bootstrap's 'Suna' marker, on a cover that
 * isn't Google's. A licence only when the source records one.
 */
export function creditFor(landmark) {
  if (!landmark) return null;
  const name = String(landmark.photographer_name || '').trim();
  if (!name || name.toLowerCase() === 'suna' || landmark.cover_source === 'google_places') return null;
  const licence = LICENCE[landmark.cover_source] || '';
  return `Photo: ${name}${licence ? ` · ${licence}` : ''}`;
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

/**
 * W-197: the stop's day, 1-based. The published snapshot's `day` (1, 2, …;
 * public_itinerary_stops.day from 20261105120000) when the view has it, else
 * the "Day N · " prefix in suggested_time (0-based, so N + 1), else null.
 * "Da Nang & Hoi An in 4 days" said "1 day": 93 of 122 stops have no prefix.
 */
export function stopDay(s) {
  const d = s && s.day;
  if (Number.isInteger(d) && d > 0) return d;
  const p = splitTime(s && s.suggested_time).day;
  return p === null ? null : p + 1;
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
  const stopsQuery = (extra) => rest(`public_itinerary_stops?plan_id=eq.${encodeURIComponent(it.id)}`
    + '&select=order_index,place_name,city_name,suggested_time,duration_label,creator_note,'
    + 'latitude,longitude,landmark_id,category,country_code,place_image_url,moment_path,moment_bucket,'
    + 'event_id,event_state,event_ends_at' + extra
    + '&order=order_index.asc');
  // W-197: `day` comes with 20261105120000. Until that's applied PostgREST
  // answers 400 for the unknown column, and the page asks again without it.
  let all;
  try { all = await stopsQuery(',day'); } catch (e) {
    if (!/rest 400/.test(String(e && e.message))) throw e;
    all = await stopsQuery('');
  }

  // The whole itinerary is counted; only the first stops are kept.
  const summary = summaryLine(it, all);
  const shown = all.slice(0, SHOWN_STOPS);
  const locked = all.slice(SHOWN_STOPS).map((s) => splitTime(s.suggested_time).time).filter(Boolean);
  const lockedCount = Math.max(all.length - SHOWN_STOPS, 0);
  const multiDay = new Set(all.map(stopDay).filter((d) => d !== null)).size > 1;
  // W-197: stops per day, counts only (the teaser never sends stops 4+).
  const dayCounts = [];
  for (const s of all) { const d = stopDay(s); if (d === null) continue; const c = dayCounts.find((x) => x.day === d); if (c) c.n++; else dayCounts.push({ day: d, n: 1 }); }
  dayCounts.sort((a, b) => a.day - b.day);

  let signed = new Map();
  try {
    signed = await signMoments(shown
      .filter((s) => s.moment_path && s.moment_bucket === 'creator-media')
      .map((s) => s.moment_path));
  } catch { /* a moment is optional; the stop falls through to the next image */ }

  // One stock image at most once per page (I-112, W-53).
  const sunaOwn = isSunaOwn(it);
  const images = new Map();
  const taken = new Set();
  for (const s of shown) images.set(s, imageFor(s, signed, taken, sunaOwn));

  // W-183: the credit under each shown place photo, from its landmark.
  const credits = new Map();
  const ids = [...new Set(shown.filter((s) => (images.get(s) || {}).kind === 'place' && s.landmark_id).map((s) => s.landmark_id))];
  if (ids.length) {
    try {
      const rows = await rest(`landmarks?id=in.(${ids.map(encodeURIComponent).join(',')})`
        + '&select=id,cover_image_url,photographer_name,cover_source');
      const byId = new Map((Array.isArray(rows) ? rows : []).map((r) => [r.id, r]));
      for (const s of shown) {
        const im = images.get(s), lm = byId.get(s.landmark_id);
        // Only when the photo shown IS the landmark's cover the credit belongs to.
        if (im && im.kind === 'place' && lm && lm.cover_image_url === s.place_image_url) {
          const c = creditFor(lm);
          if (c) credits.set(s, c);
        }
      }
    } catch { /* a credit is optional; the photo still shows */ }
  }
  return {
    credits,
    it, shown, images, summary, multiDay, lockedCount, lockedTimes: locked, dayCounts,
    signedMoments: [...images.values()].some((im) => im && im.kind === 'moment' && im.signed),
    cover: coverURL(it.cover_media_path),
  };
}

/**
 * One image for a shown stop: moment, else place photo, else stock. Never Google (W-53).
 * W-183: on Suna's own plans, the place's real photo, else the moment, else none.
 */
function imageFor(s, signed, taken, sunaOwn = false) {
  if (sunaOwn) {
    if (realPlacePhoto(s.place_image_url)) return { kind: 'place', url: s.place_image_url };
    return momentFor(s, signed);
  }
  const moment = momentFor(s, signed);
  if (moment) return moment;
  if (s.place_image_url && !isGooglePhoto(s.place_image_url)) return { kind: 'place', url: s.place_image_url };
  const stock = stockFor({
    landmarkId: s.landmark_id, category: s.category, countryCode: s.country_code,
    latitude: s.latitude, longitude: s.longitude,
  }, taken);
  return stock ? { kind: 'stock', url: stock.url, tint: stock.tint, tintOpacity: stock.tintOpacity } : null;
}

/** The stop's own moment, when it has a usable one. */
function momentFor(s, signed) {
  if (s.moment_path) {
    if (s.moment_bucket === 'creator-media' && signed.get(s.moment_path)) {
      return { kind: 'moment', url: signed.get(s.moment_path), signed: true };
    }
    if (s.moment_bucket === 'community-post-photos') {
      return { kind: 'moment', url: publicObject('community-post-photos', s.moment_path) };
    }
  }
  return null;
}

/**
 * The cover: the itinerary's own, else the first shown stop's place photo.
 * Never a signed moment (it is also og:image, which crawlers keep for days,
 * long after an hour's signature) and never a stock image.
 */
export function coverFor(data, coverResolves) {
  if (coverResolves) return data.cover;
  const first = data.shown.find((s) => realPlacePhoto(s.place_image_url));
  return first ? first.place_image_url : null;
}

/** "Kuala Lumpur · 1 day · 4 stops", from what is actually stored. */
export function summaryLine(it, stops) {
  const days = new Set(stops.map(stopDay).filter((d) => d !== null));
  const parts = [];
  if (it.resolved_city_name) parts.push(it.resolved_city_name);
  if (stops.length) parts.push(`${Math.max(days.size, 1)} day${days.size > 1 ? 's' : ''}`);
  parts.push(`${stops.length} stop${stops.length === 1 ? '' : 's'}`);
  return parts.join(' · ');
}

function stopImage(image, name, credit) {
  if (!image) return '';
  if (image.kind === 'place') {
    return `<div class="stop-pic">${photo(image.url, 640, 'stop-img', name, false)}</div>`
      + (credit ? `<p class="photo-credit">${escapeHtml(credit)}</p>` : '');
  }
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

function stopBlock(s, n, image, credit) {
  const { time } = splitTime(s.suggested_time);
  // Ops's E2: a grey pill first, the photo desaturated, the rest at 50%.
  // A viewer can't delete a stop on the web, so E2's Delete has no place here.
  const state = eventState(s);
  const pill = state ? `<p class="over-pill">${state === 'cancelled' ? 'Cancelled' : 'Ended'}</p>` : '';
  const meta = [time, readableDuration(s.duration_label)].filter(Boolean).join(' · ');
  const note = String(s.creator_note || '').trim();
  const name = s.place_name || 'Stop';
  // W-197: one Directions link (Google Maps) for a stop with a pin that isn't over.
  const dir = !state && hasPin(s.latitude, s.longitude)
    ? `<a class="dir" href="${escapeHtml(googleMapsURL(s.latitude, s.longitude))}" target="_blank" rel="noopener">Directions ›</a>` : '';
  // A stop with no image gets a pixel tile, never a grey box (W-197).
  const pic = image ? stopImage(image, name, credit)
    : '<div class="stop-pic px-tile"><img src="/icons/px/pintemples.png" width="52" height="52" alt=""></div>';
  return `<li class="stop${state ? ' stop-over' : ''}">
      <span class="num" aria-hidden="true">${n}</span>
      <article class="card sc">
        ${pic}
        <div class="stop-text">
          ${pill}${meta ? `<p class="stop-meta">${escapeHtml(meta)}</p>` : ''}
          <h3 class="stop-name">${escapeHtml(name)}</h3>
          ${note ? `<p class="stop-note">${escapeHtml(note)}</p>` : ''}
          ${dir}
        </div>
      </article>
    </li>`;
}

/** The copy button: the page's script points it at the app (or the App Store). */
const COPY_ICON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>';
const copyButton = () => `<a class="cta copy" id="cta" href="${STORE_WEB_I}">${COPY_ICON} Copy this plan to Suna</a>`;
const PADLOCK = '<svg class="lk" viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><rect width="12" height="12" fill="#FFF9D5"/><path fill="#2B1E0E" d="M4 2h4v1H4zM3 3h1v2H3zM8 3h1v2H8zM2 5h8v6H2z"/><path fill="#F6CB94" d="M3 6h6v4H3z"/><path fill="#2B1E0E" d="M5 7h2v2H5z"/></svg>';

/**
 * Stops 4 onward (W-15c, W-197): ONE locked card. Blurred ghost rows drawn in
 * CSS (no stop data), the pixel padlock, "+N more stops in the app", which
 * days they're on (counts only), and Copy this plan to Suna inside it.
 */
function lockedBlock(count, dayCounts, shownDays) {
  if (!count) return '';
  let where = '';
  if (dayCounts.length > 1) {
    const lastShown = shownDays.length ? shownDays[shownDays.length - 1] : null;
    const sameDay = lastShown !== null ? (dayCounts.find((d) => d.day === lastShown) || { n: 0 }).n - shownDays.filter((d) => d === lastShown).length : 0;
    const later = dayCounts.filter((d) => lastShown === null || d.day > lastShown).map((d) => d.day);
    const parts = [];
    if (sameDay > 0) parts.push(`${sameDay} more on day ${lastShown}`);
    if (later.length === 1) parts.push(`day ${later[0]}`);
    else if (later.length > 1) parts.push(`days ${later[0]} to ${later[later.length - 1]}`);
    where = parts.length ? `${parts.join(', then ')}. ` : '';
    where = where.charAt(0).toUpperCase() + where.slice(1);
  }
  return `<li class="stop-locked">
      <div class="lock">
        <div class="ghost" aria-hidden="true"><div class="gr"><i></i><b></b></div><div class="gr"><i></i><b></b></div><div class="gr"><i></i><b></b></div></div>
        <div class="lockin">
          ${PADLOCK}
          <p class="lt">+${count} more stop${count === 1 ? '' : 's'} in the app</p>
          <p class="ls">${escapeHtml(where)}Copy the plan and Suna takes you through it, stop by stop.</p>
          ${copyButton()}
          <p class="ls small">Free on iPhone · Android in December</p>
        </div>
      </div>
    </li>`;
}

// W-197 (Ops OPS-135, design screen 2): the plan's look, over i.html's B1 styles.
const W197_CSS = `<style>
body.pv-body{padding:0 0 40px;background:#0f1110}
.pv{max-width:560px}
.cover{height:400px}
.fade-bottom{top:auto;bottom:0;height:280px;background:linear-gradient(180deg,rgba(15,17,16,0) 0%,rgba(15,17,16,.85) 60%,#0f1110 100%)}
.intro.clamp{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.more{background:none;border:0;padding:0;margin:4px 0 0;color:#f6cb94;font:700 14px var(--font);cursor:pointer}
.cover-text{bottom:18px}
.cover-text .kick{margin:0;font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#f6cb94}
.cover-text h1{font-size:32px;line-height:1.08;font-weight:800}
.cover-sub{font-size:16px;line-height:1.4;color:#d9d5cc}
.daychips{display:flex;flex-wrap:wrap;gap:8px;margin:18px 16px 0}
.daychips span{border:1px solid #2a2f2c;background:#181b19;border-radius:999px;padding:7px 12px;font-size:14px;font-weight:600}
.route-head{display:none}
.route{padding:0 16px 0 50px}
.route::before{left:28px;top:14px;bottom:30px;width:0;border-left:2px dashed #3a403c;background:none}
.stop{margin-bottom:14px}
.stop::before{display:none}
.num{position:absolute;left:-34px;top:0;width:26px;height:26px;border-radius:13px;background:#f6cb94;color:#1d1408;font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;z-index:1}
.sc{display:flex;border-radius:18px;background:#181b19;border-color:#2a2f2c}
.sc .stop-pic{width:96px;height:auto;min-height:112px;flex:none}
.sc .stop-pic::before,.sc .stop-pic::after{display:none}
.sc .stop-pic.px-tile{display:flex;align-items:center;justify-content:center;background:#202421}
.px-tile img{width:52px;height:52px;image-rendering:pixelated;border:2px solid #2B1E0E;border-radius:6px;box-shadow:3px 3px 0 #2B1E0E;background:#FFF9D5;padding:6px}
.sc .stop-text{padding:12px 14px;gap:4px;flex:1;min-width:0}
.sc .stop-name{font-size:16.5px;font-weight:800;line-height:1.2}
.sc .stop-note{border:0;padding:0;margin:2px 0 0;font-size:14px;line-height:1.4;color:#cfcbc2}
.sc .dir{font-size:13.5px;color:#f6cb94;font-weight:700;margin-top:6px;text-decoration:none}
.photo-credit{display:none}
.day-label{margin:22px 0 4px -34px;font-size:13px;letter-spacing:1.4px;font-weight:800;color:#f6cb94}
.stop-locked{list-style:none;margin:4px 0 0 -34px}
.lock{position:relative;border-radius:20px;overflow:hidden;border:1px solid #2a2f2c;background:#181b19;min-height:300px}
.ghost{padding:14px;filter:blur(5px);opacity:.55}
.gr{display:flex;gap:12px;align-items:center;margin-bottom:12px}
.gr i{width:70px;height:70px;border-radius:12px;background:#3a403c;flex:none}
.gr b{height:14px;border-radius:7px;background:#3a403c;flex:1}
.lockin{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:18px;background:linear-gradient(180deg,rgba(24,27,25,.35),rgba(24,27,25,.92) 45%)}
.lk{width:52px;height:52px;image-rendering:pixelated;border:2px solid #2B1E0E;border-radius:6px;box-shadow:3px 3px 0 #2B1E0E}
.lt{font-size:20px;font-weight:800;margin:12px 0 0}
.ls{font-size:14px;color:#a3a8a4;margin:6px 0 0;line-height:1.4}
.ls.small{font-size:12.5px;margin-top:8px}
a.cta.copy{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;margin-top:14px;min-height:52px;border-radius:26px;background:#f6cb94;color:#1d1408;font-weight:700;font-size:16px;padding:0 20px}
.after{padding:4px 16px 0}
.bar{display:none}
</style>`;

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
  const { it, shown, images, summary, multiDay, lockedCount } = data;
  const dayCounts = data.dayCounts || [];
  const credits = data.credits || new Map();
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
    const day = stopDay(s);
    let head = '';
    if (multiDay && day !== null && day !== lastDay) {
      head = `<li class="day"><h3 class="day-label">Day ${day}</h3></li>`;
      lastDay = day;
    }
    return head + stopBlock(s, i + 1, images.get(s), credits.get(s));
  }).join('\n    ') + lockedBlock(lockedCount, dayCounts, shown.map(stopDay).filter((d) => d !== null));
  const kicker = ['Plan', it.resolved_city_name].filter(Boolean).join(' · ');

  return `${W197_CSS}<main class="pv">
  <header class="cover${cover ? '' : ' cover-plain'}">
    ${cover ? coverImg(cover, variants) : `<div class="cover-mascot">${mascot || ''}</div>`}
    <div class="fade-top"></div>
    <div class="fade-bottom"></div>
    <button class="round-btn" id="share" type="button" aria-label="Share this itinerary"><img src="/icons/share.svg" width="16" height="16" alt=""></button>
    <div class="cover-text">
      <p class="kick">${escapeHtml(kicker)}</p>
      <h1 id="title">${escapeHtml(title)}</h1>
      <p class="cover-sub">${escapeHtml(summary)}</p>
    </div>
  </header>
  ${byline || intro ? `<section class="about">
    ${byline}
    ${intro ? `<p class="intro${intro.length > 220 ? ' clamp' : ''}" id="intro-text">${escapeHtml(intro)}</p>${intro.length > 220 ? '<button class="more" type="button" onclick="document.getElementById(\'intro-text\').classList.remove(\'clamp\');this.remove()">More</button>' : ''}` : ''}
  </section>` : ''}
  ${multiDay && dayCounts.length > 1 ? `<div class="daychips">${dayCounts.map((d) => `<span>Day ${d.day} · ${d.n}</span>`).join('')}</div>` : ''}
  ${shown.length ? `<h2 class="route-head">The route</h2>
  <ol class="route">
    ${items}
  </ol>` : ''}
  ${lockedCount ? '' : `<div class="after">${copyButton()}</div>`}
</main>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
}

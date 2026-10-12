// The itinerary preview, server-rendered (W-15).
//
// Brian, 12 Oct, opening a shared link on a phone without Suna: the page
// showed a title and a download button, nothing of the itinerary itself. A
// shared itinerary is how most new people arrive, so the page now shows it:
// the cover, whose it is, and every stop with its photo, time, area and note.
// It is all in the HTML, so it is on screen at first paint and readable with
// JavaScript off.
//
// WHAT IT READS, all through the publishable key and all already public:
//   public_itineraries, public_itinerary_stops   the two anon-safe views
//   landmarks                                    the place's own photo, the
//                                                same read /place makes
// A private, draft or missing slug finds nothing in the views, and the caller
// serves the generic page unchanged, so the page never reveals that a private
// itinerary exists at an address.
//
// PHOTOS ARE THE PLACE'S OWN (Brian, 12 Oct). Never the creator's photos or
// moments: those are for people signed in to Suna. The view has no
// landmark_id, so a stop is matched to its landmark by exact name and the
// nearest coordinates, within MATCH_METRES. A stop with no stored place photo
// shows no photo rather than a stand-in.

const SUPABASE_URL = 'https://voogrbonwmvfwtgzzrxc.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_Fbarg84I-sAT--HQkoZ9lw_y-YDKp7R';
const HEADERS = { apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}` };

const MATCH_METRES = 300;

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

const metres = (a, b) => {
  const dLat = (a.latitude - b.latitude) * 111000;
  const dLng = (a.longitude - b.longitude) * 111000 * Math.cos((a.latitude * Math.PI) / 180);
  return Math.sqrt(dLat * dLat + dLng * dLng);
};

/** Each stop's own place photo, matched by exact name and nearest coordinates. */
async function placePhotos(stops) {
  const names = [...new Set(stops.map((s) => s.place_name).filter(Boolean))];
  if (!names.length) return new Map();
  const list = names.map((n) => `"${n.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`).join(',');
  const rows = await rest(`landmarks?name=in.(${encodeURIComponent(list)})`
    + '&cover_image_url=not.is.null&select=name,latitude,longitude,cover_image_url&limit=200');
  const out = new Map();
  for (const s of stops) {
    if (!Number.isFinite(s.latitude) || !Number.isFinite(s.longitude)) continue;
    let best = null;
    for (const l of rows) {
      if (l.name !== s.place_name || !Number.isFinite(l.latitude)) continue;
      const d = metres(s, l);
      if (d <= MATCH_METRES && (!best || d < best.d)) best = { d, url: l.cover_image_url };
    }
    if (best) out.set(s, best.url);
  }
  return out;
}

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
    + 'creator_avatar_url,partner_name,cover_media_path&limit=1');
  const it = Array.isArray(rows) ? rows[0] : null;
  if (!it) return null;
  const stops = await rest(`public_itinerary_stops?plan_id=eq.${encodeURIComponent(it.id)}`
    + '&select=order_index,place_name,city_name,suggested_time,duration_label,creator_note,latitude,longitude'
    + '&order=order_index.asc');
  let photos = new Map();
  try { photos = await placePhotos(stops); } catch { /* photos are optional; the stops are not */ }
  return { it, stops, photos, cover: coverURL(it.cover_media_path) };
}

/** The cover: the itinerary's own, else the first stop with a place photo. */
export function coverFor(data, coverResolves) {
  if (coverResolves) return data.cover;
  const first = data.stops.find((s) => data.photos.get(s));
  return first ? data.photos.get(first) : null;
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

function stopBlock(s, n, url) {
  const { time } = splitTime(s.suggested_time);
  const meta = [String(n).padStart(2, '0'), time, readableDuration(s.duration_label)].filter(Boolean).join(' · ');
  const note = String(s.creator_note || '').trim();
  const area = String(s.city_name || '').trim();
  const name = s.place_name || 'Stop';
  return `<li class="stop">
      <article class="card">
        ${url ? `<div class="stop-pic">${photo(url, 640, 'stop-img', name, false)}</div>` : ''}
        <div class="stop-text">
          <p class="stop-meta">${escapeHtml(meta)}</p>
          <h3 class="stop-name">${escapeHtml(name)}</h3>
          ${area ? `<p class="stop-area">${escapeHtml(area)}</p>` : ''}
          ${note ? `<p class="stop-note">${escapeHtml(note)}</p>` : ''}
        </div>
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
  const { it, stops, photos } = data;
  const title = it.name || 'An itinerary on Suna';

  // On the web, Follow does what the bar's button does: opens Suna, or the
  // App Store. The client points both at the same place.
  let byline = '';
  if (it.partner_name) {
    // A partner's name replaces the creator's: no avatar, no Follow.
    byline = `<div class="by"><div class="by-text"><p class="by-name">By ${escapeHtml(it.partner_name)}`
      + '<span class="tag">Partner</span></p></div></div>';
  } else if (it.creator_username) {
    const initial = escapeHtml(it.creator_username.slice(0, 1).toUpperCase());
    const avatar = it.creator_avatar_url
      ? `<img class="by-avatar" src="${escapeHtml(it.creator_avatar_url)}" alt="" width="40" height="40" decoding="async" onerror="this.style.visibility='hidden'">`
      : `<span class="by-avatar by-initial" aria-hidden="true">${initial}</span>`;
    byline = `<div class="by">${avatar}<div class="by-text"><p class="by-name">@${escapeHtml(it.creator_username)}</p>`
      + '<p class="by-sub">Their itinerary</p></div>'
      + `<a class="follow" data-open-suna href="https://apps.apple.com/app/id6759053765" aria-label="Follow @${escapeHtml(it.creator_username)} in Suna">Follow</a></div>`;
  }
  const intro = String(it.intro_story || '').trim();

  // Day headings only when the itinerary really spans more than one day.
  const days = new Set(stops.map((s) => splitTime(s.suggested_time).day).filter((d) => d !== null));
  let lastDay = null;
  const items = stops.map((s, i) => {
    const { day } = splitTime(s.suggested_time);
    let head = '';
    if (days.size > 1 && day !== null && day !== lastDay) {
      head = `<li class="day"><h3 class="day-label">Day ${day + 1}</h3></li>`;
      lastDay = day;
    }
    return head + stopBlock(s, i + 1, photos.get(s));
  }).join('\n    ');

  return `<main class="pv">
  <header class="cover${cover ? '' : ' cover-plain'}">
    ${cover ? coverImg(cover, variants) : `<div class="cover-mascot">${mascot || ''}</div>`}
    <div class="fade-top"></div>
    <div class="fade-bottom"></div>
    <button class="round-btn" id="share" type="button" aria-label="Share this itinerary"><img src="/icons/share.svg" width="16" height="16" alt=""></button>
    <div class="cover-text">
      <h1 id="title">${escapeHtml(title)}</h1>
      <p class="cover-sub">${escapeHtml(summaryLine(it, stops))}</p>
    </div>
  </header>
  ${byline || intro ? `<section class="about">
    ${byline}
    ${intro ? `<p class="intro">${escapeHtml(intro)}</p>` : ''}
  </section>` : ''}
  ${stops.length ? `<h2 class="route-head">The route</h2>
  <ol class="route">
    ${items}
  </ol>` : ''}
</main>
<div class="bar">
  <a class="cta" id="cta" href="https://apps.apple.com/app/id6759053765"><img src="/icons/copy.svg" width="17" height="17" alt="">Copy itinerary</a>
  <p class="bar-sub">Pick a day, and Suna takes you through it.</p>
</div>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
}

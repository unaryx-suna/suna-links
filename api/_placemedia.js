// W-352 (Ops OPS-364, Brian asked for photos and videos on places): the place page's photos and its one video.
//
// The data is iOS I-790's: `landmarks.gallery` jsonb [{url, path, credit, licence}] (1-8) and `landmarks.video`
// jsonb {url, poster_url, credit, seconds}, the shapes an event's gallery has, filled by Ops from the Panel. Until
// that migration is applied the read fails (PostgREST 400: no such column) and the page is exactly as before.
//
// Only real media: an https URL that isn't a Google photo, a credit on every photo (author + licence for CC), the
// video only with a poster. JSON-LD image / video only from these, never from a stock picture.
import { esc, sized } from './_placepage.js';
import { isGooglePhoto } from './_stock.js';

const MAX_PHOTOS = 8;
// I-790 stores credits as 'Photo: …'; the page adds its own 'Photo: ' / 'Video: ', so the stored one is dropped.
const bare = (c) => String(c || '').trim().replace(/^(photo|video)\s*:\s*/i, '');
const https = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]+$/.test(u.trim()) && !isGooglePhoto(u);

/** The cleaned gallery and video of a landmark row ({gallery, video}); empty when there is none. */
export function mediaOf(row) {
  const raw = row && Array.isArray(row.gallery) ? row.gallery : [];
  const photos = raw
    .filter((g) => g && https(g.url))
    .map((g) => ({ url: g.url.trim(), credit: bare(g.credit), licence: String(g.licence || '').trim() }))
    // A photo without a credit isn't shown (the app's rule, I-790); CC ones carry author + licence.
    .filter((g) => g.credit)
    .slice(0, MAX_PHOTOS);
  const v = row && row.video && typeof row.video === 'object' ? row.video : null;
  const video = v && https(v.url) && https(v.poster_url)
    ? { url: v.url.trim(), poster: v.poster_url.trim(), credit: bare(v.credit), seconds: Number.isFinite(Number(v.seconds)) ? Math.round(Number(v.seconds)) : null }
    : null;
  return { photos, video };
}

/** One read for both columns, beside the row's own read; any failure (no column yet) is no media. */
export async function fetchMedia(rest, id) {
  try {
    const rows = await rest(`landmarks?id=eq.${encodeURIComponent(id)}&select=gallery,video&limit=1`);
    return mediaOf(Array.isArray(rows) ? rows[0] : null);
  } catch { return { photos: [], video: null }; }
}

const creditLine = (c, l) => [c ? `Photo: ${c}` : '', l].filter(Boolean).join(' · ');

/**
 * The hero as a row of slides you swipe: the cover (our own only), then the gallery, then the video. Each slide
 * carries 'n / total' and its credit; the video starts on its poster, muted, and plays sound only on a tap.
 * Null when there's nothing to swipe (the hero stays one picture, as before).
 */
export function heroSlides({ cover, coverCredit, name, photos, video }) {
  const slides = [];
  if (cover) slides.push({ kind: 'img', url: cover, credit: coverCredit || '' });
  for (const p of photos) slides.push({ kind: 'img', url: p.url, credit: creditLine(p.credit, p.licence) });
  if (video) slides.push({ kind: 'video', ...video, credit: video.credit ? `Video: ${video.credit}` : '' });
  if (slides.length < 2) return null;
  const n = slides.length;
  const one = (s, i) => {
    const tag = `<span class="mc">${i + 1} / ${n}${s.credit ? ` · ${esc(s.credit)}` : ''}</span>`;
    if (s.kind === 'video') {
      return `<figure class="sl vid">${tag}<video src="${esc(s.url)}" poster="${esc(s.poster)}" muted playsinline loop preload="none" aria-label="${esc(`Video of ${name}`)}"></video>`
        + '<button type="button" class="snd" data-snd aria-pressed="false" aria-label="Sound on">Tap for sound</button></figure>';
    }
    const first = i === 0;
    return `<figure class="sl">${tag}<img src="${esc(sized(s.url, 640))}" data-full="${esc(s.url)}" onerror="this.onerror=null;this.src=this.dataset.full" alt="${first ? esc(name) : ''}" width="640" height="440"${first ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></figure>`;
  };
  return `<div class="slides" data-slides tabindex="0" aria-label="${esc(`Photos of ${name}`)}">${slides.map(one).join('')}</div>`;
}

export const MEDIA_CSS = `
.hero .slides{position:absolute;inset:0;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;z-index:1}
.hero .slides::-webkit-scrollbar{display:none}
.hero .sl{flex:0 0 100%;margin:0;position:relative;scroll-snap-align:start}
.hero .sl img,.hero .sl video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero .mc{position:absolute;z-index:3;top:64px;right:12px;max-width:calc(100% - 24px);padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero .snd{position:absolute;z-index:3;left:50%;top:46%;transform:translate(-50%,-50%);min-height:44px;padding:0 18px;border-radius:22px;border:1px solid rgba(255,255,255,.5);background:rgba(0,0,0,.5);color:#fff;font:600 14px/1 var(--font);cursor:pointer}
.hero .snd[aria-pressed="true"]{opacity:0;pointer-events:none}
.hero.has-slides:after{z-index:2;pointer-events:none}
.hero.has-slides .in{z-index:3;pointer-events:none}   /* the scrim over every slide, the title over the scrim */
`;

// The video plays (muted) only while it's the slide on screen; a tap turns the sound on.
export const MEDIA_JS = `(function(){var s=document.querySelector('[data-slides]');if(!s)return;var v=s.querySelector('video');if(!v)return;
if('IntersectionObserver' in window){new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting&&e.intersectionRatio>.6){v.play().catch(function(){})}else{v.pause()}})},{root:s,threshold:[0,.6,1]}).observe(v)}
var b=s.querySelector('[data-snd]');if(b)b.addEventListener('click',function(){v.muted=false;v.play().catch(function(){});b.setAttribute('aria-pressed','true')});})();`;

/** JSON-LD: the real photos (with their credit and licence) and the video; nothing from a stock picture. */
export function mediaLD(node, { cover, photos, video, name }) {
  const imgs = [];
  if (cover && node.image) imgs.push(node.image);
  for (const p of photos) imgs.push({ '@type': 'ImageObject', url: p.url, creditText: p.credit, ...(p.licence ? { license: p.licence } : {}) });
  if (imgs.length > 1) node.image = imgs;
  else if (imgs.length === 1) node.image = imgs[0];
  if (video) {
    node.video = { '@type': 'VideoObject', name: `${name}`, contentUrl: video.url, thumbnailUrl: video.poster,
      ...(video.seconds ? { duration: `PT${video.seconds}S` } : {}), ...(video.credit ? { creditText: video.credit } : {}) };
  }
  return node;
}

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
const bare = (c) => String(c || '').trim().replace(/^(photo|video)(\s*:|\s+by\b)\s*/i, '');
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
    ? { url: v.url.trim(), poster: v.poster_url.trim(), credit: [bare(v.credit), String(v.licence || '').trim()].filter(Boolean).join(', '), seconds: Number.isFinite(Number(v.seconds)) ? Math.round(Number(v.seconds)) : null }
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

const creditLine = (c, l) => [c, l].filter(Boolean).join(', ');   // Ops - Design 28 Nov (1): 'Jane Tan, CC BY-SA 4.0'

const SPEAKER_OFF = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 9.5l5 5M21 9.5l-5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const SPEAKER_ON = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg>';

/**
 * The hero as a row of slides you swipe: the cover (our own only), then the gallery, then the video (Ops - Design
 * 28 Nov, Brian 14:54): the counter alone top right ('3 / 4'); the credit small, white 70%, bottom right; on a phone
 * thin story bars across the top, on a computer arrows on hover and a thumbnail row under the hero; the video's sound
 * a 36 px speaker button beside the credit; with Reduce Motion (or when the browser won't autoplay) the poster with a
 * white play circle. One picture: null (the page as before, no counter, bars or thumbs).
 * Returns { hero, thumbs }: the hero's inside, and the row that goes right under it.
 */
export function heroSlides({ cover, coverCredit, name, photos, video }) {
  const slides = [];
  if (cover) slides.push({ kind: 'img', url: cover, credit: String(coverCredit || '').replace(/^Photo:\s*/i, '') });
  for (const p of photos) slides.push({ kind: 'img', url: p.url, credit: creditLine(p.credit, p.licence) });
  if (video) slides.push({ kind: 'video', ...video, credit: video.credit ? `Video: ${video.credit}` : '' });
  if (slides.length < 2) return null;
  const n = slides.length;
  const one = (s, i) => {
    if (s.kind === 'video') {
      return `<figure class="sl vid" data-credit="${esc(s.credit)}"><video src="${esc(s.url)}" poster="${esc(s.poster)}" muted playsinline loop preload="none" aria-label="${esc(`Video of ${name}`)}"></video>`
        + `<button type="button" class="play" data-play hidden aria-label="Play the video">${PLAY}</button></figure>`;
    }
    const first = i === 0;
    return `<figure class="sl" data-credit="${esc(s.credit)}"><img src="${esc(sized(s.url, 640))}" data-full="${esc(s.url)}" onerror="this.onerror=null;this.src=this.dataset.full" alt="${first ? esc(name) : ''}" width="640" height="440"${first ? ' fetchpriority="high"' : ' loading="lazy"'} decoding="async"></figure>`;
  };
  const bars = `<span class="bars" aria-hidden="true">${slides.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</span>`;
  const arrows = '<button type="button" class="arr prev" data-go="-1" aria-label="Previous photo" hidden><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>'
    + '<button type="button" class="arr next" data-go="1" aria-label="Next photo"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  const corner = `<span class="mfoot"><span class="cr" data-cr>${esc(slides[0].credit)}</span><button type="button" class="snd" data-snd aria-pressed="false" aria-label="Sound on" hidden>${SPEAKER_OFF}</button></span>`;
  const hero = `<div class="slides" data-slides tabindex="0" aria-label="${esc(`Photos of ${name}`)}">${slides.map(one).join('')}</div>`
    + `${bars}<span class="mc" data-mc>1 / ${n}</span>${arrows}${corner}`;
  const thumbs = `<div class="thumbs" data-thumbs aria-label="Photos">${slides.map((s, i) => `<button type="button" class="th${i === 0 ? ' on' : ''}${s.kind === 'video' ? ' v' : ''}" data-to="${i}" aria-label="${s.kind === 'video' ? 'The video' : `Photo ${i + 1}`}"><img src="${esc(s.kind === 'video' ? s.poster : sized(s.url, 320))}" alt="" loading="lazy" decoding="async">${s.kind === 'video' ? `<span class="pt">${PLAY}</span>` : ''}</button>`).join('')}</div>`;
  return { hero, thumbs };
}

export const MEDIA_CSS = `
.hero .slides{position:absolute;inset:0;display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;z-index:1;border-radius:inherit}
.hero .slides::-webkit-scrollbar{display:none}
.hero .sl{flex:0 0 100%;margin:0;position:relative;scroll-snap-align:start}
.hero .sl img,.hero .sl video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero.has-slides:after{z-index:2;pointer-events:none;border-radius:inherit}
.hero.has-slides .in{z-index:3;pointer-events:none;bottom:40px}   /* the title over the scrim, clear of the credit line */
.hero .mc{position:absolute;z-index:4;top:64px;right:12px;padding:4px 10px;border-radius:999px;background:rgba(0,0,0,.5);color:#fff;font-size:12px;font-weight:600}
.hero .bars{position:absolute;z-index:4;top:58px;left:16px;right:16px;display:flex;gap:4px}
.hero .bars i{flex:1;height:2px;border-radius:1px;background:rgba(255,255,255,.35)}
.hero .bars i.on{background:#fff}
.hero.has-slides .mc{top:70px}
.hero .mfoot{position:absolute;z-index:4;right:12px;bottom:8px;display:flex;align-items:center;gap:8px;max-width:calc(100% - 24px)}
.hero .cr{font-size:11.5px;line-height:1.3;color:rgba(255,255,255,.7);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hero .snd{flex:none;width:36px;height:36px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer}
.hero .snd[hidden],.hero .play[hidden],.hero .arr[hidden]{display:none}
.hero .play{position:absolute;left:50%;top:42%;transform:translate(-50%,-50%);width:56px;height:56px;border-radius:50%;border:0;background:#fff;color:#0f1110;display:grid;place-items:center;cursor:pointer;z-index:1}
.hero .arr{display:none}
.thumbs{display:none}
@media (min-width:600px) and (hover:hover){
  .hero .bars{display:none}
  .hero.has-slides .mc{top:64px}
  .hero .arr{position:absolute;z-index:4;top:50%;transform:translateY(-50%);width:40px;height:40px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;cursor:pointer;opacity:0;transition:opacity .15s}
  .hero .arr.prev{left:12px} .hero .arr.next{right:12px}
  .hero:hover .arr,.hero .arr:focus-visible{opacity:1}
  .thumbs{display:flex;gap:8px;padding:12px 16px 0;overflow-x:auto;scrollbar-width:none}
  .thumbs .th{position:relative;flex:none;width:64px;height:48px;padding:0;border-radius:8px;overflow:hidden;border:2px solid transparent;background:var(--surface2);cursor:pointer}
  .thumbs .th.on{border-color:#fff}
  .thumbs .th img{width:100%;height:100%;object-fit:cover;display:block}
  .thumbs .pt{position:absolute;inset:0;display:grid;place-items:center;color:#fff;background:rgba(0,0,0,.25)}
  .thumbs .pt svg{width:16px;height:16px}
}
`;

// The counter, bars, thumbs, credit and sound follow the slide on screen. The video plays (muted) only while it's
// the slide on screen, never with Reduce Motion or when the browser refuses (Low Power): then the poster and a play
// circle. The speaker turns the sound on.
export const MEDIA_JS = `(function(){var s=document.querySelector('[data-slides]');if(!s)return;var h=s.parentNode,f=s.children,n=f.length,cur=0;
var mc=h.querySelector('[data-mc]'),cr=h.querySelector('[data-cr]'),snd=h.querySelector('[data-snd]'),bars=h.querySelectorAll('.bars i'),th=document.querySelectorAll('[data-thumbs] .th'),prev=h.querySelector('.arr.prev'),next=h.querySelector('.arr.next');
var v=s.querySelector('video'),play=s.querySelector('[data-play]'),still=window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches;
function go(i){i=Math.max(0,Math.min(n-1,i));s.scrollTo({left:i*s.clientWidth,behavior:still?'auto':'smooth'})}
function show(i){if(i===cur&&mc.textContent)return;cur=i;mc.textContent=(i+1)+' / '+n;cr.textContent=f[i].getAttribute('data-credit')||'';
for(var k=0;k<bars.length;k++)bars[k].className=k===i?'on':'';for(var t=0;t<th.length;t++)th[t].classList.toggle('on',t===i);
if(prev)prev.hidden=i===0;if(next)next.hidden=i===n-1;var isV=v&&f[i].contains(v);if(snd&&!isV)snd.hidden=true;
if(v){if(isV&&!still){v.play().then(function(){play.hidden=true;snd.hidden=false},function(){play.hidden=false;snd.hidden=true})}else{v.pause();if(isV){play.hidden=false;snd.hidden=true}}}}
var raf=0;s.addEventListener('scroll',function(){cancelAnimationFrame(raf);raf=requestAnimationFrame(function(){show(Math.round(s.scrollLeft/Math.max(1,s.clientWidth)))})},{passive:true});
h.querySelectorAll('[data-go]').forEach(function(b){b.addEventListener('click',function(){go(cur+Number(b.getAttribute('data-go')))})});
th.forEach(function(b){b.addEventListener('click',function(){go(Number(b.getAttribute('data-to')))})});
if(play)play.addEventListener('click',function(){v.muted=false;v.play().then(function(){play.hidden=true;snd.hidden=false;snd.setAttribute('aria-pressed','true');snd.innerHTML=${JSON.stringify(SPEAKER_ON)}},function(){})});
if(snd)snd.addEventListener('click',function(){v.muted=!v.muted;snd.setAttribute('aria-pressed',String(!v.muted));snd.setAttribute('aria-label',v.muted?'Sound on':'Sound off');snd.innerHTML=v.muted?${JSON.stringify(SPEAKER_OFF)}:${JSON.stringify(SPEAKER_ON)}});
mc.textContent='';show(0)})();`;

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

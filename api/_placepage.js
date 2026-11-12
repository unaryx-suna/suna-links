// W-197 (Ops OPS-135; Brian 5 Nov via Ops: "love it"): the place page and
// the not-found page on app.unaryx.com, server-rendered from Ops's design
// (claude/design/APP-WEB-REDESIGN-0511.html, screens 1 and 4).
//
// Only what we hold is shown: no rating, no review, no hours we don't have.
// Open now is worked out here from operating_hours in the place's own time
// zone, and only when we know that zone; otherwise the week's hours show
// without a verdict.

import { directions, saveInSuna, hasPin } from './_maps.js';

export const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// ---- time zones ------------------------------------------------------------
// cities has no time zone column, so the country decides; Australia by
// longitude (WA, SA/NT, the east). Unknown country: no open-now verdict.
const TZ = {
  MY: 'Asia/Kuala_Lumpur', SG: 'Asia/Singapore', ID: 'Asia/Jakarta', TH: 'Asia/Bangkok', VN: 'Asia/Ho_Chi_Minh',
  PH: 'Asia/Manila', KH: 'Asia/Phnom_Penh', LA: 'Asia/Vientiane', MM: 'Asia/Yangon', BN: 'Asia/Brunei',
  JP: 'Asia/Tokyo', KR: 'Asia/Seoul', TW: 'Asia/Taipei', HK: 'Asia/Hong_Kong', MO: 'Asia/Macau', CN: 'Asia/Shanghai',
  IN: 'Asia/Kolkata', LK: 'Asia/Colombo', NP: 'Asia/Kathmandu', NZ: 'Pacific/Auckland', AE: 'Asia/Dubai', GB: 'Europe/London',
  FR: 'Europe/Paris', DE: 'Europe/Berlin', IT: 'Europe/Rome', ES: 'Europe/Madrid', NL: 'Europe/Amsterdam', TR: 'Europe/Istanbul',
};
export function tzFor(country, lng) {
  const c = String(country || '').toUpperCase();
  if (c === 'AU') {
    const x = Number(lng);
    if (!Number.isFinite(x)) return null;
    return x < 129 ? 'Australia/Perth' : x < 138 ? 'Australia/Adelaide' : 'Australia/Sydney';
  }
  return TZ[c] || null;
}

// ---- opening hours ---------------------------------------------------------
const DAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** "7am", "4:30pm", "midnight". */
export function clock(h, m) {
  if (h === 24 || (h === 0 && m === 0)) return 'midnight';
  if (h === 12 && m === 0) return 'noon';
  const hh = (h % 12) || 12;
  return `${hh}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** The weekday (0 = Sunday) and minutes past midnight now, in `tz`. */
function localNow(now, tz) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false })
    .formatToParts(new Date(now)).forEach((x) => { p[x.type] = x.value; });
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { day, mins: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

/**
 * What the page says about hours, from Google-style operating_hours
 * ({ periods: [{ open: {day, hour, minute}, close: {...} }], weekdayDescriptions }).
 * → { open: true|false|null, chip, summary, week: [7 lines Monday-first] } or null.
 */
export function hoursInfo(oh, tz, now = Date.now()) {
  if (!oh || typeof oh !== 'object') return null;
  const periods = Array.isArray(oh.periods) ? oh.periods.filter((p) => p && p.open && Number.isInteger(p.open.day)) : [];
  const desc = Array.isArray(oh.weekdayDescriptions) ? oh.weekdayDescriptions.filter((d) => typeof d === 'string') : [];
  if (!periods.length && desc.length !== 7) return null;

  // Open around the clock: one period with no close.
  const allDay = periods.length === 1 && !periods[0].close;
  const byDay = Array.from({ length: 7 }, () => []);
  for (const p of periods) {
    if (!p.close) continue;
    byDay[p.open.day].push([p.open.hour * 60 + (p.open.minute || 0), p.close.day, p.close.hour * 60 + (p.close.minute || 0)]);
  }
  const lineFor = (d) => {
    if (allDay) return 'Open 24 hours';
    const spans = byDay[d].sort((a, b) => a[0] - b[0]);
    if (!spans.length) return 'Closed';
    return spans.map(([o, cd, c]) => `${clock(Math.floor(o / 60), o % 60)} to ${clock(Math.floor(c / 60), c % 60)}`).join(', ');
  };
  const week = periods.length
    ? [1, 2, 3, 4, 5, 6, 0].map((d) => `${DAY[d]}: ${lineFor(d)}`)
    : desc.map((s) => s.replace(/ | /g, ' ').replace(/ – /g, ' to '));

  // Every day the same? "Open daily, 7am to 5pm".
  const lines = [0, 1, 2, 3, 4, 5, 6].map(lineFor);
  const same = periods.length && lines.every((l) => l === lines[0]);
  let summary = same ? (lines[0] === 'Closed' ? 'Closed' : allDay ? 'Open 24 hours, every day' : `Open daily, ${lines[0]}`) : null;

  let open = null, chip = '';
  if (tz && periods.length) {
    const { day, mins } = localNow(now, tz);
    const t = day * 1440 + mins;
    if (allDay) { open = true; chip = 'Open now · 24 hours'; }
    else {
      open = false;
      for (const p of periods) {
        if (!p.close) continue;
        let s = p.open.day * 1440 + p.open.hour * 60 + (p.open.minute || 0);
        let e = p.close.day * 1440 + p.close.hour * 60 + (p.close.minute || 0);
        if (e <= s) e += 7 * 1440;
        for (const shift of [0, -7 * 1440]) {
          if (t >= s + shift && t < e + shift) { open = true; const em = e % 1440; chip = `Open now · until ${clock(Math.floor(em / 60), em % 60)}`; }
        }
      }
      if (!open) {
        chip = 'Closed now';
        if (!same) summary = `Today: ${lineFor(day)}`;
      } else if (!same) summary = `Today: ${lineFor(day)}`;
    }
  }
  if (!summary) summary = week[0];
  return { open, chip, summary, week };
}

// ---- distances and dates ---------------------------------------------------
export function km(a, b, c, d) {
  const r = Math.PI / 180, R = 6371;
  const x = (d - b) * r * Math.cos(((a + c) / 2) * r), y = (c - a) * r;
  return Math.sqrt(x * x + y * y) * R;
}
export function away(k) {
  if (k < 0.95) return `${Math.max(10, Math.round((k * 1000) / 10) * 10)} m`;
  return `${(Math.round(k * 10) / 10).toFixed(1)} km`;
}
export function dayLabel(iso, tz) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz || 'Asia/Kuala_Lumpur', weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

/** A stored photo's 640 px copy (image-variants-sweep), with the original as the fallback. */
export function sized(url, w = 640) {
  if (!url || !/\/storage\/v1\/object\/public\//.test(url)) return url;
  const clean = url.split('?')[0];
  const i = clean.lastIndexOf('/');
  return `${clean.slice(0, i)}/_w/${w}${clean.slice(i)}`;
}
const img = (url, cls, alt = '', w = 640) => url
  ? `<img class="${cls}" src="${esc(sized(url, w))}" data-full="${esc(url)}" onerror="this.onerror=null;this.src=this.dataset.full" alt="${esc(alt)}" loading="lazy" decoding="async">`
  : '';

// ---- the page ----------------------------------------------------------------
export const CSS = `
:root{--ink:#0f1110;--surface:#181b19;--surface2:#202421;--line:#2a2f2c;--text:#f2eee6;--muted:#a3a8a4;--sand:#f6cb94;--sand-deep:#e9b26f;--tile:#f6f2ea;--found:#91f499;--sheet:#1f1f1f;--font:Urbanist,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
*{box-sizing:border-box}
html,body{margin:0;background:var(--ink);color:var(--text);font-family:var(--font);-webkit-text-size-adjust:100%}
a{color:inherit}
.wrap{max-width:560px;margin:0 auto;position:relative}
.top{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;position:absolute;left:0;right:0;top:0;z-index:5}
.top.solid{position:relative}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;font-size:20px;color:var(--text);text-decoration:none}
.brand img{height:24px;width:auto}
.pill{background:var(--sand);color:#1d1408;font-weight:700;font-size:15px;border-radius:999px;padding:9px 16px;text-decoration:none}
.hero{height:440px;position:relative;background:var(--surface2);overflow:hidden}
.hero img.hi{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.hero:after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(15,17,16,.55) 0%,rgba(15,17,16,0) 22%,rgba(15,17,16,0) 45%,rgba(15,17,16,.9) 82%,var(--ink) 100%)}
.hero .in{position:absolute;left:16px;right:16px;bottom:14px;z-index:2}
.kick{font-size:12px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:var(--sand);margin:0}
h1{font-size:34px;line-height:1.05;font-weight:800;margin:8px 0;letter-spacing:-.3px;overflow-wrap:anywhere}
.lede{font-size:16px;color:#d9d5cc;line-height:1.4;margin:0}
.pad{padding:0 16px}
.chips{display:flex;gap:8px;flex-wrap:wrap;margin:14px 0 0}
.chip{display:inline-flex;align-items:center;gap:7px;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:7px 12px;font-size:14px;font-weight:600}
.dot{width:8px;height:8px;border-radius:4px;background:var(--found)}
.dot.off{background:#6b716c}
.btns{display:flex;gap:10px;margin-top:16px}
.btn{flex:1;min-height:52px;border-radius:26px;display:flex;align-items:center;justify-content:center;gap:8px;font-weight:700;font-size:16px;text-decoration:none;border:0;cursor:pointer;font-family:inherit}
.btn.p,.save-suna{background:var(--sand);color:#1d1408;flex:1.35}
.btn.s,.btn-outline{border:1px solid #3a403c;color:var(--text);background:none}
.hint{font-size:13.5px;color:var(--muted);margin:10px 0 0;line-height:1.4;display:flex;gap:8px;align-items:flex-start}
.hint svg{flex:none;margin-top:1px}
.tips{margin:14px 0 0;padding:12px 14px;border:1px solid var(--line);border-radius:16px;background:var(--surface)}
.tips ul{list-style:none;margin:6px 0 0;padding:0}
.tips li{font-size:16px;line-height:1.4;color:var(--text);padding:6px 0;border-bottom:1px solid var(--line)}
.tips li:last-child{border-bottom:0;padding-bottom:0}
.tips small{display:block;margin:6px 0 0;font-size:13px;color:var(--muted)}
.offer{margin:14px 0 0;padding:10px 14px;border-radius:12px;background:rgba(246,203,148,.12);color:var(--sand);font-size:15px;line-height:1.4}
.book{margin:12px 0 0;font-size:14px}
.book a{color:var(--sand);font-weight:700;text-decoration:none}
.book small{color:var(--muted);margin-left:6px}
h2{font-size:21px;font-weight:800;margin:30px 0 12px;display:flex;align-items:baseline;gap:8px}
h2 small{font-size:14px;color:var(--sand);font-weight:700}
.card{background:var(--surface);border:1px solid var(--line);border-radius:18px;padding:4px 14px}
.row{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line);font-size:15px;line-height:1.35}
.row:last-child{border-bottom:0}
.row .k{width:62px;color:var(--muted);flex:none}
.row b{font-weight:700}
.row details summary{color:var(--sand);font-weight:700;font-size:14px;cursor:pointer;list-style:none;margin-top:2px}
.row details summary::-webkit-details-marker{display:none}
.row details ul{margin:8px 0 0;padding:0;list-style:none;color:var(--muted);font-size:14px;line-height:1.6}
p.body{font-size:16px;line-height:1.5;color:#dcd8cf;margin:18px 0 0}
.ev{display:flex;gap:12px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);text-decoration:none}
.ev:last-child{border:0}
.th{width:58px;height:58px;border-radius:12px;flex:none;background:#2a2f2c;overflow:hidden}
.th img{width:100%;height:100%;object-fit:cover;display:block}
.ev .t{flex:1;min-width:0}
.ev .d{font-size:12px;font-weight:800;letter-spacing:.8px;color:var(--sand);text-transform:uppercase}
.ev .n{font-weight:700;font-size:15.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:2px 0}
.ev .m{font-size:13px;color:var(--muted)}
.chev{color:#6b716c;font-size:20px}
.scroll{display:flex;gap:12px;overflow-x:auto;margin-right:-16px;padding-right:16px;scrollbar-width:none}
.scroll::-webkit-scrollbar{display:none}
.pc{width:150px;flex:none;text-decoration:none}
.pc .im{height:180px;border-radius:16px;overflow:hidden;background:var(--surface2)}
.pc .im img{width:100%;height:100%;object-fit:cover;display:block}
.pc .n{font-weight:700;font-size:15px;margin-top:8px;line-height:1.2}
.pc .m{font-size:13px;color:var(--muted);margin-top:2px}
.tilecard{background:var(--tile);color:#1d1a14;border-radius:22px;padding:20px 18px;margin-top:30px}
.tilecard h3{font-size:22px;font-weight:800;line-height:1.15;margin:0}
.tilecard .st{display:flex;gap:12px;align-items:center;margin-top:14px;font-size:15px;line-height:1.35;font-weight:600}
.px{width:40px;height:40px;image-rendering:pixelated;border:2px solid #2B1E0E;border-radius:6px;flex:none;background:#FFF9D5;padding:4px}
.tilecard .btn.p{margin-top:18px;background:#1d1a14;color:var(--sand);width:100%}
.tilecard .and{display:block;text-align:center;font-size:14px;margin-top:12px;font-weight:600;color:#5b5446;text-decoration:none}
.foot{padding:28px 16px 34px;color:var(--muted);font-size:13px;line-height:1.6;border-top:1px solid var(--line);margin-top:34px}
.foot b{color:var(--text)}
.foot a{color:var(--muted);text-decoration:none}
.center{padding:34px 18px 0;text-align:center}
.big{font-size:28px;font-weight:800;line-height:1.08;margin:18px 0 0}
.mutedc{color:var(--muted);font-size:16px;line-height:1.45;margin:10px 0 0}
.bigpx{width:76px;height:76px;image-rendering:pixelated;border:3px solid #2B1E0E;border-radius:8px;box-shadow:4px 4px 0 #2B1E0E;background:#FFF9D5;padding:8px}
.sheet-dim{position:fixed;inset:0;z-index:10;background:rgba(0,0,0,.5);display:flex;align-items:flex-end;justify-content:center;padding:8px 8px calc(12px + env(safe-area-inset-bottom))}
.sheet{width:100%;max-width:386px;display:grid;gap:12px}
.sheet-group{background:var(--sheet);border-radius:16px;overflow:hidden;display:grid;text-align:center}
.sheet-title{color:var(--muted);font-size:13px;font-weight:500;margin:0;padding:18px 16px}
.sheet-opt{color:var(--sand);font-size:18px;font-weight:600;text-decoration:none;padding:18px 16px;border-top:1px solid rgba(90,90,90,.6)}
.sheet-cancel{color:var(--text);font:700 18px var(--font);border:0;height:60px;cursor:pointer}
[hidden]{display:none!important}
@media (min-width:600px){.hero{border-radius:0 0 24px 24px}}
`;

export const HEAD_FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>'
  + '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@400;500;600;700;800&display=swap">';

const BELL = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f6cb94" stroke-width="2.2" aria-hidden="true"><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><path d="M10 21h4"/></svg>';
const BOOKMARK = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z"/></svg>';
const APPLE = '<svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.37 12.6c-.03-2.6 2.12-3.85 2.22-3.91-1.21-1.77-3.09-2.01-3.76-2.04-1.6-.16-3.12.94-3.93.94-.81 0-2.06-.92-3.39-.89-1.74.03-3.35 1.01-4.25 2.57-1.81 3.14-.46 7.79 1.3 10.34.86 1.25 1.89 2.65 3.24 2.6 1.3-.05 1.79-.84 3.36-.84 1.57 0 2.01.84 3.38.81 1.4-.02 2.29-1.27 3.14-2.53.99-1.45 1.4-2.85 1.42-2.92-.03-.01-2.72-1.04-2.73-4.13zM13.79 4.97c.72-.87 1.2-2.07 1.07-3.27-1.03.04-2.28.69-3.02 1.55-.66.76-1.24 1.99-1.09 3.16 1.15.09 2.32-.58 3.04-1.44z"/></svg>';
const PX = (name, alt = '') => `<img class="px" src="/icons/px/${name}.png" width="40" height="40" alt="${esc(alt)}">`;

export function topBar(store, solid = false) {
  return `<header class="top${solid ? ' solid' : ''}"><a class="brand" href="https://unaryx.com/"><img src="/icons/suna-mark.svg" width="16" height="24" alt="">Suna</a><a class="pill app-store" href="${esc(store)}">Get the app</a></header>`;
}

export function appCard(store, heading) {
  return `<div class="tilecard"><h3>${esc(heading)}</h3>
    <div class="st">${PX('heart')}Save the places you like, from temples to rooftop bars.</div>
    <div class="st">${PX('phone')}Walk past one and Suna gives you a nudge.</div>
    <div class="st">${PX('nightmarkets')}See what's on this weekend, checked by a person.</div>
    <a class="btn p app-store" href="${esc(store)}">${APPLE} Get Suna on the App Store</a>
    <a class="and" href="https://unaryx.com/android?from=app-place">On Android? Join the list: Suna on Android, December</a></div>`;
}

export const FOOT = '<footer class="foot"><b>Suna</b> · things to do near you<br><a href="https://unaryx.com/events">What\'s on</a> · <a href="https://unaryx.com/events/list">Organisers</a> · <a href="https://unaryx.com/partners">Partners</a> · <a href="https://unaryx.com/">unaryx.com</a></footer>';

function eventsCard(events, tz) {
  if (!events.length) return '';
  return `<div class="card">${events.map((e) => `<a class="ev" href="/e/${esc(e.id)}"><div class="th">${img(e.image_url, '', '', 320)}</div><div class="t"><div class="d">${esc(Date.parse(e.start_time) < (e.now || Date.now()) ? 'On now' : dayLabel(e.start_time, tz))}</div><div class="n">${esc(e.name)}</div><div class="m">${esc(e.meta || (Number.isFinite(e.km) ? `${away(e.km)} away` : ''))}</div></div><div class="chev" aria-hidden="true">›</div></a>`).join('')}</div>`;
}

const CATEGORY_WORDS = { 'Culinary Spot': 'Food', 'Cafe & Workspace': 'Cafe', 'Nature & Parks': 'Park', 'Sacred Space': 'Sacred space',
  'Historic Site': 'Historic site', 'Monument & Statue': 'Monument', 'Travel Hub': 'Travel hub', 'Arts & Culture': 'Arts & culture' };
export const categoryWords = (c) => CATEGORY_WORDS[c] || String(c || '');

/**
 * The place page (design screen 1).
 * d = { place, cityName, tz, cover, hours, events, walks, tips, store, scheme, offer, booking, now }
 */
/**
 * W-223 (Brian 12 Nov: "Show tips, then go live"): the place's published tips,
 * every one of them, under the description. The index gate counts these same
 * words (sitemap.js hasRealContent), so a page is never indexable for text it
 * doesn't print. tips = [{ body, attribution }].
 */
export function tipsBlock(tips) {
  const list = (tips || []).map((t) => ({ body: String((t && t.body) || '').trim().replace(/\s+/g, ' '), by: String((t && t.attribution) || '').trim() })).filter((t) => t.body);
  if (!list.length) return '';
  const by = [...new Set(list.map((t) => t.by).filter(Boolean))].join(' · ');
  return `<section class="tips" aria-label="${list.length > 1 ? 'Tips' : 'Tip'}"><p class="kick">${list.length > 1 ? 'Tips' : 'Tip'}</p><ul>${list.map((t) => `<li>${esc(t.body)}</li>`).join('')}</ul>${by ? `<small>${esc(by)}</small>` : ''}</section>`;
}

export function placeBody(d) {
  const p = d.place;
  const kicker = [categoryWords(p.category), d.cityName].filter(Boolean).join(' · ');
  const lede = String(p.description || '').trim();
  const nearest = d.walks[0];
  const chips = [
    d.hours && d.hours.chip ? `<span class="chip"><span class="dot${d.hours.open ? '' : ' off'}"></span>${esc(d.hours.chip)}</span>` : '',
    nearest && nearest.km <= 0.5 ? `<span class="chip">${esc(away(nearest.km))} from ${esc(nearest.name)}</span>` : '',
  ].filter(Boolean).join('');
  const dir = hasPin(p.latitude, p.longitude) ? directions(p.latitude, p.longitude, p.name, 'btn s') : '';
  // W-223: one or two tips sit right under the description (as Brian approved).
  // Three or more would push Save in Suna off a phone's first screen, so the
  // same block goes just below the buttons instead.
  const tips = tipsBlock(d.tips);
  const tipsHigh = (d.tips || []).filter((t) => t && String(t.body || '').trim()).length <= 2;
  const good = [
    d.hours ? `<div class="row"><span class="k">Hours</span><span><b>${esc(d.hours.summary)}</b><details><summary>See the week</summary><ul>${d.hours.week.map((l) => `<li>${esc(l)}</li>`).join('')}</ul></details></span></div>` : '',
    p.address ? `<div class="row"><span class="k">Where</span><span>${esc(p.address)}</span></div>` : '',
  ].filter(Boolean).join('');
  return `${topBar(d.store)}
<main>
<div class="hero">${d.cover ? `<img class="hi" src="${esc(d.cover)}" alt="${esc(p.name)}" fetchpriority="high">` : ''}<div class="in">
${kicker ? `<p class="kick">${esc(kicker)}</p>` : ''}<h1>${esc(p.name)}</h1>
${lede ? `<p class="lede">${esc(lede.length > 140 ? `${lede.slice(0, 139).replace(/\s+\S*$/, '')}…` : lede)}</p>` : ''}</div></div>
<div class="pad">
${tipsHigh ? tips : ''}
${chips ? `<div class="chips">${chips}</div>` : ''}
<div class="btns">${saveInSuna(d.scheme, d.store, 'btn p', `${BOOKMARK} Save in Suna`)}${dir}</div>
<p class="hint">${BELL}<span>Save it, and Suna reminds you when you're walking past.</span></p>
${tipsHigh ? '' : tips}
${d.offer ? `<p class="offer">${esc(d.offer)}</p>` : ''}
${d.booking ? `<p class="book"><a href="${esc(d.booking)}" target="_blank" rel="sponsored noopener">Book tickets ↗</a><small>Suna may earn a commission</small></p>` : ''}
${good ? `<h2>Good to know</h2><div class="card">${good}</div>` : ''}
${lede.length > 140 ? `<p class="body">${esc(lede)}</p>` : ''}
${d.events.length ? `<h2>On near here <small>this month</small></h2>${eventsCard(d.events, d.tz)}` : ''}
${d.walks.length ? `<h2>A short walk away</h2><div class="scroll">${d.walks.map((w) => `<a class="pc" href="/place/${esc(w.id)}"><div class="im">${img(w.cover, '', w.name, 320)}</div><div class="n">${esc(w.name)}</div><div class="m">${esc([categoryWords(w.category), away(w.km)].filter(Boolean).join(' · '))}</div></a>`).join('')}</div>` : ''}
${appCard(d.store, 'Find more like this, near you')}
</div>
</main>
${FOOT}`;
}

/** Not found / hidden (design screen 4): never a blank 404. d = { cityName, citySlug, events, store, tz } */
export function missingBody(d) {
  return `${topBar(d.store, true)}
<main>
<div class="center"><img class="bigpx" src="/icons/px/heart.png" width="76" height="76" alt="">
<h1 class="big">This place isn't on Suna any more</h1>
<p class="mutedc">It may have closed or moved. Here's what's on near there instead.</p></div>
<div class="pad">
${d.events.length ? `<h2>On near there <small>${esc(d.cityName)}</small></h2>${eventsCard(d.events, d.tz)}` : ''}
<div class="btns" style="margin-top:18px"><a class="btn s" href="https://unaryx.com/events/${esc(d.citySlug)}">See all of ${esc(d.cityShort || d.cityName)} this weekend</a></div>
${appCard(d.store, "Suna keeps up, so you don't have to")}
</div>
</main>
${FOOT}`;
}

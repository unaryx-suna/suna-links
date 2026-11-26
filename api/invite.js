// app.unaryx.com/u/<username>: the link inside a person's Suna QR code and
// Share (W-155; the app half is I-316).
//
// With Suna installed, iOS opens the app on this link (AASA /u/*) and it
// never reaches here. Without it there is no page (Brian, 24 Oct: a scan
// should take them to download the app): a 302 by device, the way
// unaryx.com/get answers. iPhone and iPad → the App Store, ct=invite-qr from
// a code (?via=qr), else ct=invite-link; Android → Google Play (W-241), the same ct as its
// install referrer campaign; a
// computer → /get's QR page. The username is never shown, stored or put in
// ct; since W-242 it rides in Play's install referrer (suna_target) so the
// app can open the profile after the install. A bad username
// gets the same redirects. Never cached, since the answer depends on the phone.

// W-159: the one App Store link the sites use (unaryx.com/get, SITE-ALIGNMENT),
// with no storefront in it, so Apple opens the visitor's own country's store.
// W-246: Apple's link carries the channel (creator-* → creators …); Play below keeps the full ct.
import { appleCt } from './_clip.js';
const STORE = (ct) => `https://apps.apple.com/app/id6759053765?pt=128539200&ct=${appleCt(ct)}&mt=8`;
const CT = /^[a-z0-9-]{1,40}$/;
// W-241: Suna is on Google Play; the campaign rides in the install referrer.
export const PLAY = 'https://play.google.com/store/apps/details?id=com.unaryx.suna';
// W-242: the referrer also carries the profile (suna_target=/u/<username>,
// encoded), so the app opens it after the install; only a clean username,
// 200 encoded characters at most, else left out.
const USER = /^[A-Za-z0-9._]{1,40}$/;
export function targetFrom(rawURL) {
  let p = '';
  try { p = new URL(String(rawURL || ''), 'https://app.unaryx.com').pathname.replace(/\/+$/, ''); } catch { return ''; }
  const m = p.match(/^\/u\/([^/]+)$/);
  if (!m || !USER.test(m[1])) return '';
  const e = encodeURIComponent(p);
  return e.length <= 200 ? e : '';
}
export const playURL = (ct, target = '') => {
  const camp = CT.test(String(ct || '')) ? ct : '';
  if (!camp && !target) return PLAY;
  return `${PLAY}&referrer=${encodeURIComponent(`utm_source=suna${camp ? `&utm_campaign=${camp}` : ''}${target ? `&suna_target=${target}` : ''}`)}`;
};

/** 'ios', 'android' or 'desktop'. Android first, as /get does. */
export function deviceFrom(ua) {
  const s = String(ua || '');
  if (/Android/i.test(s)) return 'android';
  if (/iPhone|iPad|iPod/.test(s)) return 'ios';
  return 'desktop';
}

/**
 * The link's own ct when it carries an allowed one (W-159: the app's Ask Suna
 * invite sends ct=ask-invite), else invite-qr from a code, else invite-link.
 */
export function ctFrom(rawURL) {
  let q = new URLSearchParams();
  try { q = new URL(String(rawURL || ''), 'https://app.unaryx.com').searchParams; } catch { /* none */ }
  const ct = q.get('ct') || '';
  if (CT.test(ct)) return ct;
  return q.get('via') === 'qr' ? 'invite-qr' : 'invite-link';
}

export function targetFor(device, ct, target = '') {
  if (device === 'ios') return STORE(CT.test(ct) ? ct : 'invite-link');
  if (device === 'android') return playURL(CT.test(ct) ? ct : 'invite-link', target);
  // QA W3: a computer keeps the link's own ct too (a creator's /u/ link was counted as invite-link on desktop).
  return `https://unaryx.com/get?ct=${encodeURIComponent(CT.test(ct) ? ct : 'invite-link')}`;
}

// W-314 DEX-148 (1) (Brian 15:25, web-qa-decisions.png frame 1): a real person's link opens a page that keeps
// who invited them: "@<name> invited you to Suna", their photo, their published plans, a white "Open in Suna",
// both store buttons and the App Clip banner; the link preview carries the name and photo. An unknown name (or
// a failed read) keeps the old redirect. Only what Suna already shows publicly: public_profiles (username,
// photo) and public_itineraries. No first name exists in public data, so the page uses the @username.
import { page, escapeHtml as esc, rest } from './_clip.js';
const REST_COVER = (path) => !path ? null : /^https?:\/\//i.test(path) ? path : `https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/itinerary-covers/${String(path).replace(/^\/+/, '').split('/').map(encodeURIComponent).join('/')}`;
export async function loadInviter(name, readImpl = rest) {
  if (!USER.test(name)) return null;
  try {
    const [p, its] = await Promise.all([
      readImpl(`public_profiles?select=username,avatar_url&username=eq.${encodeURIComponent(name)}&limit=1`),
      readImpl(`public_itineraries?select=share_slug,name,resolved_city_name,cover_media_path&creator_username=eq.${encodeURIComponent(name)}&order=published_at.desc&limit=4`),
    ]);
    const u = Array.isArray(p) && p[0];
    if (!u || !u.username) return null;
    return { username: String(u.username), avatar: /^https:\/\//.test(u.avatar_url || '') ? u.avatar_url : null, plans: (Array.isArray(its) ? its : []).filter((x) => x && x.share_slug && x.name).slice(0, 4) };
  } catch { return null; }
}
export function invitePage(inv, { device, ct, target, url }) {
  const n = `@${inv.username}`, open = targetFor(device, ct, target);
  const city = inv.plans[0] && inv.plans[0].resolved_city_name;
  const plans = inv.plans.map((x) => `<a class="iv-plan" href="/i/${esc(x.share_slug)}">${REST_COVER(x.cover_media_path) ? `<img src="${esc(REST_COVER(x.cover_media_path))}" alt="" width="160" height="200" loading="lazy">` : '<span class="ph" aria-hidden="true"></span>'}<b>${esc(x.name)}</b>${x.resolved_city_name ? `<small>${esc(x.resolved_city_name)}</small>` : ''}</a>`).join('');
  const body = `<style>
.iv { max-width: 480px; margin: 0 auto; padding: 32px 16px 48px; text-align: center; }
.iv .av { width: 88px; height: 88px; margin: 0 auto 16px; border-radius: 50%; object-fit: cover; background: #222; display: block; }
.iv .av.init { display: grid; place-items: center; font: 700 34px/1 Urbanist, system-ui; color: #140F2E; background: #fff; }
.iv h1 { margin: 0 0 8px; font: 700 26px/1.2 Urbanist, system-ui; color: #fff; }
.iv p { margin: 0 0 20px; color: #d0d0d0; font-size: 16px; }
.iv .open { display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 999px; background: #fff; color: #140F2E; font: 700 17px/1 Urbanist, system-ui; text-decoration: none; }
.iv .stores { display: flex; gap: 10px; justify-content: center; margin: 14px 0 28px; }
.iv .stores a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 16px; border: 1px solid #5a5a5a; border-radius: 12px; color: #fff; font-size: 14px; text-decoration: none; }
.iv h2 { margin: 0 0 12px; text-align: left; color: #9a9a9a; font: 700 12px/1.2 Urbanist, system-ui; letter-spacing: .1em; text-transform: uppercase; }
.iv .plans { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; text-align: left; }
.iv-plan { display: grid; gap: 4px; color: #fff; text-decoration: none; }
.iv-plan img, .iv-plan .ph { width: 100%; aspect-ratio: 4 / 5; height: auto; border-radius: 14px; object-fit: cover; background: #222; }
.iv-plan b { font-size: 15px; } .iv-plan small { color: #9a9a9a; font-size: 13px; }
</style>
<main class="iv">
  ${inv.avatar ? `<img class="av" src="${esc(inv.avatar)}" alt="">` : `<span class="av init" aria-hidden="true">${esc(inv.username.slice(0, 1).toUpperCase())}</span>`}
  <h1>${esc(n)} invited you to Suna</h1>
  <p>Things to do near you, one at a time.</p>
  <a class="open" href="${esc(open)}" data-cta="invite-open">Open in Suna</a>
  <div class="stores"><a href="${esc(STORE(CT.test(ct) ? ct : 'invite-link'))}" data-cta="invite-ios">Download on the App Store</a><a href="${esc(playURL(CT.test(ct) ? ct : 'invite-link', target))}" data-cta="invite-android">Get it on Google Play</a></div>
  ${plans ? `<h2>${esc(n)}’s plans${city ? ` in ${esc(city)}` : ''}</h2><div class="plans">${plans}</div>` : ''}
</main>`;
  return page({ title: `${n} invited you to Suna`, description: `${n} is on Suna. See their plans and find things to do near you.`, canonical: url, image: inv.avatar || (inv.plans[0] && REST_COVER(inv.plans[0].cover_media_path)) || null, body, noindex: true, ct });
}

export default async function handler(req, res) {
  const device = deviceFrom(req.headers && req.headers['user-agent']), ct = ctFrom(req.url), target = targetFrom(req.url);
  let name = '';
  try { name = (new URL(String(req.url || ''), 'https://app.unaryx.com').pathname.match(/^\/u\/([^/]+)\/?$/) || [])[1] || ''; } catch { name = ''; }
  let dec = ''; try { dec = decodeURIComponent(name); } catch { dec = ''; }   // a malformed name keeps the redirect
  const inv = dec ? await loadInviter(dec) : null;
  res.setHeader('X-Robots-Tag', 'noindex');
  if (!inv) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(302).setHeader('Location', targetFor(device, ct, target)).end();
    return;
  }
  res.setHeader('Cache-Control', 'private, no-store');   // the buttons depend on the phone
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(invitePage(inv, { device, ct, target, url: `https://app.unaryx.com/u/${encodeURIComponent(inv.username)}` }));
}

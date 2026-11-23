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

export default function handler(req, res) {
  const to = targetFor(deviceFrom(req.headers && req.headers['user-agent']), ctFrom(req.url), targetFrom(req.url));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(302).setHeader('Location', to).end();
}

// app.unaryx.com/u/<username>: the link inside a person's Suna QR code and
// Share (W-155; the app half is I-316).
//
// With Suna installed, iOS opens the app on this link (AASA /u/*) and it
// never reaches here. Without it there is no page (Brian, 24 Oct: a scan
// should take them to download the app): a 302 by device, the way
// unaryx.com/get answers. iPhone and iPad → the App Store, ct=invite-qr from
// a code (?via=qr), else ct=invite-link; Android → the Android list; a
// computer → /get's QR page. The username is never shown, stored or put in
// ct: the new user finds their friend in the app afterwards. A bad username
// gets the same redirects. Never cached, since the answer depends on the phone.

import { storeURL } from './_clip.js';

/** 'ios', 'android' or 'desktop'. Android first, as /get does. */
export function deviceFrom(ua) {
  const s = String(ua || '');
  if (/Android/i.test(s)) return 'android';
  if (/iPhone|iPad|iPod/.test(s)) return 'ios';
  return 'desktop';
}

/** invite-qr when the link came from a code, else invite-link. */
export function ctFrom(rawURL) {
  let via = '';
  try { via = new URL(String(rawURL || ''), 'https://app.unaryx.com').searchParams.get('via') || ''; } catch { /* none */ }
  return via === 'qr' ? 'invite-qr' : 'invite-link';
}

export function targetFor(device, ct) {
  if (device === 'ios') return storeURL(ct, 'invite-link');
  if (device === 'android') return 'https://unaryx.com/android?from=invite';
  return 'https://unaryx.com/get?ct=invite-link';
}

export default function handler(req, res) {
  const to = targetFor(deviceFrom(req.headers && req.headers['user-agent']), ctFrom(req.url));
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  res.status(302).setHeader('Location', to).end();
}

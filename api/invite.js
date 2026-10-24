// app.unaryx.com/u/<username>: where a Suna profile code or link lands
// (W-155, I5 of OPS-055; the app half is I-316, whose QR is this URL).
//
// With the app installed, iOS opens the app on this link (AASA /u/*) and it
// never reaches here. Without it, this page: "You're invited to Suna", Get
// Suna on the App Store (ct=invite, one token for everyone so App Store
// Connect can show it; never a username in it), "Already have Suna?
// Connect" through the app's own scheme (a universal link never opens the
// app from a page on its own domain), and the Android list.
//
// NO PROFILE DATA YET. The spec's page names the inviter and shows their
// photo and top places, from a public read (public_profile_card). anon
// can't read profiles today, and adding that read is Brian's call (W-155:
// "no new anon read; if one is needed, stop and say so"). So this page
// says nothing about the person: the same for any username that looks like
// one, noindex. When the read exists, the name, photo and places go here.

import { page, send, storeURL, footer, MARK, escapeHtml } from './_clip.js';
import { saveInSuna } from './_maps.js';

const ORIGIN = 'https://app.unaryx.com';
// Usernames as the app allows them; anything else is a broken link.
const USERNAME = /^[a-z0-9._]{2,30}$/i;

export function username(rawURL) {
  const path = String(rawURL || '').split('?')[0];
  const raw = (path.split('/u/')[1] || '').split('/')[0];
  let s = '';
  try { s = decodeURIComponent(raw).trim().replace(/^@/, ''); } catch { /* stays empty */ }
  return USERNAME.test(s) ? s.toLowerCase() : null;
}

export function inviteBody(user) {
  const store = storeURL('invite', 'invite');
  return `<main>
  <div class="clipbar">${MARK}</div>
  <h1 class="venue-h1">You're invited to Suna</h1>
  <p class="empty">See what's on near you this weekend, and the places your friends love.</p>
  <div class="actions">
    <a class="btn" href="${escapeHtml(store)}" rel="noopener">Get Suna on the App Store</a>
    ${user ? saveInSuna(`suna://u/${encodeURIComponent(user)}`, store, 'btn btn-outline', 'Already have Suna? Connect') : ''}
  </div>
  ${user ? '<p class="caption">After it installs, come back and tap Connect.</p>' : ''}
  <p class="note"><a class="link" href="https://unaryx.com/android?from=invite">On Android? Get told when it's ready ›</a></p>
  ${footer()}
</main>`;
}

export default function handler(req, res) {
  const user = username(req.url);
  // /u/ is the full app's link, not an App Clip experience: Safari's banner
  // offers the app and hands it this link (page() would offer the Clip).
  const html = page({
    title: user ? 'You’re invited to Suna' : 'This invite link isn’t complete · Suna',
    description: "See what's on near you this weekend, and the places your friends love, on Suna.",
    canonical: `${ORIGIN}/u/${user || ''}`,
    body: inviteBody(user),
    noindex: true,
    android: { from: 'invite' },
  }).replace('<meta name="apple-itunes-app" content="app-id=6759053765, app-clip-bundle-id=com.unaryx.TravelMug.Clip">',
    `<meta name="apple-itunes-app" content="app-id=6759053765${user ? `, app-argument=${ORIGIN}/u/${encodeURIComponent(user)}` : ''}">`);
  send(res, html, 300);
}

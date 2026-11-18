// W-237 (1) (Ops OPS-217; iOS I-637, in 3.2.6): app.unaryx.com/cp/<code>, the link on a Suna
// checkpoint card's QR code.
//
// With Suna installed the phone opens the app on this link (AASA /cp/*), which logs the find.
// Without it, this page, built to Ops's W1 frame (Figma 3700:6631, Brian's yes 18 Nov 11:40):
// SUNA, "You found a Suna checkpoint", the points card (5 points are waiting), the 24-hour
// line, three steps, the rules link, and both stores at the bottom, on every device.
//
// It never logs a find. The place on the card: checkpoint codes can't be read by the web
// (I-637's RLS: knowing a code is a free find), so until there is an approved way to look a
// code's place up, the card says "This checkpoint" instead of the place name; `place` is the
// slot for it. The code only goes into Play's install referrer (suna_target=/cp/<code>, W-242),
// so the app can open it after the install. Not for search engines.

import { page, send, escapeHtml, segment } from './_clip.js';

const ORIGIN = 'https://app.unaryx.com';
const STORE = 'https://apps.apple.com/app/id6759053765?pt=128539200&ct=checkpoint&mt=8';
const PLAY = 'https://play.google.com/store/apps/details?id=com.unaryx.suna';
const RULES = 'https://unaryx.com/checkpoints';
// What a card carries: letters, digits and dashes. Anything else gets the page without a target.
const CODE = /^[A-Za-z0-9-]{3,40}$/;

/** The code from `/cp/<code>`, or null when it isn't one a card could carry. */
export function codeFrom(rawURL) {
  const s = segment(rawURL, 'cp');
  return CODE.test(s) ? s : null;
}

/** Google Play, the campaign checkpoint, and this card as the page to open after the install (W-242). */
export function playFor(code) {
  const target = code ? `&suna_target=${encodeURIComponent(`/cp/${code}`)}` : '';
  return `${PLAY}&referrer=${encodeURIComponent(`utm_source=suna&utm_campaign=checkpoint${target}`)}`;
}

// Ops's W1: cream ground, ink text, Jersey 15 for SUNA and the headline, Urbanist for the rest.
const CSS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jersey+15&family=Urbanist:wght@500;600;700&display=swap">
<style>
  body { background: #fff9d5; color: #1e160c; }
  .cp { max-width: 390px; min-height: 100vh; min-height: 100svh; margin: 0 auto; padding: 26px 24px 32px; display: flex; flex-direction: column; }
  .cp-body { display: flex; flex-direction: column; gap: 14px; }
  .cp-mark, .cp h1 { margin: 0; font-family: "Jersey 15", monospace; font-weight: 400; color: #1e160c; }
  .cp-mark { font-size: 40px; line-height: 1.2; }
  .cp h1 { font-size: 34px; line-height: 1.2; }
  .cp-card { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 16px; background: rgba(246,203,148,.5); }
  .cp-coin { position: relative; flex: none; width: 34px; height: 34px; }
  .cp-coin img { position: absolute; display: block; }
  .cp-coin .ring { inset: 0; }
  .cp-coin .face { left: 3.4px; top: 3.4px; width: 27.2px; height: 27.2px; }
  .cp-coin span { position: absolute; left: 0; right: 0; top: 7px; text-align: center; font: 400 14.28px/1.2 "Jersey 15", monospace; color: #1e160c; }
  .cp-card p { margin: 0; }
  .cp-place { font: 700 17px/1.2 var(--font); }
  .cp-wait { margin-top: 1px !important; font: 500 14px/1.2 var(--font); color: #78644e; }
  .cp-what { margin: 0; font: 500 16px/23px var(--font); }
  .cp-steps { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 14px; font: 600 15px/1.2 var(--font); }
  .cp-rules { margin: 0; font: 500 13px/1.2 var(--font); color: #78644e; }
  .cp-rules a { color: inherit; }
  .cp-actions { margin-top: auto; padding-top: 32px; display: flex; flex-direction: column; gap: 10px; }
  .cp-actions a { display: flex; align-items: center; justify-content: center; padding: 16px 20px; border-radius: 26px; font: 700 17px/1.2 var(--font); text-decoration: none; }
  .cp-actions .store { background: #1e160c; color: #fff9d5; }
  .cp-actions .play { background: rgba(30,22,12,.06); border: 1px solid rgba(30,22,12,.2); color: #1e160c; }
</style>`;

export function checkpointBody(code, place = null) {
  const where = place ? escapeHtml(place) : 'This checkpoint';
  return `${CSS}<main class="cp">
  <div class="cp-body">
    <p class="cp-mark">SUNA</p>
    <h1>You found a Suna checkpoint</h1>
    <div class="cp-card">
      <span class="cp-coin" aria-hidden="true"><img class="ring" src="/cp/coin-ring.svg" alt="" width="34" height="34"><img class="face" src="/cp/coin-face.png" alt="" width="27.2" height="27.2"><span>5</span></span>
      <div><p class="cp-place">${where}</p><p class="cp-wait">5 points are waiting for you</p></div>
    </div>
    <p class="cp-what">Get Suna and open this link again within 24 hours to keep the points. Most points each week wins a ticket to a Suna event, up to RM100.</p>
    <ol class="cp-steps">
      <li>1. Get Suna (free)</li>
      <li>2. Sign in</li>
      <li>3. Tap “Claim my 5 points” or scan the card again</li>
    </ol>
    <p class="cp-rules">Rules: <a href="${RULES}">unaryx.com/checkpoints</a> · 18+</p>
  </div>
  <div class="cp-actions">
    <a class="store" href="${escapeHtml(STORE)}" rel="noopener" data-android="store" data-cta="checkpoint_app_store">Download on the App Store</a>
    <a class="play" href="${escapeHtml(playFor(code))}" rel="noopener" data-android="store" data-cta="checkpoint_play">Get it on Google Play</a>
  </div>
</main>`;
}

export default async function handler(req, res) {
  const code = codeFrom(req.url);
  send(res, page({
    title: 'You found a Suna checkpoint',
    description: 'Get Suna and open this link again within 24 hours to keep the points. Most points each week wins a ticket to a Suna event, up to RM100.',
    canonical: `${ORIGIN}/cp/${code ? encodeURIComponent(code) : ''}`,
    body: checkpointBody(code),
    noindex: true,
    android: { from: 'checkpoint' },
  }), 3600);
}

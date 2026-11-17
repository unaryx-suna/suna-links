// W-237 (1) (Ops OPS-217; iOS I-637, in 3.2.6): app.unaryx.com/cp/<code>, the link on a Suna
// checkpoint card's QR code.
//
// With Suna installed the phone opens the app on this link (AASA /cp/*), which logs the find.
// Without it, this page: what a checkpoint is, Get Suna (unaryx.com/get, which sends each phone
// to its store), and that the find counts once it is opened in the app. In the found sheet's
// look (I-637: CHECKPOINT label, one big line, one sand button).
//
// It never logs a find and never reads the code: checkpoint codes can't be read by the web
// (I-637's RLS), so the page doesn't know the place and doesn't pretend to. The code only goes
// back into the app's own link (suna://cp/<code>) for "I have Suna". Not for search engines.

import { page, send, escapeHtml, segment } from './_clip.js';

const ORIGIN = 'https://app.unaryx.com';
const GET = 'https://unaryx.com/get?ct=checkpoint';
// What a card carries: letters, digits and dashes. Anything else gets the page without the app link.
const CODE = /^[A-Za-z0-9-]{3,40}$/;

/** The code from `/cp/<code>`, or null when it isn't one a card could carry. */
export function codeFrom(rawURL) {
  const s = segment(rawURL, 'cp');
  return CODE.test(s) ? s : null;
}

const CSS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap">
<style>
  .cp { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; text-align: center; padding: 40px 8px; }
  .cp-label { margin: 0 0 14px; color: var(--sand); font: 400 12px/1 Silkscreen, monospace; letter-spacing: .2em; text-transform: uppercase; }
  .cp h1 { font-size: 30px; line-height: 1.2; margin: 0 0 14px; }
  .cp-what { color: var(--body); font-size: 16px; line-height: 1.5; margin: 0 auto 28px; max-width: 340px; }
  .cp .btn { width: 100%; max-width: 360px; margin: 0 auto 12px; height: 54px; font-size: 17px; font-weight: 700; }
  .cp-note { color: var(--muted); font-size: 13px; line-height: 1.5; margin: 6px auto 0; max-width: 320px; }
  .cp-home { margin-top: 40px; color: var(--muted); font-size: 13px; text-decoration: none; }
</style>`;

export function checkpointBody(code) {
  const open = code ? `<a class="btn btn-outline" href="suna://cp/${escapeHtml(encodeURIComponent(code))}" data-cta="checkpoint_open">I have Suna: open it</a>` : '';
  return `${CSS}<main class="cp">
  <p class="cp-label">Checkpoint</p>
  <h1>You found a Suna checkpoint</h1>
  <p class="cp-what">Checkpoints are cards at places around the city. Open one in Suna and it counts toward your week.</p>
  <a class="btn" href="${GET}" data-cta="checkpoint_get">Get Suna</a>
  ${open}
  <p class="cp-note">The find counts when you open this card in the app. Nothing is saved from this page.</p>
  <a class="cp-home" href="https://unaryx.com">unaryx.com</a>
</main>`;
}

export default async function handler(req, res) {
  const code = codeFrom(req.url);
  send(res, page({
    title: 'You found a Suna checkpoint',
    description: 'Checkpoints are cards at places around the city. Open one in Suna and it counts toward your week.',
    canonical: `${ORIGIN}/cp/${code ? encodeURIComponent(code) : ''}`,
    body: checkpointBody(code),
    noindex: true,
    android: { from: 'checkpoint' },
  }), 3600);
}

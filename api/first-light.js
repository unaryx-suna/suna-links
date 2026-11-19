// W-250 (iOS I-687 (b), Android A-177): app.unaryx.com/first-light, the button in the
// First Light email (trial day 5, sent only to accounts with no push route).
//
// With Suna installed the phone opens the app on this link (AASA /first-light; Android's
// assetlinks covers the whole host, its paths live in the app), which shows the day-5 card.
// Without the app, or on a computer: one plain page, "Open Suna on your phone to see your
// offer.", with the App Store and Google Play buttons. No prices, no sign-in, nothing read
// or logged, not for search engines and not in the sitemap. The query (an email's utm tags)
// is ignored.

import { page, send, escapeHtml, storeURL } from './_clip.js';

const ORIGIN = 'https://app.unaryx.com';
const CT = 'first-light';
const STORE = storeURL(CT, CT);
// W-242: Play's install referrer carries the campaign and this link, so the app opens the
// card after an install.
const PLAY = `https://play.google.com/store/apps/details?id=com.unaryx.suna&referrer=${encodeURIComponent(`utm_source=suna&utm_campaign=${CT}&suna_target=${encodeURIComponent('/first-light')}`)}`;

const CSS = `<style>
  .fl { min-height: 100vh; min-height: 100svh; display: flex; flex-direction: column; justify-content: center; gap: 14px; padding-top: 32px; }
  .fl-mark { margin: 0; font-weight: 700; font-size: 15px; letter-spacing: .08em; color: var(--sand); }
  .fl h1 { margin-bottom: 12px; }
  .fl .btn { width: 100%; }
</style>`;

export function firstLightBody() {
  return `${CSS}<main class="fl">
  <p class="fl-mark">SUNA</p>
  <h1>Open Suna on your phone to see your offer.</h1>
  <a class="btn" href="${escapeHtml(STORE)}" rel="noopener" data-android="store" data-cta="first_light_app_store">Download on the App Store</a>
  <a class="btn btn-outline" href="${escapeHtml(PLAY)}" rel="noopener" data-android="store" data-cta="first_light_play">Get it on Google Play</a>
</main>`;
}

export const STORE_URL = STORE;
export const PLAY_URL = PLAY;

export default function handler(req, res) {
  send(res, page({
    title: 'Your Suna offer',
    description: 'Open Suna on your phone to see your offer.',
    canonical: `${ORIGIN}/first-light`,
    body: firstLightBody(),
    noindex: true,
    android: { from: 'first-light' },
  }), 3600);
}

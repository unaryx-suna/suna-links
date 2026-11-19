// W-250 (iOS I-687 (b), Android A-177): app.unaryx.com/first-light, the button in the
// First Light email (trial day 5, sent only to accounts with no push route).
//
// With Suna installed the phone opens the app on this link (AASA /first-light; Android's
// assetlinks covers the whole host, its paths live in the app), which shows the day-5 card.
// Without the app, or on a computer: one page, "Open Suna on your phone to see your offer.",
// with the App Store and Google Play badges. No prices, no sign-in, nothing read or logged,
// not for search engines and not in the sitemap. The query (an email's utm tags) is ignored.
//
// W-252: Suna's sunrise look, Ops's frames (Figma 3776:7272; phone 3776:7732, desktop
// 3776:7779; Brian approved 19 Nov 13:33). The hero is the frame's own vector, inline, with
// the sun and its glow in one group that rises once on load (CSS only); under
// prefers-reduced-motion it is simply in its end place. The logo files are the frame's
// AppLogo + Suna wordmark; the badges are the official ones unaryx.com uses (assets/stores).

import { page, send, escapeHtml, storeURL } from './_clip.js';

const ORIGIN = 'https://app.unaryx.com';
const CT = 'first-light';
const STORE = storeURL(CT, CT);
// W-242: Play's install referrer carries the campaign and this link, so the app opens the
// card after an install.
const PLAY = `https://play.google.com/store/apps/details?id=com.unaryx.suna&referrer=${encodeURIComponent(`utm_source=suna&utm_campaign=${CT}&suna_target=${encodeURIComponent('/first-light')}`)}`;

// Figma's exported hero vectors (phone 390 x 470, desktop 1440 x 900), ids made unique per copy.
const SKY_PHONE = `<svg class="fl-sky fl-sky-p" viewBox="0 0 390 470" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_p)">
<rect width="390" height="470" fill="url(#paint0_linear_p)"/>
<g class="fl-sun"><g filter="url(#filter0_f_p)">
<ellipse cx="195" cy="344.9" rx="155" ry="99.2" fill="#F6CB94" fill-opacity="0.5"/>
</g>
<circle cx="195" cy="344.9" r="62" fill="url(#paint1_linear_p)"/></g>
<circle cx="32.3818" cy="57.5818" r="1.18182" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="78.8864" cy="141.886" r="0.886364" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="130.177" cy="39.0773" r="1.47727" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="274.182" cy="71.6818" r="1.18182" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="332.386" cy="155.986" r="0.886364" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="359.982" cy="34.0818" r="1.18182" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="215.386" cy="104.286" r="0.886364" fill="#FFF9D5" fill-opacity="0.34"/>
<rect y="423.648" width="26" height="46.3517" fill="#0C0A18"/>
<rect x="28.3638" y="437.91" width="42.5455" height="32.0897" fill="#0C0A18"/>
<rect x="52" y="416.517" width="18.9091" height="53.4828" fill="#0C0A18"/>
<rect x="73.2729" y="430.779" width="33.0909" height="39.2207" fill="#0C0A18"/>
<rect x="108.727" y="398.69" width="11.8182" height="71.3103" fill="#0C0A18"/>
<rect x="122.909" y="377.297" width="11.8182" height="92.7034" fill="#0C0A18"/>
<rect x="139.455" y="416.517" width="21.2727" height="53.4828" fill="#0C0A18"/>
<rect x="165.455" y="366.6" width="9.45455" height="103.4" fill="#0C0A18"/>
<rect x="179.636" y="366.6" width="9.45455" height="103.4" fill="#0C0A18"/>
<rect x="196.182" y="427.214" width="35.4545" height="42.7862" fill="#0C0A18"/>
<rect x="234" y="391.559" width="16.5455" height="78.4414" fill="#0C0A18"/>
<rect x="252.909" y="420.083" width="30.7273" height="49.9172" fill="#0C0A18"/>
<rect x="286" y="405.821" width="23.6364" height="64.1793" fill="#0C0A18"/>
<rect x="312" y="434.345" width="35.4545" height="35.6552" fill="#0C0A18"/>
<rect x="349.818" y="416.517" width="40.1818" height="53.4828" fill="#0C0A18"/>
</g>
<defs>
<filter id="filter0_f_p" x="-54.38" y="151.32" width="498.76" height="387.16" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="47.19" result="effect1_foregroundBlur_p"/>
</filter>
<linearGradient id="paint0_linear_p" x1="195" y1="0" x2="195" y2="470" gradientUnits="userSpaceOnUse">
<stop stop-color="#140F2E"/>
<stop offset="0.55" stop-color="#8A3E9A"/>
<stop offset="1" stop-color="#F69B6E"/>
</linearGradient>
<linearGradient id="paint1_linear_p" x1="195" y1="282.9" x2="195" y2="406.9" gradientUnits="userSpaceOnUse">
<stop stop-color="#FFF9D5"/>
<stop offset="1" stop-color="#F6CB94"/>
</linearGradient>
<clipPath id="clip0_p">
<rect width="390" height="470" fill="white"/>
</clipPath>
</defs>
</svg>`;
const SKY_DESK = `<svg class="fl-sky fl-sky-d" viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
<g clip-path="url(#clip0_d)">
<rect width="1440" height="900" fill="url(#paint0_linear_d)"/>
<g class="fl-sun"><g filter="url(#filter0_f_d)">
<ellipse cx="720" cy="663.5" rx="275" ry="176" fill="#F6CB94" fill-opacity="0.5"/>
</g>
<circle cx="720" cy="663.5" r="110" fill="url(#paint1_linear_d)"/></g>
<circle cx="119.564" cy="112.364" r="4.36364" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="291.273" cy="273.273" r="3.27273" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="480.655" cy="77.4545" r="5.45455" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="1012.36" cy="139.364" r="4.36364" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="1227.27" cy="300.273" r="3.27273" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="1329.16" cy="67.3636" r="4.36364" fill="#FFF9D5" fill-opacity="0.34"/>
<circle cx="795.273" cy="201.273" r="3.27273" fill="#FFF9D5" fill-opacity="0.34"/>
<rect y="811.241" width="96" height="88.7586" fill="#0C0A18"/>
<rect x="104.727" y="838.552" width="157.091" height="61.4483" fill="#0C0A18"/>
<rect x="192" y="797.586" width="69.8182" height="102.414" fill="#0C0A18"/>
<rect x="270.545" y="824.897" width="122.182" height="75.1034" fill="#0C0A18"/>
<rect x="401.455" y="763.448" width="43.6364" height="136.552" fill="#0C0A18"/>
<rect x="453.818" y="722.483" width="43.6364" height="177.517" fill="#0C0A18"/>
<rect x="514.909" y="797.586" width="78.5455" height="102.414" fill="#0C0A18"/>
<rect x="610.909" y="702" width="34.9091" height="198" fill="#0C0A18"/>
<rect x="663.272" y="702" width="34.9091" height="198" fill="#0C0A18"/>
<rect x="724.364" y="818.069" width="130.909" height="81.931" fill="#0C0A18"/>
<rect x="864" y="749.793" width="61.0909" height="150.207" fill="#0C0A18"/>
<rect x="933.818" y="804.414" width="113.455" height="95.5862" fill="#0C0A18"/>
<rect x="1056" y="777.103" width="87.2727" height="122.897" fill="#0C0A18"/>
<rect x="1152" y="831.724" width="130.909" height="68.2759" fill="#0C0A18"/>
<rect x="1291.64" y="797.586" width="148.364" height="102.414" fill="#0C0A18"/>
</g>
<defs>
<filter id="filter0_f_d" x="325" y="367.5" width="790" height="592" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
<feFlood flood-opacity="0" result="BackgroundImageFix"/>
<feBlend mode="normal" in="SourceGraphic" in2="BackgroundImageFix" result="shape"/>
<feGaussianBlur stdDeviation="60" result="effect1_foregroundBlur_d"/>
</filter>
<linearGradient id="paint0_linear_d" x1="720" y1="0" x2="720" y2="900" gradientUnits="userSpaceOnUse">
<stop stop-color="#140F2E"/>
<stop offset="0.55" stop-color="#8A3E9A"/>
<stop offset="1" stop-color="#F69B6E"/>
</linearGradient>
<linearGradient id="paint1_linear_d" x1="720" y1="553.5" x2="720" y2="773.5" gradientUnits="userSpaceOnUse">
<stop stop-color="#FFF9D5"/>
<stop offset="1" stop-color="#F6CB94"/>
</linearGradient>
<clipPath id="clip0_d">
<rect width="1440" height="900" fill="white"/>
</clipPath>
</defs>
</svg>`;

const CSS = `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Urbanist:wght@600;800&display=swap">
<style>
  body { background: #0c0a18; }
  .fl { position: relative; max-width: 480px; min-height: 100vh; min-height: 100svh; margin: 0 auto; padding: 0 0 40px; overflow: hidden; }
  .fl-hero { position: relative; }
  .fl-sky { display: block; width: 100%; height: auto; }
  .fl-sky-d { display: none; }
  .fl-sun { animation: fl-rise 2.4s cubic-bezier(.22,.8,.3,1) both; }
  .fl-sky-p .fl-sun { --rise: 130px; }
  .fl-sky-d .fl-sun { --rise: 230px; }
  @keyframes fl-rise { from { transform: translateY(var(--rise)); opacity: .2; } to { transform: none; opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .fl-sun { animation: none; } }
  .fl-lockup { position: absolute; top: 60px; left: 50%; transform: translateX(-50%); display: flex; align-items: center; gap: 9.7px; }
  .fl-lockup .m { width: 16.2px; height: 34px; }
  .fl-lockup .w { width: 63.5px; height: 21.1px; }
  .fl-copy { position: relative; display: flex; flex-direction: column; align-items: center; padding: 30px 28px 0; text-align: center; }
  .fl h1 { margin: 0; max-width: 334px; font: 800 30px/1.2 Urbanist, var(--font); color: #fff; }
  .fl-badges { display: flex; flex-direction: column; align-items: center; gap: 6px; margin-top: 84px; }
  .fl-badges a { display: block; line-height: 0; }
  .fl-badges .as { height: 54px; width: auto; }
  .fl-badges .gp { height: 78px; width: auto; }
  @media (min-width: 768px) {
    .fl { max-width: none; padding: 0; }
    .fl-hero { position: absolute; inset: 0; }
    .fl-sky-p { display: none; }
    .fl-sky-d { display: block; position: absolute; inset: 0; width: 100%; height: 100%; }
    .fl-lockup { top: 44px; left: 60px; transform: none; gap: 11.2px; }
    .fl-lockup .m { width: 19.1px; height: 40px; }
    .fl-lockup .w { width: 74.7px; height: 24.8px; }
    .fl-copy { padding: 220px 40px 0; }
    .fl h1 { max-width: 800px; font-size: 56px; }
    .fl-badges { flex-direction: row; gap: 14px; margin-top: 60px; }
  }
</style>`;

export function firstLightBody() {
  return `${CSS}<main class="fl">
  <div class="fl-hero">${SKY_PHONE}${SKY_DESK}
    <div class="fl-lockup" role="img" aria-label="Suna"><img class="m" src="/first-light/suna-mark.svg" alt="" width="16" height="34"><img class="w" src="/first-light/suna-wordmark.svg" alt="" width="64" height="21"></div>
  </div>
  <div class="fl-copy">
    <h1>Open Suna on your phone to see your offer.</h1>
    <div class="fl-badges">
      <a href="${escapeHtml(STORE)}" rel="noopener" data-android="store" data-cta="first_light_app_store"><img class="as" src="/first-light/app-store.svg" alt="Download on the App Store" width="162" height="54"></a>
      <a href="${escapeHtml(PLAY)}" rel="noopener" data-android="store" data-cta="first_light_play"><img class="gp" src="/first-light/google-play.png" alt="Get it on Google Play" width="202" height="78"></a>
    </div>
  </div>
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

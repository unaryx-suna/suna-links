// W-309 W3b (Ops - Design 24 Nov 00:28) on /i/: FIX 1 skeleton + fade, 2 white stop markers, 3 Suna's pick chip,
// 4 comma title, 10 one sticky Copy, BETTER 3 Open in your browser, BETTER 4 desktop QR. `node w309.test.mjs`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const stops = [0, 1, 2, 3, 4].map((i) => ({ order_index: i, place_name: `Stop ${i + 1}`, city_name: 'Ipoh', suggested_time: `${9 + i}:00`, duration_label: '1h',
  creator_note: '', latitude: 4.6, longitude: 101.1, landmark_id: null, category: 'Food', country_code: 'MY', place_image_url: null, moment_path: null, moment_bucket: null }));
globalThis.fetch = async (url) => {
  const u = String(url), ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b) });
  if (u.includes('/rest/v1/public_itineraries')) return ok([{ id: 'p1', name: 'A quieter day in Ipoh', intro_story: 'Old town.', resolved_city_name: 'Ipoh', partner_slug: 'suna', partner_name: 'Suna', cover_media_path: null }]);
  if (u.includes('/rest/v1/public_itinerary_stops')) return ok(stops);
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
};
const { default: handler } = await import('./api/itinerary.js');
let html = '';
await handler({ url: '/i/a-quieter-day-in-ipoh--abc123', headers: { host: 'app.unaryx.com' } },
  { setHeader() { return this; }, status() { return this; }, send(b) { html = b; return this; }, end(b) { html = b || html; return this; } });
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
console.log('w309');
t('FIX 4: title, og:title and og:image:alt say "A quieter day in Ipoh, by Suna" (no dash)', () => {
  assert.match(html, /<title>A quieter day in Ipoh, by Suna<\/title>/); assert.match(html, /property="og:title" content="A quieter day in Ipoh, by Suna"/); assert.doesNotMatch(html, / — by /);
});
t('FIX 2 + 3: stop markers white with ink numbers, a white 30% dashed line; Suna\'s pick is a white 20% chip', () => {
  assert.match(html, /\.num\{[^}]*background:#fff;color:#140F2E;/); assert.match(html, /border-left:2px dashed rgba\(255,255,255,\.3\)/);
  assert.match(html, /\.pick:not\(\.creator\)\{background:rgba\(255,255,255,\.2\);color:#fff\}/);
});
t('FIX 1: the cover holds a white 8% block and fades the photo in; Suna\'s mark on white 12%; no-script shows the photo', () => {
  assert.match(html, /\.cover\{background:rgba\(255,255,255,\.08\)\}/); assert.match(html, /\.by-mark\{background:rgba\(255,255,255,\.12\)!important\}/);
  assert.match(html, /<noscript><style>\.cover-img\{opacity:1\}<\/style><\/noscript>/);
});
t('FIX 10: ONE id="cta" (sticky, with "Free on iPhone and Android"); the locked card\'s Copy is its data-open-suna twin', () => {
  assert.equal((html.match(/id="cta"/g) || []).length, 1);
  assert.match(html, /<div class="stick"><a class="cta copy" id="cta"[^>]*>[\s\S]*Copy this plan to Suna<\/a><p>Free on iPhone and Android<\/p>/);
  assert.match(html, /<a class="cta copy" data-open-suna href=/);
});
t('BETTER 3 + 4: "Open in your browser" (hidden until an in-app browser) and the desktop QR to this plan', () => {
  assert.match(html, /<a class="inapp" id="inapp" href="#" hidden>Open in your browser<\/a>/);
  assert.match(html, /<img src="https:\/\/unaryx\.com\/api\/qr\?i=a-quieter-day-in-ipoh--abc123"[^>]*alt="QR code for this plan"/);
  const shell = readFileSync(new URL('./public/i.html', import.meta.url), 'utf8');
  assert.match(shell, /Instagram\|FBAN\|FBAV/); assert.match(shell, /x-safari-https:/); assert.match(shell, /package=com\.android\.chrome/);
});
console.log(bad ? `\n✗ ${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

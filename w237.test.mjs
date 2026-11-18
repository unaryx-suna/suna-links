// W-237 (1): app.unaryx.com/cp/<code>. The AASA claims /cp/* (the app logs the find); without
// the app, a page that never reads the code or logs anything. `node w237.test.mjs`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let calls = 0;
globalThis.fetch = async () => { calls++; return { ok: true, status: 200, json: async () => [] }; };
const { default: handler, codeFrom, checkpointBody } = await import('./api/checkpoint.js');
async function call(url) {
  const o = { code: 0, hdr: {}, body: '' };
  const res = { status(c) { o.code = c; return this; }, setHeader(k, v) { o.hdr[k.toLowerCase()] = v; return this; }, send(b) { o.body = b; return this; }, end() { return this; } };
  await handler({ url, headers: { host: 'app.unaryx.com' } }, res);
  return o;
}
let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('the AASA claims /cp/* after the others, appclips unchanged; /cp/* is routed to the page; assetlinks unchanged (Android paths live in the app)', () => {
  const a = JSON.parse(readFileSync('public/.well-known/apple-app-site-association', 'utf8'));
  assert.deepEqual(a.applinks.details[0].components.map((c) => c['/']).slice(-2), ['/u/*', '/cp/*']);
  assert.deepEqual(a.appclips, { apps: ['29XRVFHL4F.com.unaryx.TravelMug.Clip'] });
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(v.rewrites.find((r) => r.source === '/cp/:path*'), { source: '/cp/:path*', destination: '/api/checkpoint' });
});
await t('W1 (Figma 3700:6631): SUNA, the headline, the 5-point card, the 24-hour line, three steps, rules, both stores; noindex; cached', async () => {
  const r = await call('/cp/KL-KWAI-01');
  assert.equal(r.code, 200);
  assert.match(r.body, /<meta name="robots" content="noindex">/);
  assert.match(r.body, /<p class="cp-mark">SUNA<\/p>\s*<h1>You found a Suna checkpoint<\/h1>/);
  assert.match(r.body, /<p class="cp-place">This checkpoint<\/p><p class="cp-wait">5 points are waiting for you<\/p>/);
  assert.match(r.body, /<img class="ring" src="\/cp\/coin-ring\.svg"[^>]*><img class="face" src="\/cp\/coin-face\.png"[^>]*><span>5<\/span>/);
  assert.ok(r.body.includes('Get Suna and open this link again within 24 hours to keep the points. Most points each week wins a ticket to a Suna event, up to RM100.'));
  for (const step of ['1. Get Suna (free)', '2. Sign in', '3. Tap “Claim my 5 points” or scan the card again']) assert.ok(r.body.includes(`<li>${step}</li>`), step);
  assert.match(r.body, /Rules: <a href="https:\/\/unaryx\.com\/checkpoints">unaryx\.com\/checkpoints<\/a> · 18\+/);
  assert.match(r.body, /<a class="store" href="https:\/\/apps\.apple\.com\/app\/id6759053765\?pt=128539200&amp;ct=checkpoint&amp;mt=8" rel="noopener" data-android="store"[^>]*>Download on the App Store<\/a>/);
  // W-242: Play with the campaign checkpoint and this card as the page to open after the install.
  const play = r.body.match(/<a class="play" href="([^"]+)"[^>]*data-android="store"[^>]*>Get it on Google Play<\/a>/);
  assert.ok(play, 'the Play button');
  const ref = new URL(play[1].replace(/&amp;/g, '&')).searchParams.get('referrer');
  assert.equal(ref, 'utm_source=suna&utm_campaign=checkpoint&suna_target=%2Fcp%2FKL-KWAI-01');
  assert.match(r.hdr['cache-control'], /s-maxage=3600/);
  for (const f of ['public/cp/coin-ring.svg', 'public/cp/coin-face.png']) assert.ok(readFileSync(f).length > 100, f);
});
await t('never reads the code or logs a find: no request at all, and no place is named', async () => {
  calls = 0;
  await call('/cp/KL-KWAI-01');
  assert.equal(calls, 0);
});
await t('a code a card couldn\'t carry: the same page without a target, nothing echoed', async () => {
  assert.equal(codeFrom('/cp/%3Cscript%3E'), null);
  assert.equal(codeFrom('/cp/ab'), null);
  assert.equal(codeFrom('/cp/KL-KWAI-01?x=1'), 'KL-KWAI-01');
  const r = await call('/cp/%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  assert.equal(r.code, 200);
  assert.doesNotMatch(r.body, /suna_target|<script>alert/);
  assert.match(checkpointBody(null), /utm_campaign%3Dcheckpoint"/, 'Play without a target');
});
process.exit(bad ? 1 : 0);

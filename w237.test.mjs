// W-237 (1): app.unaryx.com/cp/<code>. The AASA claims /cp/* (the app logs the find); without
// the app, a page that never reads the code or logs anything. `node w237.test.mjs`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The place lookup (Brian 18 Nov: "yes, place lookup"): one read of checkpoints → landmarks(name).
let calls = 0, seen = [], answer = () => ({ ok: true, status: 200, json: async () => [] });
globalThis.fetch = async (url, opts) => { calls++; seen.push({ url: String(url), opts }); return answer(); };
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key-for-tests';
const { default: handler, codeFrom, checkpointBody, placeFor } = await import('./api/checkpoint.js');
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
  assert.deepEqual(a.applinks.details[0].components.map((c) => c['/']).slice(-6, -4), ['/u/*', '/cp/*']);
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
  assert.match(r.body, /Rules: <a href="https:\/\/unaryx\.com\/checkpoints">unaryx\.com\/checkpoints<\/a>, 18\+/);
  assert.match(r.body, /<a class="store" href="https:\/\/apps\.apple\.com\/app\/id6759053765\?pt=128539200&amp;ct=print&amp;mt=8" rel="noopener" data-android="store"[^>]*>Download on the App Store<\/a>/);
  // W-242: Play with the campaign checkpoint and this card as the page to open after the install.
  const play = r.body.match(/<a class="play" href="([^"]+)"[^>]*data-android="store"[^>]*>Get it on Google Play<\/a>/);
  assert.ok(play, 'the Play button');
  const ref = new URL(play[1].replace(/&amp;/g, '&')).searchParams.get('referrer');
  assert.equal(ref, 'utm_source=suna&utm_campaign=checkpoint&suna_target=%2Fcp%2FKL-KWAI-01');
  assert.match(r.hdr['cache-control'], /s-maxage=3600/);
  for (const f of ['public/cp/coin-ring.svg', 'public/cp/coin-face.png']) assert.ok(readFileSync(f).length > 100, f);
});
await t('place lookup: an active code shows its place name; the read asks only for the name, server-side, with a timeout', async () => {
  seen = [];
  answer = () => ({ ok: true, status: 200, json: async () => [{ landmarks: { name: 'Emspaced @ KL Sentral' } }] });
  const r = await call('/cp/AbCdE12345');
  assert.match(r.body, /<p class="cp-place">Emspaced @ KL Sentral<\/p>/);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, 'https://voogrbonwmvfwtgzzrxc.supabase.co/rest/v1/checkpoints?code=eq.abcde12345&active=is.true&select=landmarks(name)&limit=1');
  assert.equal(seen[0].opts.headers.apikey, 'service-key-for-tests');
  assert.ok(seen[0].opts.signal, 'a timeout');
  assert.ok(!seen[0].opts.method || seen[0].opts.method === 'GET', 'a read, never a write');
  assert.doesNotMatch(r.body, /service-key-for-tests/);
  // A name is escaped.
  answer = () => ({ ok: true, status: 200, json: async () => [{ landmarks: { name: '<b>x</b>' } }] });
  assert.match((await call('/cp/abcde12345')).body, /<p class="cp-place">&lt;b&gt;x&lt;\/b&gt;<\/p>/);
});
await t('place lookup: unknown, inactive, failed, slow or no key → "This checkpoint"; a code not of the database\'s shape is never looked up; no find is ever logged', async () => {
  for (const a of [() => ({ ok: true, status: 200, json: async () => [] }), () => ({ ok: false, status: 500, json: async () => ({}) }), () => { throw new Error('down'); }, () => ({ ok: true, status: 200, json: async () => [{ landmarks: null }] })]) {
    answer = a;
    assert.match((await call('/cp/abcde12345')).body, /<p class="cp-place">This checkpoint<\/p>/);
  }
  calls = 0;
  for (const c of ['KL-KWAI-01', 'abc', 'a'.repeat(17), 'abc-def-12']) await call('/cp/' + c);
  assert.equal(calls, 0, 'only 6-16 lowercase letters and digits are looked up');
  assert.equal(await placeFor('abcde12345', ''), null, 'no key: no read');
  for (const { url, opts } of seen) assert.doesNotMatch(url + JSON.stringify(opts || {}), /log_checkpoint_find|checkpoint_finds|rpc\//);
  answer = () => ({ ok: true, status: 200, json: async () => [] });
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

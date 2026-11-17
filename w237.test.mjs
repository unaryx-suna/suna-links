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
await t('the page: CHECKPOINT, what it is, Get Suna via unaryx.com/get, the app link with the code; noindex; cached', async () => {
  const r = await call('/cp/KL-KWAI-01');
  assert.equal(r.code, 200);
  assert.match(r.body, /<meta name="robots" content="noindex">/);
  assert.match(r.body, /<p class="cp-label">Checkpoint<\/p>\s*<h1>You found a Suna checkpoint<\/h1>/);
  assert.match(r.body, /<a class="btn" href="https:\/\/unaryx\.com\/get\?ct=checkpoint" data-cta="checkpoint_get">Get Suna<\/a>/);
  assert.match(r.body, /href="suna:\/\/cp\/KL-KWAI-01"[^>]*>I have Suna: open it<\/a>/);
  assert.match(r.body, /The find counts when you open this card in the app\. Nothing is saved from this page\./);
  assert.match(r.hdr['cache-control'], /s-maxage=3600/);
});
await t('never reads the code or logs a find: no request at all, and no place is named', async () => {
  calls = 0;
  await call('/cp/KL-KWAI-01');
  assert.equal(calls, 0);
});
await t('a code a card couldn\'t carry: the same page without the app link, nothing echoed', async () => {
  assert.equal(codeFrom('/cp/%3Cscript%3E'), null);
  assert.equal(codeFrom('/cp/ab'), null);
  assert.equal(codeFrom('/cp/KL-KWAI-01?x=1'), 'KL-KWAI-01');
  const r = await call('/cp/%3Cscript%3Ealert(1)%3C%2Fscript%3E');
  assert.equal(r.code, 200);
  assert.doesNotMatch(r.body, /suna:\/\/cp|<script>alert/);
  assert.doesNotMatch(checkpointBody(null), /suna:\/\//);
});
process.exit(bad ? 1 : 0);

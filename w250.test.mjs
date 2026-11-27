// W-250 (iOS I-687 (b), Android A-177): app.unaryx.com/first-light, the First Light email's
// button. The AASA claims it; without the app, a plain noindex page with both stores, no prices.
// `node w250.test.mjs`
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let calls = 0;
globalThis.fetch = async () => { calls++; throw new Error('no network'); };
const { default: handler, STORE_URL, PLAY_URL } = await import('./api/first-light.js');
function call(url, ua = 'Mozilla/5.0 (Macintosh)') {
  const o = { code: 0, hdr: {}, body: '' };
  const res = { status(c) { o.code = c; return this; }, setHeader(k, v) { o.hdr[k.toLowerCase()] = v; return this; }, send(b) { o.body = b; return this; }, end() { return this; } };
  handler({ url, headers: { host: 'app.unaryx.com', 'user-agent': ua } }, res);
  return o;
}
let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('the AASA claims /first-light (exact path) after the others, appID and appclips unchanged', () => {
  const a = JSON.parse(readFileSync('public/.well-known/apple-app-site-association', 'utf8'));
  const paths = a.applinks.details[0].components.map((c) => c['/']);
  assert.deepEqual(paths, ['/place/*', '/trip/*', '/i/*', '/city/*', '/c/*', '/e/*', '/u/*', '/cp/*', '/first-light', '/pro', '/pro/*', '/q/remind']);
  assert.deepEqual(a.applinks.details[0].appIDs, ['29XRVFHL4F.com.unaryx.TravelMug']);
  assert.deepEqual(a.appclips, { apps: ['29XRVFHL4F.com.unaryx.TravelMug.Clip'] });
});
await t('vercel.json routes /first-light to the page; assetlinks unchanged (whole host, Android paths live in the app)', () => {
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  assert.deepEqual(v.rewrites.find((r) => r.source === '/first-light'), { source: '/first-light', destination: '/api/first-light' });
  const al = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
  assert.deepEqual(al[0].relation, ['delegate_permission/common.handle_all_urls']);
  assert.equal(al[0].target.package_name, 'com.unaryx.suna');
});
await t('the page: 200, noindex, the one line, both stores; no price, no sign-in, nothing read', () => {
  for (const u of ['/first-light', '/first-light?utm_source=email&utm_campaign=first_light']) {
    const r = call(u);
    assert.equal(r.code, 200, u);
    assert.match(r.hdr['content-type'], /^text\/html/);
    assert.match(r.body, /<meta name="robots" content="noindex">/);
    assert.match(r.body, /<link rel="canonical" href="https:\/\/app\.unaryx\.com\/first-light">/);
    assert.ok(r.body.includes('<h1>Open Suna on your phone to see your offer.</h1>'));
    assert.match(r.body, /<img class="as" src="\/first-light\/app-store\.svg" alt="Download on the App Store"/);
    assert.match(r.body, /<img class="gp" src="\/first-light\/google-play\.png" alt="Get it on Google Play"/);
    assert.doesNotMatch(r.body, /US\$|RM\s?\d|\$\d|per month|\/mo\b|sign[ -]?in|log[ -]?in|password/i);
    assert.doesNotMatch(r.body, /utm_source=email/, 'the query is not echoed');
  }
  assert.equal(calls, 0, 'no fetch');
});
await t('store links: Apple ct=first-light with pt; Play referrer has the campaign and suna_target=/first-light', () => {
  assert.equal(STORE_URL, 'https://apps.apple.com/app/id6759053765?pt=128539200&ct=first-light&mt=8');
  const q = new URLSearchParams(new URL(PLAY_URL).searchParams.get('referrer'));
  assert.equal(q.get('utm_source'), 'suna');
  assert.equal(q.get('utm_campaign'), 'first-light');
  assert.equal(q.get('suna_target'), '/first-light');
});
await t('W-252: the sunrise look: both hero vectors inline with unique ids, the sun rises once, reduced motion ends still; assets exist', () => {
  const b = call('/first-light').body;
  assert.equal((b.match(/<svg class="fl-sky fl-sky-p"/g) || []).length, 1);
  assert.equal((b.match(/<svg class="fl-sky fl-sky-d"/g) || []).length, 1);
  const ids = [...b.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length, 'no duplicate ids');
  for (const c of ['#140F2E', '#8A3E9A', '#F69B6E', '#FFF9D5', '#F6CB94', '#0C0A18']) assert.ok(b.includes(c), c);
  assert.equal((b.match(/<g class="fl-sun">/g) || []).length, 2);
  assert.match(b, /\.fl-sun \{ animation: fl-rise [^}]* both; \}/);
  assert.doesNotMatch(b, /infinite/);
  assert.match(b, /@media \(prefers-reduced-motion: reduce\) \{ \.fl-sun \{ animation: none; \} \}/);
  assert.match(b, /family=Urbanist:wght@600;800/);
  assert.doesNotMatch(b, /figma\.com/);
  for (const f of ['suna-mark.svg', 'suna-wordmark.svg', 'app-store.svg', 'google-play.png']) {
    assert.ok(b.includes(`/first-light/${f}`), f);
    assert.ok(readFileSync(`public/first-light/${f}`).length > 500, f + ' on disk');
  }
});
await t('not in the sitemap or robots allow-list', () => {
  assert.doesNotMatch(readFileSync('api/sitemap.js', 'utf8'), /first-light/);
  assert.doesNotMatch(readFileSync('public/robots.txt', 'utf8'), /first-light/);
});

if (bad) { console.log(`\n✗ ${bad} failed`); process.exit(1); }
console.log('\n✓ W-250');

// W-246 (Ops OPS-236): Apple's App Store link carries one ct per channel
// (partner-* → partners, creator-* → creators, checkpoint/print/sticker and /c/
// codes → print); Google Play keeps the full ct. The same rule as unaryx.com's
// api/_lib/asc.js. `node w246.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { appleCt, storeURL } from './api/_clip.js';
import invite from './api/invite.js';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const CASES = ['partner-worq-ttdi', 'creator-elina-lotus', 'checkpoint', 'print', 'print-kl', 'sticker-ttdi', 'whatsapp-channel', 'promo-aina-ttdi', 'ad-meta-p1', 'web-i', 'invite-qr', 'partners', 'printer', ''];

await t('the mapping, the same as unaryx.com\'s asc.js', () => {
  assert.deepEqual(CASES.map(appleCt), ['partners', 'creators', 'print', 'print', 'print', 'print', 'whatsapp-channel', 'promo-aina-ttdi', 'ad-meta-p1', 'web-i', 'invite-qr', 'partners', 'printer', '']);
  const site = new URL('../../unaryx-site/api/_lib/asc.js', import.meta.url);
  if (existsSync(site)) { const asc = createRequire(import.meta.url)(site.pathname); assert.deepEqual(CASES.map(asc.appleCt), CASES.map(appleCt), 'both repos agree'); }
  assert.equal(storeURL('partner-worq-ttdi', 'web-c'), 'https://apps.apple.com/app/id6759053765?pt=128539200&ct=partners&mt=8');
});

await t('/u/: iPhone gets the channel, Android\'s Play keeps the full ct', () => {
  let L; const res = { setHeader(k, v) { if (k === 'Location') L = v; return res; }, status() { return res; }, end() {} };
  invite({ url: '/u/aina?ct=creator-elina-lotus', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)' } }, res);
  assert.match(L, /ct=creators&/);
  invite({ url: '/u/aina?ct=creator-elina-lotus', headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14)' } }, res);
  assert.match(decodeURIComponent(new URL(L).searchParams.get('referrer')), /utm_campaign=creator-elina-lotus/);
});

await t('the hard-coded links: checkpoint → print; i.html groups its via; no ct=partner-/creator- left in an App Store link', () => {
  assert.match(readFileSync('api/checkpoint.js', 'utf8'), /ct=print&mt=8/);
  assert.match(readFileSync('public/i.html', 'utf8'), /ct = \/\^partner-\/\.test\(ct\) \? 'partners'/);
  for (const f of ['api/checkpoint.js', 'api/invite.js', 'api/place.js', 'api/event.js', 'api/venue.js', 'api/_clip.js', 'public/i.html', 'public/index.html', 'public/city.html', 'public/trip.html']) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /apps\.apple\.com\/[^"'\s<>`]*?ct=(partner|creator)-/, f);
  }
});

// android.js in a tiny fake DOM: an App Store link that says the channel hands Play the full ct.
function swap(url, htmlCt, appHref) {
  const u = new URL(url), attrs = { href: appHref };
  const a = { nodeType: 1, className: 'btn', firstChild: null, textContent: 'Get Suna', parentNode: null, nextElementSibling: null,
    getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); }, hasAttribute: (k) => k in attrs, removeAttribute: (k) => { delete attrs[k]; }, querySelectorAll: () => [],
    set href(v) { attrs.href = v; }, get href() { return attrs.href; } };
  a.parentNode = { nodeType: 1, children: [a], nextElementSibling: null };
  vm.runInNewContext(readFileSync('public/android.js', 'utf8'), {
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14)' }, window: {}, URL, URLSearchParams, encodeURIComponent,
    document: { currentScript: { getAttribute: (k) => (k === 'data-from' ? 'venue' : null) }, querySelectorAll: () => [a], body: {}, addEventListener() {}, documentElement: { getAttribute: (k) => (k === 'data-ct' ? htmlCt : null) } },
    location: { href: u.href, pathname: u.pathname, search: u.search }, getComputedStyle: () => ({ display: 'block', flexDirection: 'row' }), MutationObserver: class { observe() {} },
  });
  return new URLSearchParams(new URL(attrs.href).searchParams.get('referrer')).get('utm_campaign');
}
await t('Android: Play keeps the full ct — from the page\'s data-ct (/c/), its ?via= (/i/) or ?src= (/place/); a mismatched one is never borrowed', () => {
  const A = (ct) => `https://apps.apple.com/app/id6759053765?pt=128539200&ct=${ct}&mt=8`;
  assert.equal(swap('https://app.unaryx.com/c/worq-ttdi', 'partner-worq-ttdi', A('print')), 'partner-worq-ttdi', 'a /c/ card is print for Apple; Play gets the venue\'s own ct');
  assert.equal(swap('https://app.unaryx.com/c/x', 'sticker-ttdi', A('print')), 'sticker-ttdi');
  assert.equal(swap('https://app.unaryx.com/i/kl-nights?via=creator-elina-lotus', null, A('creators')), 'creator-elina-lotus');
  assert.equal(swap('https://app.unaryx.com/place/aquaria-klcc?src=partner-aquaria', null, A('partners')), 'partner-aquaria');
  assert.equal(swap('https://app.unaryx.com/e/x?via=partner-worq-ttdi', null, A('creators')), 'creators', 'a partner via is not a creator');
  assert.equal(swap('https://app.unaryx.com/e/x', null, A('promo-aina-ttdi')), 'promo-aina-ttdi');
});

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ all W-246 checks pass\n');
process.exit(bad ? 1 : 0);

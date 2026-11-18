// W-242 (Brian 18 Nov; Android half A-167): on Android the Play link carries
// the page in the install referrer (suna_target=<path>) so the app opens it
// after the install. Only /i/, /e/, /place/, /u/, /cp/ paths; never the
// query; 200 encoded characters at most. ct stays the campaign (W-230); with
// no clean ct, the page kind. public/android.js runs in a tiny fake DOM here,
// so this needs no browser. `node w242.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import invite, { targetFrom, playURL } from './api/invite.js';

const SRC = readFileSync(new URL('./public/android.js', import.meta.url), 'utf8');
const PLAY = 'https://play.google.com/store/apps/details?id=com.unaryx.suna';
let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

/** Runs the script on `url` (page kind `from`) with one App Store button; returns its href after the swap. */
function swapOn(url, from, appHref = 'https://apps.apple.com/app/id6759053765?pt=128539200&mt=8') {
  const u = new URL(url);
  const attrs = { href: appHref };
  const a = {
    nodeType: 1, className: 'btn', firstChild: null, textContent: 'Get Suna', parentNode: null, nextElementSibling: null,
    getAttribute: (k) => (k in attrs ? attrs[k] : null), setAttribute: (k, v) => { attrs[k] = String(v); },
    hasAttribute: (k) => k in attrs, removeAttribute: (k) => { delete attrs[k]; }, querySelectorAll: () => [],
    set href(v) { attrs.href = v; }, get href() { return attrs.href; },
  };
  a.parentNode = { nodeType: 1, children: [a], nextElementSibling: null };
  const doc = {
    currentScript: { getAttribute: (k) => (k === 'data-from' ? from : null) },
    querySelectorAll: () => [a], body: {}, addEventListener() {},
  };
  const win = {};
  vm.runInNewContext(SRC, {
    navigator: { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8)' }, document: doc, window: win,
    location: { href: u.href, pathname: u.pathname, search: u.search }, URL, encodeURIComponent,
    getComputedStyle: () => ({ display: 'block', flexDirection: 'row' }), MutationObserver: class { observe() {} },
  });
  return attrs.href;
}
const ref = (href) => new URL(href).searchParams.get('referrer');

t('each page kind carries its own path (encoded), the ct or the page kind as the campaign', () => {
  for (const [url, from, want] of [
    ['https://app.unaryx.com/i/chiang-mai--mmutgrh6sn?s=SHARETOKEN&ct=x', 'itinerary', '/i/chiang-mai--mmutgrh6sn'],
    ['https://app.unaryx.com/e/11111111-1111-4111-8111-111111111111', 'event', '/e/11111111-1111-4111-8111-111111111111'],
    ['https://app.unaryx.com/place/aquaria-klcc', 'place', '/place/aquaria-klcc'],
    ['https://app.unaryx.com/cp/KL-0042/', 'checkpoint', '/cp/KL-0042'],
  ]) {
    const r = ref(swapOn(url, from));
    assert.equal(r, `utm_source=suna&utm_campaign=${from}&suna_target=${encodeURIComponent(want)}`, url);
    // What the app reads after Play hands the referrer over.
    assert.equal(new URLSearchParams(r).get('suna_target'), want);
  }
});

t('a clean ct on the button stays the campaign (promoter credit unchanged)', () => {
  const r = ref(swapOn('https://app.unaryx.com/place/aquaria-klcc', 'place', 'https://apps.apple.com/app/id6759053765?pt=128539200&ct=promo-aina-ttdi&mt=8'));
  assert.equal(r, 'utm_source=suna&utm_campaign=promo-aina-ttdi&suna_target=%2Fplace%2Faquaria-klcc');
});

t('never the query: share tokens, emails and ids in it are not carried', () => {
  const r = ref(swapOn('https://app.unaryx.com/i/kl-nights-abc?s=tok123&email=a%40b.com&uid=42', 'itinerary'));
  assert.doesNotMatch(r, /tok123|a@b|email|uid|s=/);
});

t('any other path, an odd one or a too-long one: no target, and the link still goes to Play', () => {
  for (const url of ['https://app.unaryx.com/', 'https://app.unaryx.com/city/kuala-lumpur', 'https://app.unaryx.com/c/worq-ttdi',
    'https://app.unaryx.com/i/a%20b', 'https://app.unaryx.com/e/<script>', 'https://app.unaryx.com/i/x/extra',
    'https://app.unaryx.com/place/' + 'a'.repeat(121), 'https://app.unaryx.com/i/' + 'a'.repeat(101)]) {
    const href = swapOn(url, 'city');
    assert.ok(href.startsWith(PLAY), url);
    assert.doesNotMatch(ref(href) || '', /suna_target/, url);
  }
  // No ct and no kind and no target: the plain listing.
  assert.equal(swapOn('https://app.unaryx.com/', ''), PLAY);
});

t('the encoded target is 200 characters at most', () => {
  // /place/ + 120 = 127 characters, encoded 131 (fits); every shape's longest fits.
  const r = ref(swapOn('https://app.unaryx.com/place/' + 'a'.repeat(120), 'place'));
  const tgt = new URLSearchParams(r).get('suna_target');
  assert.equal(tgt, '/place/' + 'a'.repeat(120));
  assert.ok(encodeURIComponent(tgt).length <= 200);
});

t('/u/<username> (server redirect): the profile rides in the referrer; a bad username is left out', () => {
  assert.equal(targetFrom('/u/Elina.lotus?via=qr'), '%2Fu%2FElina.lotus');
  for (const u of ['/u/', '/u/bad%20name', '/u/' + 'a'.repeat(41), '/u/a/b', '/x/Elina']) assert.equal(targetFrom(u), '', u);
  let L; const res = { setHeader(k, v) { if (k === 'Location') L = v; return res; }, status() { return res; }, end() {} };
  invite({ url: '/u/Elina.lotus?via=qr', headers: { 'user-agent': 'Mozilla/5.0 (Linux; Android 14)' } }, res);
  assert.equal(ref(L), 'utm_source=suna&utm_campaign=invite-qr&suna_target=%2Fu%2FElina.lotus');
  invite({ url: '/u/Elina.lotus', headers: { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X)' } }, res);
  assert.doesNotMatch(L, /Elina/, 'never in the App Store link');
  assert.equal(playURL('', ''), PLAY);
});

t('off Android nothing changes', () => {
  assert.match(SRC, /^\s*if \(!\/Android\/i\.test\(navigator\.userAgent\)\) return;/m);
});

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ all W-242 checks pass\n');
process.exit(bad ? 1 : 0);

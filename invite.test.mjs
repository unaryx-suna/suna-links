// W-155: app.unaryx.com/u/<username> without Suna: a 302 by device, no page.
// Plain node: `node invite.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import handler, { ctFrom } from './api/invite.js';

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
const call = (url, ua) => { const o = { code: 0, h: {}, body: null }; handler({ url, headers: { 'user-agent': ua } }, { status(c) { o.code = c; return this; }, setHeader(k, v) { o.h[k] = v; return this; }, end(b) { o.body = b ?? ''; return this; }, send(b) { o.body = b; return this; } }); return o; };
const STORE = (ct) => `https://apps.apple.com/app/id6759053765?pt=128539200&ct=${ct}&mt=8`;

t('iPhone, iPad, in-app browsers → the App Store: ct=invite-qr from a code, else invite-link; never the username', () => {
  for (const ua of [UA.iphone, UA.instagram, UA.ipad]) {
    const q = call('/u/aina?via=qr', ua);
    assert.equal(q.code, 302);
    assert.equal(q.h.Location, STORE('invite-qr'));
    assert.equal(call('/u/aina', ua).h.Location, STORE('invite-link'));
    assert.equal(call('/u/aina?via=share', ua).h.Location, STORE('invite-link'));
    assert.doesNotMatch(q.h.Location, /aina/);
  }
  assert.equal(ctFrom('/u/aina?via=qr'), 'invite-qr');
});

t('W-159: the App Store link has no storefront (/au/), as /get', () => {
  for (const u of ['/u/aina', '/u/aina?via=qr', '/u/aina?ct=ask-invite']) {
    const l = call(u, UA.iphone).h.Location;
    assert.doesNotMatch(l, /apps\.apple\.com\/[a-z]{2}\//, u);
    assert.match(l, /^https:\/\/apps\.apple\.com\/app\/id6759053765\?pt=128539200&ct=[a-z0-9-]+&mt=8$/, u);
  }
});

t('W-159: an allowed ct on the link goes through (the Ask Suna invite); anything else keeps the default', () => {
  assert.equal(call('/u/aina?via=ask-for-sam&ct=ask-invite', UA.iphone).h.Location, STORE('ask-invite'));
  assert.equal(call('/u/aina?via=qr&ct=ask-invite', UA.iphone).h.Location, STORE('ask-invite'), 'the link’s own ct wins');
  for (const bad of ['Ask', 'a b', 'a%26pt%3D1', 'x'.repeat(41), '']) assert.equal(call(`/u/aina?via=qr&ct=${bad}`, UA.iphone).h.Location, STORE('invite-qr'), bad);
  assert.equal(call('/u/aina?ct=' + 'x'.repeat(40), UA.iphone).h.Location, STORE('x'.repeat(40)));
});

t('Android → /android?from=invite; a computer → /get?ct=invite-link', () => {
  assert.equal(call('/u/aina?via=qr', UA.android).h.Location, 'https://unaryx.com/android?from=invite');
  assert.equal(call('/u/aina', UA.mac).h.Location, 'https://unaryx.com/get?ct=invite-link');
  assert.equal(call('/u/aina', undefined).h.Location, 'https://unaryx.com/get?ct=invite-link');
});

t('bad usernames get the same redirects; never cached, noindex, no page body', () => {
  for (const u of ['/u/', '/u/bad%20name', '/u/<x>', '/u/%E0%A4%A']) {
    const r = call(u, UA.iphone);
    assert.equal(r.code, 302, u);
    assert.equal(r.h.Location, STORE('invite-link'), u);
    assert.equal(r.h['Cache-Control'], 'private, no-store');
    assert.equal(r.h['X-Robots-Tag'], 'noindex');
    assert.equal(r.body, '');
  }
});

t('the AASA still lists /u/*, the appclips entry unchanged; /u/* is routed here', () => {
  const a = JSON.parse(readFileSync(new URL('./public/.well-known/apple-app-site-association', import.meta.url), 'utf8'));
  assert.ok(a.applinks.details[0].components.some((c) => c['/'] === '/u/*'));
  const main = JSON.parse(execSync('git show origin/main:public/.well-known/apple-app-site-association', { encoding: 'utf8' }));
  assert.deepEqual(a.appclips, main.appclips, 'appclips as on main');
  const v = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
  assert.ok(v.rewrites.some((r) => r.source === '/u/:path*' && r.destination === '/api/invite'));
});

t('W3 flow pass: no App Store link anywhere on app.unaryx.com names a storefront (/e/ and /i/ said /au/)', () => {
  const files = execSync('git ls-files api public', { encoding: 'utf8' }).split('\n').filter((f) => /\.(js|mjs|html)$/.test(f));
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /apps\.apple\.com\/[a-z]{2}\//, f);
});

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\ninvite: all ok');

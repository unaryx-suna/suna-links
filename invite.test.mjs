// W-155: app.unaryx.com/u/<username> without Suna: a 302 by device, no page.
// Plain node: `node invite.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import handler, { ctFrom } from './api/invite.js';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  instagram: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 350.0.0.0.0',
  ipad: 'Mozilla/5.0 (iPad; CPU OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  android: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
};
globalThis.fetch = async () => new Response('[]', { status: 200 });   // W-314: no public profile → the old redirect
const call = async (url, ua) => { const o = { code: 0, h: {}, body: null }; await handler({ url, headers: { 'user-agent': ua } }, { status(c) { o.code = c; return this; }, setHeader(k, v) { o.h[k] = v; return this; }, end(b) { o.body = b ?? ''; return this; }, send(b) { o.body = b; return this; } }); return o; };
const STORE = (ct) => `https://apps.apple.com/app/id6759053765?pt=128539200&ct=${ct}&mt=8`;

await t('iPhone, iPad, in-app browsers → the App Store: ct=invite-qr from a code, else invite-link; never the username', async () => {
  for (const ua of [UA.iphone, UA.instagram, UA.ipad]) {
    const q = (await call('/u/aina?via=qr', ua));
    assert.equal(q.code, 302);
    assert.equal(q.h.Location, STORE('invite-qr'));
    assert.equal((await call('/u/aina', ua)).h.Location, STORE('invite-link'));
    assert.equal((await call('/u/aina?via=share', ua)).h.Location, STORE('invite-link'));
    assert.doesNotMatch(q.h.Location, /aina/);
  }
  assert.equal(ctFrom('/u/aina?via=qr'), 'invite-qr');
});

await t('W-159: the App Store link has no storefront (/au/), as /get', async () => {
  for (const u of ['/u/aina', '/u/aina?via=qr', '/u/aina?ct=ask-invite']) {
    const l = (await call(u, UA.iphone)).h.Location;
    assert.doesNotMatch(l, /apps\.apple\.com\/[a-z]{2}\//, u);
    assert.match(l, /^https:\/\/apps\.apple\.com\/app\/id6759053765\?pt=128539200&ct=[a-z0-9-]+&mt=8$/, u);
  }
});

await t('W-159: an allowed ct on the link goes through (the Ask Suna invite); anything else keeps the default', async () => {
  assert.equal((await call('/u/aina?via=ask-for-sam&ct=ask-invite', UA.iphone)).h.Location, STORE('ask-invite'));
  assert.equal((await call('/u/aina?via=qr&ct=ask-invite', UA.iphone)).h.Location, STORE('ask-invite'), 'the link’s own ct wins');
  for (const bad of ['Ask', 'a b', 'a%26pt%3D1', 'x'.repeat(41), '']) assert.equal((await call(`/u/aina?via=qr&ct=${bad}`, UA.iphone)).h.Location, STORE('invite-qr'), bad);
  assert.equal((await call('/u/aina?ct=' + 'x'.repeat(40), UA.iphone)).h.Location, STORE('x'.repeat(40)));
});

await t('Android → Google Play with the invite ct as its referrer campaign (W-241), the profile as suna_target (W-242); a computer → /get?ct=invite-link', async () => {
  const PLAY = 'https://play.google.com/store/apps/details?id=com.unaryx.suna&referrer=';
  assert.equal((await call('/u/aina?via=qr', UA.android)).h.Location, PLAY + encodeURIComponent('utm_source=suna&utm_campaign=invite-qr&suna_target=%2Fu%2Faina'));
  assert.equal((await call('/u/aina', UA.android)).h.Location, PLAY + encodeURIComponent('utm_source=suna&utm_campaign=invite-link&suna_target=%2Fu%2Faina'));
  assert.equal((await call('/u/aina?ct=ask-invite', UA.android)).h.Location, PLAY + encodeURIComponent('utm_source=suna&utm_campaign=ask-invite&suna_target=%2Fu%2Faina'));
  assert.equal((await call('/u/aina', UA.mac)).h.Location, 'https://unaryx.com/get?ct=invite-link');
  assert.equal((await call('/u/aina', undefined)).h.Location, 'https://unaryx.com/get?ct=invite-link');
  // QA W3: a creator's link keeps its own ct on a computer too.
  assert.equal((await call('/u/Elina.lotus?via=creator&ct=creator-elina-lotus', UA.mac)).h.Location, 'https://unaryx.com/get?ct=creator-elina-lotus');
  assert.equal((await call('/u/aina?ct=<bad>', UA.mac)).h.Location, 'https://unaryx.com/get?ct=invite-link');
});

await t('bad usernames get the same redirects; never cached, noindex, no page body', async () => {
  for (const u of ['/u/', '/u/bad%20name', '/u/<x>', '/u/%E0%A4%A']) {
    const r = (await call(u, UA.iphone));
    assert.equal(r.code, 302, u);
    assert.equal(r.h.Location, STORE('invite-link'), u);
    assert.equal(r.h['Cache-Control'], 'private, no-store');
    assert.equal(r.h['X-Robots-Tag'], 'noindex');
    assert.equal(r.body, '');
  }
});

await t('the AASA still lists /u/*, the appclips entry unchanged; /u/* is routed here', async () => {
  const a = JSON.parse(readFileSync(new URL('./public/.well-known/apple-app-site-association', import.meta.url), 'utf8'));
  assert.ok(a.applinks.details[0].components.some((c) => c['/'] === '/u/*'));
  const main = JSON.parse(execSync('git show origin/main:public/.well-known/apple-app-site-association', { encoding: 'utf8' }));
  assert.deepEqual(a.appclips, main.appclips, 'appclips as on main');
  const v = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
  assert.ok(v.rewrites.some((r) => r.source === '/u/:path*' && r.destination === '/api/invite'));
});

await t('W3 flow pass: no App Store link anywhere on app.unaryx.com names a storefront (/e/ and /i/ said /au/)', async () => {
  const files = execSync('git ls-files api public', { encoding: 'utf8' }).split('\n').filter((f) => /\.(js|mjs|html)$/.test(f));
  for (const f of files) assert.doesNotMatch(readFileSync(f, 'utf8'), /apps\.apple\.com\/[a-z]{2}\//, f);
});

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }

// W-314 DEX-148 (1) (Brian 15:25): a real person's link is a page that keeps who invited them.
await t('a known username: "@aina invited you to Suna", photo, her plans, white Open in Suna (by device), both stores, App Clip meta, og carries name and photo; never cached', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async (u) => new Response(JSON.stringify(String(u).includes('public_profiles')
    ? [{ username: 'aina', avatar_url: 'https://x.supabase.co/a.jpg' }]
    : [{ share_slug: 'old-kl--abc', name: 'Old KL on foot', resolved_city_name: 'Kuala Lumpur', cover_media_path: 'c/1.jpg' }]), { status: 200 });
  try {
    const r = await call('/u/aina?via=qr', UA.iphone);
    assert.equal(r.code, 200); assert.equal(r.h['Cache-Control'], 'private, no-store'); assert.equal(r.h['X-Robots-Tag'], 'noindex');
    assert.match(r.body, /<h1>@aina invited you to Suna<\/h1>/);
    assert.match(r.body, /<meta property="og:title" content="@aina invited you to Suna">/); assert.match(r.body, /<meta property="og:image" content="https:\/\/x\.supabase\.co\/a\.jpg">/);
    assert.match(r.body, /<meta name="apple-itunes-app" content="app-id=6759053765, app-clip-bundle-id=com\.unaryx\.TravelMug\.Clip">/);
    assert.ok(r.body.includes('<a class="open" href="' + STORE('invite-qr').replace(/&/g, '&amp;') + '"'), 'Open in Suna, by device');
    assert.match(r.body, /Download on the App Store<\/a><a href="https:\/\/play\.google\.com\/store\/apps\/details\?id=com\.unaryx\.suna&amp;referrer=[^"]*suna_target/);
    assert.match(r.body, /<h2>@aina’s plans in Kuala Lumpur<\/h2>/); assert.match(r.body, /<a class="iv-plan" href="\/i\/old-kl--abc">/);
    assert.match(r.body, /itinerary-covers\/c\/1\.jpg/);
  } finally { globalThis.fetch = real; }
});
await t('an unknown username or a failed read: the old redirect', async () => {
  const real = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('down'); };
  try { const r = await call('/u/aina', UA.iphone); assert.equal(r.code, 302); assert.equal(r.h.Location, STORE('invite-link')); } finally { globalThis.fetch = real; }
});

if (bad) { console.log(`\ninvite: ${bad} failed`); process.exit(1); }
console.log('\ninvite: all ok');

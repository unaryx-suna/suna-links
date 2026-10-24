// W-155: app.unaryx.com/u/<username>, the page a Suna profile code or link
// lands on without the app. Plain node: `node invite.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import handler, { username, inviteBody } from './api/invite.js';

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const call = (url) => { const o = { code: 0, h: {}, body: '' }; handler({ url, headers: {} }, { status(c) { o.code = c; return this; }, setHeader(k, v) { o.h[k] = v; return this; }, send(b) { o.body = b; return this; } }); return o; };

t('the username: as the app allows them, @ dropped, lower case; anything else is no username', () => {
  assert.equal(username('/u/aina'), 'aina');
  assert.equal(username('/u/@Aina.K?via=qr'), 'aina.k');
  for (const u of ['/u/', '/u/a', '/u/bad%20name', '/u/<x>', '/u/' + 'a'.repeat(31)]) assert.equal(username(u), null, u);
});

t('the page: noindex; Get Suna with ct=invite and no username in it; Connect through suna://u/<username>; the Android list', () => {
  const r = call('/u/aina');
  assert.equal(r.code, 200);
  assert.match(r.body, /<meta name="robots" content="noindex">/);
  assert.match(r.body, /<h1 class="venue-h1">You're invited to Suna<\/h1>/);
  const store = r.body.match(/<a class="btn" href="([^"]+)" rel="noopener">Get Suna on the App Store<\/a>/)[1];
  assert.match(store, /ct=invite&amp;mt=8$/);
  assert.doesNotMatch(store, /aina/);
  assert.match(r.body, /data-scheme="suna:\/\/u\/aina"[^>]*>Already have Suna\? Connect<\/a>/);
  assert.match(r.body, /href="https:\/\/unaryx\.com\/android\?from=invite"/);
  assert.match(r.h['Cache-Control'], /s-maxage=300/);
  assert.match(r.body, /<meta name="apple-itunes-app" content="app-id=6759053765, app-argument=https:\/\/app\.unaryx\.com\/u\/aina">/, 'the app, not the Clip');
  assert.doesNotMatch(r.body, /app-clip-bundle-id/);
});

t('no profile data: nothing about the person, and a link without a username has no Connect', () => {
  const b = inviteBody('aina');
  assert.doesNotMatch(b.replace('suna://u/aina', ''), /aina/i, 'the username appears only in the scheme');
  assert.doesNotMatch(inviteBody(null), /suna:\/\/u\//);
});

t('the AASA claims /u/*, and /u/ is routed to the page', () => {
  const aasa = JSON.parse(readFileSync(new URL('./public/.well-known/apple-app-site-association', import.meta.url), 'utf8'));
  assert.ok(aasa.applinks.details[0].components.some((c) => c['/'] === '/u/*'));
  const v = JSON.parse(readFileSync(new URL('./vercel.json', import.meta.url), 'utf8'));
  assert.ok(v.rewrites.some((r) => r.source === '/u/:path*' && r.destination === '/api/invite'));
});

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ all invite checks pass\n');
process.exit(bad ? 1 : 0);

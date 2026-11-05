// W-195 (Android A-010): /.well-known/assetlinks.json lets Android open
// app.unaryx.com and trysuna.app links in the app (autoVerify). Android
// accepts it only as a 200, application/json, with no redirect.
// `node assetlinks.test.mjs`; `LIVE=1 [HOSTS=a,b] node assetlinks.test.mjs`
// also fetches it from each host (default app.unaryx.com,trysuna.app).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// The Android session's JSON (Team Tracker `dex-and-010-web-links-0411`): the upload key.
// Add Play App Signing's SHA-256 here once the app is on Play.
const EXPECTED = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: 'com.unaryx.suna',
    sha256_cert_fingerprints: ['C4:5A:11:DB:FF:55:B0:39:14:48:86:84:C8:9F:E5:05:D0:6C:0A:82:EE:84:82:8B:A0:B1:A2:26:11:03:E1:35'],
  },
}];

await t('the file is the Android session\'s JSON exactly; every fingerprint is 32 colon-separated bytes', () => {
  const a = JSON.parse(readFileSync('public/.well-known/assetlinks.json', 'utf8'));
  assert.deepEqual(a, EXPECTED);
  for (const f of a.flatMap((x) => x.target.sha256_cert_fingerprints)) assert.match(f, /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
});

await t('vercel.json: served as application/json; no rewrite or redirect touches /.well-known; the AASA rule is unchanged', () => {
  const v = JSON.parse(readFileSync('vercel.json', 'utf8'));
  const rule = v.headers.find((h) => h.source === '/.well-known/assetlinks.json');
  assert.ok(rule, 'a header rule');
  assert.equal(rule.headers.find((h) => h.key === 'Content-Type').value, 'application/json');
  for (const r of [...(v.rewrites || []), ...(v.redirects || [])]) {
    assert.ok(!/well-known|^\/\(\.\*\)$|^\/:path\*$/.test(r.source), `${r.source} could catch it`);
  }
  assert.ok(v.headers.find((h) => h.source === '/.well-known/apple-app-site-association'), 'AASA rule still there');
});

if (process.env.LIVE) {
  for (const host of (process.env.HOSTS || 'app.unaryx.com,trysuna.app').split(',')) {
    await t(`${host}: 200, application/json, no redirect, the same JSON`, async () => {
      const base = host.startsWith('http') ? host : `https://${host}`;
      const r = await fetch(`${base}/.well-known/assetlinks.json`, { redirect: 'manual' });
      assert.equal(r.status, 200);
      assert.match(r.headers.get('content-type') || '', /^application\/json/);
      assert.deepEqual(await r.json(), EXPECTED);
    });
  }
}

if (bad) { console.log(`\n✗ ${bad} failed`); process.exit(1); }
console.log('\n✓ assetlinks.json');

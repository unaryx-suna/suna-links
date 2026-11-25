// W-314 OD-web-Q3-18: /e/ and /c/ carry the same desktop QR tile as /i/ (hidden below 1024 or without a pointer).
import assert from 'node:assert/strict';
import { qrTile, page } from './api/_clip.js';
let fails = 0;
const t = (n, f) => { try { f(); console.log('ok', n); } catch (e) { fails++; console.log('  FAIL', n, '\n      ', e.message); } };
t('event and checkpoint pages get the tile', () => {
  assert.match(qrTile('https://app.unaryx.com/e/11111111-1111-4111-8111-111111111111'), /api\/qr\?e=11111111-1111-4111-8111-111111111111/);
  assert.match(qrTile('https://app.unaryx.com/c/worq-ttdi'), /api\/qr\?c=worq-ttdi/);
});
t('nothing else does', () => { assert.equal(qrTile('https://app.unaryx.com/i/x'), ''); assert.equal(qrTile('https://evil.example/e/x'), ''); assert.equal(qrTile('https://app.unaryx.com/c/'), ''); });
t('a noindex page (ended, not found) has no tile; the CSS hides it under 1024', () => {
  const base = { title: 'T', description: 'D', canonical: 'https://app.unaryx.com/c/worq-ttdi', body: '' };
  assert.match(page(base), /class="qrtile"/); assert.doesNotMatch(page({ ...base, noindex: true }), /class="qrtile"/);
  assert.match(page(base), /@media \(min-width: 1024px\) and \(hover: hover\)/);
});
if (fails) process.exit(1);

// W-314 W-Q9-3: /i/'s cover has a 320 copy for phones and a matching preload in the head.
import assert from 'node:assert/strict';
import { coverVariants, coverPreload } from './api/_preview.js';
let bad = 0;
const t = async (n, fn) => { try { await fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const C = 'https://x.supabase.co/storage/v1/object/public/itinerary-covers/a/c.jpg';
console.log('w314-cover');
await t('variants: 320, 640, 1280 when they resolve', async () => {
  const v = await coverVariants(C, async () => true);
  assert.match(v[320], /\/_w\/320\/c\.jpg$/); assert.match(v[640], /\/_w\/640\/c\.jpg$/); assert.match(v[1280], /\/_w\/1280\/c\.jpg$/);
});
await t('preload: the 640 copy with the same srcset and sizes', async () => {
  const v = await coverVariants(C, async () => true);
  const l = coverPreload(C, v);
  assert.match(l, /^<link rel="preload" as="image" href="[^"]*_w\/640\/c\.jpg" imagesrcset="[^"]*_w\/320\/c\.jpg 320w, [^"]*_w\/640\/c\.jpg 640w, [^"]*_w\/1280\/c\.jpg 1280w" imagesizes="\(min-width: 700px\) 640px, 100vw" fetchpriority="high">$/);
});
await t('no copies: the original; no cover: nothing', async () => {
  assert.equal(coverPreload(C, null), `<link rel="preload" as="image" href="${C}" fetchpriority="high">`);
  assert.equal(coverPreload(null, null), '');
});
if (bad) { console.log(bad + ' failing'); process.exit(1); }

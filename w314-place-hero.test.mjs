// W-314 OD-web-Q9-1: the place hero uses the 320/640/1280 copies with width/height; other hosts unchanged.
import assert from 'node:assert/strict';
import { heroImg } from './api/_placepage.js';
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const U = 'https://x.supabase.co/storage/v1/object/public/place-photos/ab/cover.jpg';
console.log('w314-place-hero');
t('stored photo: src the 640 copy, srcset 320/640/1280, sizes, width/height, the original as fallback', () => {
  const h = heroImg(U, 'Kedai');
  assert.match(h, /src="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/place-photos\/ab\/_w\/640\/cover\.jpg"/);
  assert.match(h, /srcset="[^"]*_w\/320\/cover\.jpg 320w, [^"]*_w\/640\/cover\.jpg 640w, [^"]*_w\/1280\/cover\.jpg 1280w"/);
  assert.match(h, /sizes="\(min-width: 560px\) 560px, 100vw" width="640" height="440" data-full="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/place-photos\/ab\/cover\.jpg"/);
  assert.match(h, /fetchpriority="high"/); assert.doesNotMatch(h, /loading="lazy"/);
});
t('another host: as it is, no srcset', () => {
  const h = heroImg('https://images.example.com/a.jpg', 'x');
  assert.match(h, /src="https:\/\/images\.example\.com\/a\.jpg"/); assert.doesNotMatch(h, / srcset=/);
});
t('no photo: nothing', () => assert.equal(heroImg(null), ''));
if (bad) { console.log(bad + ' failing'); process.exit(1); }

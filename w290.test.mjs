// W-290 (Ops OPS-339): the Panel's More photos strip on an event. `node w290.test.mjs`
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const h = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
console.log('w290');
t('the strip sits on the event photo screen, up to 4', () => {
  assert.match(h, /<label>More photos \(up to 4\)<\/label>\s*<p class="sub" id="ev-gal-who"[^>]*>Show on Partner events only\.<\/p>\s*<div class="evgal" id="ev-gal"><\/div>/);
  assert.match(h, /const EV_GAL_MAX = 4;/);
});
t('both event queries read gallery, so the strip shows what the page shows', () => {
  assert.equal((h.match(/image_credit,venue,latitude,longitude,gallery,organiser:organisers\(name,plan\)'\)/g) || []).length, 2);
});
t('a photo goes through evResize (canvas JPEG, no EXIF) to event-photos/events/<id>-g<time>.jpg, then gallery [{url, path, credit}] on the row, checked with .select', () => {
  assert.match(h, /async function evAddGallery\(file\)[\s\S]*await evResize\(file\)[\s\S]*'events\/' \+ evCurrent\.id \+ '-g' \+ Date\.now\(\) \+ '\.jpg'[\s\S]*concat\(\[\{ url, path, credit: null \}\]\)/);
  assert.match(h, /update\(\{ gallery: next\.length \? next : null \}\)\.eq\('id', id\)\.select\('id,gallery'\)/);
});
console.log(bad ? `\n✗ ${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

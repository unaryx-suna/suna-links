// W-217 (3), Brian 9 Nov ("at 100"): a place page is in the sitemap and asks to
// be indexed only with a description of 100+ characters (not filler); the
// venue page's Worth a walk list keeps its 60. `node w217-place.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { hasRealContent, LIST_DESCRIPTION_LENGTH } from './api/sitemap.js';

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const d = (n) => ({ description: 'x'.repeat(n) });

t('100 characters is the bar; 99 is out; filler is out at any length', () => {
  assert.equal(hasRealContent(d(100)), true);
  assert.equal(hasRealContent(d(99)), false);
  assert.equal(hasRealContent({ description: `Highly rated ${'Pub '.repeat(40)}nearby.` }), false);
  assert.equal(hasRealContent({ description: null }), false);
});
t('whitespace runs count once, as the page measures them', () => {
  assert.equal(hasRealContent({ description: `${'a'.repeat(50)}          ${'b'.repeat(48)}` }), false);
});
t('a list (Worth a walk) keeps 60', () => {
  assert.equal(LIST_DESCRIPTION_LENGTH, 60);
  assert.equal(hasRealContent(d(80), LIST_DESCRIPTION_LENGTH), true);
  assert.equal(hasRealContent(d(59), LIST_DESCRIPTION_LENGTH), false);
});
t('the place page and venue page call the same function (no second copy of the rule)', () => {
  const place = readFileSync(new URL('./api/place.js', import.meta.url), 'utf8');
  assert.match(place, /indexable = hasRealContent\(\{ description: text \}, undefined, resolved\.tips\)/);   // W-223: with the place's tips
  assert.doesNotMatch(place, /text\.length >= 60/);
  assert.match(readFileSync(new URL('./api/venue.js', import.meta.url), 'utf8'), /hasRealContent\(p, LIST_DESCRIPTION_LENGTH\)/);
});

console.log(bad ? `\n✗ ${bad} failed` : '\n✓ W-217 place gate');
process.exit(bad ? 1 : 0);

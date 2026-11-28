// W-303 (bug found 23 Nov writing Design Assembly's photos): in Panel › Event photos › More photos, typing a credit
// in one card while another card's credit saved lost the text: every save redrew all the cards. A credit save now
// keeps the strip as it is; add and remove still redraw. `node w303-credit.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const h = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
assert.match(h, /async function evSaveGallery\(next, okMsg, redraw = true\)/);
assert.match(h, /if \(redraw\) evRenderGallery\(\);/);
assert.match(h, /evSaveGallery\(next, 'Credit saved\.', false\); \};/);
assert.match(h, /evSaveGallery\(evGallery\(\)\.filter\(\(x, n\) => n !== i\), 'Removed from the event page\.'\)/);   // remove still redraws
console.log('  ok   a credit save keeps the other cards (and what is typed in them); add/remove redraw\n\nall passed');

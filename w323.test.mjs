// W-323 (Brian 15:31, OD-web-C-2611a): /c/ has one lilac 'Follow <venue> in Suna' line under the venue name.
// Plus OD-web-Q3-30 (the no-venue fallback) and -Q3-33 (no blank tiles). `node w323.test.mjs`
import assert from 'node:assert/strict';
import { venueBody } from './api/venue.js';
import { eventRow } from './api/_clip.js';
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
console.log('w323');
const now = new Date('2026-11-26T08:00:00Z');
const venue = { slug: 'worq-ttdi', name: 'WORQ <TTDI>', lat: 3.13, lng: 101.62, ct: 'partner-worq-ttdi' };
t('the Follow line: under the heading, opens Suna on the venue with follow=1, else the App Store with ct=c-follow', () => {
  const h = venueBody(venue, { tz: 'Asia/Kuala_Lumpur', step: null, city: null }, now, []);
  assert.match(h, /<h1 class="venue-h1">Near WORQ &lt;TTDI&gt;<\/h1>\s*<p class="follow"><a class="follow-link save-suna" data-scheme="suna:\/\/venue\?slug=worq-ttdi&amp;follow=1" href="https:\/\/apps\.apple\.com\/app\/id6759053765\?pt=128539200&amp;ct=c-follow&amp;mt=8">Follow WORQ &lt;TTDI&gt; in Suna<\/a><\/p>/);
  assert.equal((h.match(/Follow /g) || []).length, 1);
});
t('no venue, with this week in the nearest city: the list, then Get Suna under it (no pinned bar)', () => {
  const rows = [{ id: 'a', name: 'Night Market', start_time: '2026-11-27T11:00:00Z', end_time: '2026-11-27T15:00:00Z', image_url: null }];
  const h = venueBody(null, { city: { slug: 'kuala-lumpur', name: 'Kuala Lumpur' }, tz: 'Asia/Kuala_Lumpur', rows }, now, []);
  assert.match(h, /This week in Kuala Lumpur/);
  assert.match(h, /<div class="inline-cta"><a class="btn"/);
  assert.doesNotMatch(h, /<div class="bar">/);
  assert.doesNotMatch(h, /Follow /);
});
t('an event with no photo shows the date tile, never an empty tile', () => {
  const r = eventRow({ id: 'a', name: 'X', start_time: '2026-11-29T07:00:00Z', end_time: '2026-11-29T10:00:00Z', image_url: null }, { timeZone: 'Asia/Kuala_Lumpur', now });
  assert.match(r, /<span class="dtile" aria-hidden="true"><b>NOV<\/b><span>29<\/span><\/span>/);
  assert.doesNotMatch(r, /class="ph"/);
});
if (bad) { console.log(bad + ' failing'); process.exit(1); }

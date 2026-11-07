// W-214: Review places in the Panel. The pure logic (waves, what's missing, the line,
// the order) runs from public/field.html; the wiring is checked in the markup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const logic = html.slice(html.indexOf('/* REVIEW-LOGIC-START */'), html.indexOf('/* REVIEW-LOGIC-END */'));
const ctx = vm.createContext({});
vm.runInContext(logic + ';this.L={rvWave,rvMissing,rvLine,rvSort,rvWhen,rvUse,rvSourceOk,rvBlockers};', ctx);
const L = ctx.L;
let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

t('waves: used first (saves, plans or visits), then event venue, then public itinerary stop, then the rest', () => {
  assert.equal(L.rvWave({ saves: 2, eventVenue: true, inItinerary: true }), 1);
  assert.equal(L.rvWave({ itinStops: 1 }), 1, 'in someone\'s plan, never saved: still wave 1');
  assert.equal(L.rvWave({ visits: 3 }), 1);
  assert.equal(L.rvWave({ saves: 0, eventVenue: true, inItinerary: true }), 2);
  assert.equal(L.rvWave({ saves: 0, eventVenue: false, inItinerary: true }), 3);
  assert.equal(L.rvWave({}), 4);
});
t('missing: hours, cover, description under 40 characters, tips', () => {
  assert.deepEqual([...L.rvMissing({})], ['hours', 'cover', 'description', 'tips']);
  assert.deepEqual([...L.rvMissing({ operating_hours: {}, hours_source_ref: 'https://x.my', cover_image_url: 'x', description: 'A long enough description of this place, really.', tips: 2 })], []);
  assert.deepEqual([...L.rvMissing({ operating_hours: {}, cover_image_url: 'x', description: 'A long enough description of this place, really.', tips: 2 })], ['hours source']);
  assert.deepEqual([...L.rvMissing({ operating_hours: {}, hours_source_ref: 'contacted: phone 7 Nov', cover_image_url: 'x', description: 'Short.', tips: 1 })], ['description']);
});
t('the line: saves, verified date, hours source, what\'s missing; never a rating', () => {
  assert.equal(L.rvLine({ saves: 1, itinStops: 2, last_verified_at: '2026-11-03T02:00:00Z', hours_source: 'admin', hours_source_ref: 'https://x.my', operating_hours: {}, cover_image_url: 'x', description: 'x'.repeat(50), tips: 1 }),
    '1 save · 2 in plans · verified 3 Nov · hours admin · nothing missing');
  assert.equal(L.rvLine({}), '0 saves · verified never · hours — · needs hours, cover, description, tips');
  assert.doesNotMatch(logic, /\brating|review_count|\bstars\b/i);
});
t('hours source: a link or "contacted: <channel> <date>", 3 to 300 characters', () => {
  for (const ok of ['https://sushiro.com.my/stores', 'contacted: WhatsApp 7 Nov', 'Contacted: phone call 6 Nov 2026']) assert.equal(L.rvSourceOk(ok), true, ok);
  for (const no of ['', 'website', 'contacted:', 'http://x', 'contacted: ' + 'x'.repeat(300)]) assert.equal(L.rvSourceOk(no), false, no);
});
t('Verified only once every field has a value and a source', () => {
  const full = { operating_hours: {}, hours_source_ref: 'https://x.my', cover_image_url: 'x', cover_source: 'pexels', description: 'x'.repeat(50), business_status: 'OPERATIONAL', business_status_checked_at: '2026-11-07T00:00:00Z' };
  assert.deepEqual([...L.rvBlockers(full)], []);
  assert.deepEqual([...L.rvBlockers({ ...full, hours_source_ref: null })], ['hours source']);
  assert.deepEqual([...L.rvBlockers({ ...full, cover_source: null })], ['cover source']);
  assert.deepEqual([...L.rvBlockers({ ...full, business_status_checked_at: null })], ['open or closed']);
  assert.deepEqual([...L.rvBlockers({})], ['hours', 'cover', 'description', 'open or closed']);
});
t('order: most used, then never-verified first, then name', () => {
  const rows = [{ name: 'B', saves: 1, last_verified_at: 'x' }, { name: 'A', saves: 1 }, { name: 'C', saves: 5 }];
  assert.deepEqual(rows.sort(L.rvSort).map((r) => r.name), ['C', 'A', 'B']);
});
t('wiring: an admin-only menu entry, the pane, its tab, and a tap opens the editor', () => {
  assert.match(html, /<button class="opt" id="menu-review" hidden>Review places/);
  assert.match(html, /id="pane-review" hidden/);
  assert.match(html, /\$\('menu-review'\)\.hidden = !\(profile && profile\.is_admin\);/);
  assert.match(html, /if \(which === 'review'\) openReview\(\);/);
  assert.match(html, /rvToggleCard\(d, p\)/, 'a tap opens the review card');
  assert.match(html, /data-act="edit"[\s\S]*?switchTab\('capture'\); await openExisting\(p\.id\);/, 'the card opens the editor');
  assert.match(html, /db\.rpc\('admin_place_use_counts'/);
  assert.match(html, /hours_source: 'admin', hours_source_ref: src, hours_checked_at:/);
  assert.match(html, /business_status: \$c\('\[data-f="st"\]'\)\.value, business_status_checked_at:/);
  assert.match(html, /hours: \['operating_hours', 'hours_source', 'hours_source_ref'\]/, 'editing hours clears the old source');
  assert.match(html, /hours_source_ref: null,/);
  assert.match(html, /write\(\{ last_verified_at: new Date\(\)\.toISOString\(\) \}\)/);
});
console.log(bad ? `\nw214: ${bad} FAILED` : '\nw214: all passed');
process.exit(bad ? 1 : 0);

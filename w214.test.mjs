// W-214: Review places in the Panel. The pure logic (waves, what's missing, the line,
// the order) runs from public/field.html; the wiring is checked in the markup.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const logic = html.slice(html.indexOf('/* REVIEW-LOGIC-START */'), html.indexOf('/* REVIEW-LOGIC-END */'));
const ctx = vm.createContext({});
vm.runInContext(logic + ';this.L={rvWave,rvMissing,rvLine,rvSort,rvWhen};', ctx);
const L = ctx.L;
let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

t('waves: saved first, then event venue, then itinerary stop, then the rest', () => {
  assert.equal(L.rvWave({ saves: 2, eventVenue: true, inItinerary: true }), 1);
  assert.equal(L.rvWave({ saves: 0, eventVenue: true, inItinerary: true }), 2);
  assert.equal(L.rvWave({ saves: 0, eventVenue: false, inItinerary: true }), 3);
  assert.equal(L.rvWave({}), 4);
});
t('missing: hours, cover, description under 40 characters, tips', () => {
  assert.deepEqual([...L.rvMissing({})], ['hours', 'cover', 'description', 'tips']);
  assert.deepEqual([...L.rvMissing({ operating_hours: {}, cover_image_url: 'x', description: 'A long enough description of this place, really.', tips: 2 })], []);
  assert.deepEqual([...L.rvMissing({ operating_hours: {}, cover_image_url: 'x', description: 'Short.', tips: 1 })], ['description']);
});
t('the line: saves, verified date, hours source, what\'s missing; never a rating', () => {
  assert.equal(L.rvLine({ saves: 1, last_verified_at: '2026-11-03T02:00:00Z', hours_source: 'admin', operating_hours: {}, cover_image_url: 'x', description: 'x'.repeat(50), tips: 1 }),
    '1 save · verified 3 Nov · hours admin · nothing missing');
  assert.equal(L.rvLine({}), '0 saves · verified never · hours — · needs hours, cover, description, tips');
  assert.doesNotMatch(logic, /\brating|review_count|\bstars\b/i);
});
t('order: most saves, then never-verified first, then name', () => {
  const rows = [{ name: 'B', saves: 1, last_verified_at: 'x' }, { name: 'A', saves: 1 }, { name: 'C', saves: 5 }];
  assert.deepEqual(rows.sort(L.rvSort).map((r) => r.name), ['C', 'A', 'B']);
});
t('wiring: an admin-only menu entry, the pane, its tab, and a tap opens the editor', () => {
  assert.match(html, /<button class="opt" id="menu-review" hidden>Review places/);
  assert.match(html, /id="pane-review" hidden/);
  assert.match(html, /\$\('menu-review'\)\.hidden = !\(profile && profile\.is_admin\);/);
  assert.match(html, /if \(which === 'review'\) openReview\(\);/);
  assert.match(html, /d\.onclick = async \(\) => \{ switchTab\('capture'\); await openExisting\(p\.id\); \};/);
  assert.match(html, /db\.rpc\('place_save_counts'/);
});
console.log(bad ? `\nw214: ${bad} FAILED` : '\nw214: all passed');
process.exit(bad ? 1 : 0);

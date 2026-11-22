// W-236: ticket sessions in the Panel. Payments groups paid tickets by session and each card
// names its session; the Door counts per session and names the session on its answer.
// usage: node w236.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('/* TICKETS-LOGIC-START */'), html.indexOf('/* TICKETS-LOGIC-END */'));
const L = new Function(block + '\nreturn { tkSesTime, tkSesName, tkBySession, tkDoorCountsHTML, tkDoorResult, tkCard };')();

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const nb = (x) => String(x).replace(/\s/g, ' ');
const NOW = Date.parse('2026-12-05T06:00:00Z');
const row = (id, ses, over = {}) => ({ id, status: 'paid', pay_ref: 'SUNA-' + id, amount_due: 20, buyer_name: 'M ' + id, event_name: 'Founders Night', checked_in_at: null,
  ...(ses ? { session_id: ses[0], session_label: ses[1], session_starts_at: ses[2] } : {}), ...over });
const S1 = ['s1', '1:00 PM', '2026-12-05T05:00:00Z'], S3 = ['s3', 'Cross-stitch', '2026-12-05T06:40:00Z'];

t('session times are Malaysia time: 05:00Z is 1:00 PM; the label shows only when it adds something', () => {
  assert.equal(nb(L.tkSesTime('2026-12-05T05:00:00Z')), '1:00 PM');
  assert.equal(nb(L.tkSesName(row('a', S1))), '1:00 PM');
  assert.equal(nb(L.tkSesName(row('a', S3))), '2:40 PM, Cross-stitch');
  assert.equal(L.tkSesName(row('a', null)), '');
});
t('tickets group by session, earliest first; no session first and alone when there are no sessions', () => {
  const g = L.tkBySession([row('a', S3), row('b', S1), row('c', S3), row('d', null)]);
  assert.deepEqual(g.map((x) => [x.key, x.rows.map((r) => r.id).join('')]), [['', 'd'], ['s1', 'b'], ['s3', 'ac']]);
  assert.deepEqual(L.tkBySession([row('a', null), row('b', null)]).map((x) => x.key), ['']);
});
t('Payments card names the session; a sessionless ticket has no Session row', () => {
  assert.match(nb(L.tkCard(row('a', S3), NOW)), /<span class="k">Session<\/span><span>2:40 PM, Cross-stitch<\/span>/);
  assert.doesNotMatch(L.tkCard(row('a', null), NOW), /Session/);
});
t('the Door counts one line per session (paid, checked in); an event without sessions keeps the two totals only', () => {
  const rows = [row('a', S3, { checked_in_at: '2026-12-05T06:41:00Z' }), row('b', S1), row('c', S3), row('d', S3, { status: 'refunded' })];
  const h = nb(L.tkDoorCountsHTML(rows, NOW));
  assert.match(h, /<span><b>3<\/b>paid<\/span><span><b>1<\/b>checked in<\/span>/);
  assert.match(h, /<p><b>1:00 PM<\/b><span>1 paid, 0 in<\/span><\/p><p><b>2:40 PM, Cross-stitch<\/b><span>2 paid, 1 in<\/span><\/p>/);
  assert.doesNotMatch(L.tkDoorCountsHTML([row('a', null)], NOW), /tk-ses-counts/);
});
t('the Door\'s answer names the session (from its list), green and red alike', () => {
  const ans = { status: 'paid', checked_in: true, already_used: false, buyer_name: 'Mira', event_name: 'Founders Night', checked_in_at: '2026-12-05T06:41:00Z' };
  const v = L.tkDoorResult(ans, row('a', S3), NOW);
  assert.equal(v[0], 'ok'); assert.match(nb(v[3]), /^Founders Night, 2:40 PM session, in at /);
  assert.match(nb(L.tkDoorResult({ ...ans, already_used: true }, row('a', S3), NOW)[3]), /^First scanned at .+, 2:40 PM session$/);   // W-288
  assert.match(L.tkDoorResult({ ...ans, already_used: true }, null, NOW)[3], /^First scanned at [^,]+$/);
});
t('wiring: Payments groups the paid list; the Door paints the per-session counts', () => {
  assert.match(html, /const paidGroups = tkBySession\(by\(\['paid'\]\)\);/);
  assert.match(html, /\$\('dr-counts'\)\.innerHTML = tkDoorCountsHTML\(tkRows, Date\.now\(\)\);/);
});
process.exit(bad ? 1 : 0);

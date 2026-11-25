// W-315 (Brian 22:18): Waiting on you in the Panel. The logic between the W315 markers runs with no browser,
// plus the markup checks. `node w315.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const pre = 'const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));\nfunction plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }\n';
const L = new Function(pre + cut('/* W315-LOGIC-START */', '/* W315-LOGIC-END */').replace(/^document\.addEventListener[\s\S]*$/m, '') + '\nreturn { wtMissing, wtAge, wtRowHTML, WT_PLAN, set: (k) => { wtSel = k; } };')();
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
console.log('w315');
const now = Date.parse('2026-11-26T00:00:00Z');
t('what a listing lacks: photo, price, credit, pin, a shared photo; a complete one lacks nothing', () => {
  assert.deepEqual(L.wtMissing({ image_url: null, price_type: null, latitude: null, longitude: null }, null).map((m) => m[0]), ['photo', 'price', 'pin']);
  assert.deepEqual(L.wtMissing({ image_url: 'x', image_credit: null, price_type: 'free', latitude: 1, longitude: 2 }, 'Huat! Vibes').map((m) => m[1]), ['No photo credit', 'Same photo as Huat! Vibes']);
  assert.deepEqual(L.wtMissing({ image_url: 'x', image_credit: 'Me', price_type: 'paid', latitude: 1, longitude: 2 }, null), []);
});
t('ages: minutes, hours, days', () => {
  assert.equal(L.wtAge('2026-11-25T23:30:00Z', now), '30 min');
  assert.equal(L.wtAge('2026-11-25T15:00:00Z', now), '9 h');
  assert.equal(L.wtAge('2026-11-23T00:00:00Z', now), '3 days');
});
t('a ready listing row: Turn down and Approve; Approve disabled without a pin; red age past 24 h', () => {
  const it = { key: 'ev:1', part: 'need', kind: 'ready', label: 'Listing, ready', title: 'Huat! Vibes', sub: 'Wed 13 Jan, Central Market', at: '2026-11-24T00:00:00Z', thumb: null, e: { latitude: null } };
  const h = L.wtRowHTML(it, now);
  assert.match(h, /data-wt-do="down"[^>]*>Turn down<\/button><button type="button" class="wt-btn w" data-wt-do="approve" data-wt="ev:1" disabled title="No pin yet">Approve<\/button>/);
  assert.match(h, /<span class="wt-age red">2 days<\/span>/);
});
t('an AI row: Send to AI shown but disabled (panel-ai not deployed); a name is escaped', () => {
  const h = L.wtRowHTML({ key: 'ev:2', part: 'ai', kind: 'fix', label: 'Listing, missing info', title: '<b>Gather</b>', sub: 'No photo, no price', at: '2026-11-25T00:00:00Z', e: {} }, now);
  assert.match(h, /<button type="button" class="wt-btn" disabled title="Send to AI needs the panel-ai server piece">Send to AI<\/button>/);
  assert.match(h, /&lt;b&gt;Gather&lt;\/b&gt;/);
});
t('markup: an admin-only menu row with the Needs you count, the pane, the first home group, the tab list, Undo before writing', () => {
  assert.match(html, /<button class="opt" id="menu-wait" hidden>Waiting on you <span class="badge zero" id="wait-count">0<\/span>/);
  assert.match(html, /<div class="wrap" id="pane-wait" hidden>/);
  assert.match(html, /const HOME_GROUPS = \[\n  \['Waiting on you', \[\['wait', /);
  assert.match(html, /wait: 'wait-count' \};/);
  assert.match(html, /const WT_UNDO_MS = 6000;/);
  assert.match(html, /update\(\{ status: 'approved' \}\)\.eq\('id', p\.it\.e\.id\)\.eq\('status', 'pending'\)/);
  assert.match(html, /update\(\{ status: 'rejected', review_note: p\.why \}\)/);
  assert.doesNotMatch(cut('/* W315-LOGIC-START */', '/* W315-LOGIC-END */'), /panel-ai['"]?\s*[,)]|functions\.invoke|\/functions\/v1\//, 'nothing calls a model yet');
});
console.log(bad ? `\n✗ ${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

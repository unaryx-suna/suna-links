// W-315 (Brian 22:18): Waiting on you in the Panel. The logic between the W315 markers runs with no browser,
// plus the markup checks. `node w315.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const pre = 'const escapeHtml = (s) => String(s == null ? "" : s).replace(/[&<>"\']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", \'"\': "&quot;", "\'": "&#39;" }[c]));\nfunction plural(n, w) { return n + " " + w + (n === 1 ? "" : "s"); }\n';
const L = new Function(pre + cut('/* W315-LOGIC-START */', '/* W315-LOGIC-END */').replace(/^document\.addEventListener[\s\S]*$/m, '') + '\nreturn { wtMissing, wtAge, wtRowHTML, WT_PLAN, wtGroup, WT_GROUPS, wtPinFrom, wtEditHTML, set: (k) => { wtSel = k; } };')();
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
t('(3) the sidebar for an admin: Waiting on you, then Reports (Places, Events, Organisers and partners, Money and tickets, Feedback) and Tools; Home is Waiting on you on a computer', () => {
  assert.match(html, /const SIDE_GROUPS = \[\n  \['Reports', \[\['review', 'Places'\], \['events', 'Events'\], \['orgs', 'Organisers and partners'\], \['orders', 'Money and tickets'\], \['feedback', 'Feedback'\]\]\],\n  \['Tools', \[\['capture', 'Add a place'\], \['addplace', 'Google Maps link'\], \['queue', 'Upload queue'\], \['door', 'Door'\]\]\],/);
  assert.match(html, /if \(DK\.matches && which === 'home' && profile && profile\.is_admin\) \{ switchTab\('wait'\); return; \}/);
});
t('(3) Organisers and partners: four tiles, All / Listed / Partner / Founding with counts, a search, the table; a row opens the organiser beside it', () => {
  assert.match(html, /<div class="wrap" id="pane-orgs" hidden>/);
  assert.match(html, /\[\[ogRows\.length, 'Organisers'\], \[partners\.length, 'Partners'\], \[live, 'Events live'\], \[renewing, 'Renewing this month'\]\]/);
  assert.match(html, /<th>Organiser<\/th><th class="dk">City<\/th><th>Plan<\/th><th>Live<\/th><th class="dk">Renews<\/th><th class="dk">Joined<\/th>/);
  assert.match(html, /<tr data-og-id="' \+ escapeHtml\(o\.id\)/);
  // 4-partners-organisers.png: the organiser opens beside the table; what needs the server says so, and its buttons are off.
  assert.match(html, /'<h4 class="og-sec">Plan and billing<\/h4>[\s\S]*'<h4 class="og-sec">Events<\/h4>[\s\S]*'<h4 class="og-sec">Team links<\/h4>[\s\S]*'<h4 class="og-sec">Welcome pack<\/h4>/);
  assert.match(html, /<button type="button" class="wt-btn" disabled title="Needs the server read">Resend their link<\/button><button type="button" class="wt-btn og-cancel" disabled title="Needs the server read">Cancel plan<\/button>/);
  assert.match(html, /const OG_EV = \{ approved: 'Live', pending: 'In review', rejected: 'Not listed', cancelled: 'Cancelled' \};/);
});
t('(3) Feedback: To sort / All, newest first', () => {
  assert.match(html, /<div class="wrap" id="pane-feedback" hidden>/);
  assert.match(html, /\[\['open', 'To sort', open\.length\], \['all', 'All', fbkRows\.length\]\]/);
});
t('the chips: All, Listings, Edits, Claims, Reported, Orders, Feedback; every row in one group; orders waiting on us are Needs you', () => {
  assert.deepEqual(L.WT_GROUPS.map((g) => g[1]), ['All', 'Listings', 'Edits', 'Claims', 'Reported', 'Orders', 'Feedback']);
  assert.deepEqual(['ready', 'fix', 'claim', 'place', 'flag', 'order', 'feedback'].map((k) => L.wtGroup({ kind: k })), ['listings', 'listings', 'claims', 'reported', 'reported', 'orders', 'feedback']);
  assert.match(html, /const WT_OUR_MOVE = \['paid', 'details_in', 'changes', 'approved'\];/);
  assert.match(html, /kind: 'order', label: 'Order, waiting on us'/);
});
t('fix in place: a pin from lat, lng or a Google Maps link; junk is no pin', () => {
  assert.deepEqual(L.wtPinFrom('3.15123, 101.71234'), { latitude: 3.15123, longitude: 101.71234 });
  assert.deepEqual(L.wtPinFrom('https://www.google.com/maps/place/Arch/@3.1482,101.7127,17z'), { latitude: 3.1482, longitude: 101.7127 });
  assert.equal(L.wtPinFrom('The Arch Galeries'), null);
  assert.equal(L.wtPinFrom('123.4, 500.1'), null);
});
t('fix in place: price (Not set / Free / Paid + amount), credit, kind, venue, pin; values escaped', () => {
  const h = L.wtEditHTML({ e: { price_type: 'paid', price_amount: 35, image_credit: 'A "B"', category: null, venue: 'Arch <G>', latitude: 3.15, longitude: 101.7 } });
  assert.match(h, /<option value="paid" selected>Paid<\/option><\/select><input id="wt-pa" inputmode="decimal" placeholder="From \(amount\)" value="35">/);
  assert.match(h, /id="wt-cr" value="A &quot;B&quot;"/); assert.match(h, /id="wt-ven" value="Arch &lt;G&gt;"/);
  assert.match(h, /id="wt-pin" value="3\.15000, 101\.70000"/);
  assert.match(L.wtEditHTML({ e: { price_type: null } }), /<option value="" selected>Not set<\/option>[\s\S]*id="wt-pa"[^>]* hidden>/);
  assert.match(html, /update\(patch\)\.eq\('id', it\.e\.id\)\.eq\('status', 'pending'\)/);
  assert.match(html, /queueCountryWork\(\{ kind: 'event_photo', eventID: it\.e\.id/);
});
t('W-314 W-Q8-5 / OD-web-Q8-4: each tab shows its last list at once (grey rows the first time) and refreshes in place', () => {
  for (const [tab, rows, render, box] of [['claims', 'clRows', 'renderClaims', 'cl-list'], ['orders', 'orRows', 'renderOrders', 'or-list'], ['inbox', 'ibRows', 'renderInbox', 'ib-list'], ['orgs', 'ogRows', 'renderOrgs', 'og-table'], ['feedback', 'fbkRows', 'renderFeedback', 'fbk-table']]) {
    assert.match(html, new RegExp(`if \\(which === '${tab}'\\) \\{ if \\(${rows}\\.length\\) ${render}\\(\\); else pnSkel\\('${box}'\\);`));
  }
  assert.match(html, /function pnSkel\(id\) \{ const el = \$\(id\); if \(el && !el\.children\.length\) el\.innerHTML = '<div class="pn-skel">/);
});
t('DX-3: a pending listing with the same name as another upcoming one on the same day or at the same venue says Possible duplicate, with both links', () => {
  assert.match(html, /const twinOf = \(e\) => \(live\.data \|\| \[\]\)\.find\(\(r\) => r\.id !== e\.id && norm\(r\.name\) === norm\(e\.name\) && \(day\(r\.start_time\) === day\(e\.start_time\) \|\| \(norm\(r\.venue\) && norm\(r\.venue\) === norm\(e\.venue\)\)\)\)/);
  assert.match(html, /label: same \? 'Listing, possible duplicate' : 'Listing, ready'/);
  assert.match(html, /Open that one ↗<\/a> <a href="https:\/\/app\.unaryx\.com\/e\/' \+ escapeHtml\(it\.e\.id\)/);
});
console.log(bad ? `\n✗ ${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

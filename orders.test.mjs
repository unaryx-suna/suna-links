// W-284 (b) (Ops OPS-326; server I-740 oneoff-order): Orders in the Panel, app.unaryx.com/field.
// Like claims.test.mjs: the logic between the ORDERS markers runs with no browser (clEsc from the
// Claims block), plus the markup checks. `node orders.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const cut = (a, b) => html.slice(html.indexOf(a), html.indexOf(b));
const L = new Function(cut('/* CLAIMS-LOGIC-START */', '/* CLAIMS-LOGIC-END */') + cut('/* ORDERS-LOGIC-START */', '/* ORDERS-LOGIC-END */') + '\nreturn { orDue, orCard, OR_STEP, orDate, orNext, orSort, orListCard, orDetail, ibRow, ibWaiting, ibAgo, orAskSheet };')();
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
const O = { session_id: 'cs_test_abc123def456', country: 'MY', currency: 'myr', items: [{ key: 'cny_kit', qty: 1 }, { key: 'sponsored_post', qty: 2 }], step: 'details_in',
  ready_by: '2027-02-07', event_date: '2027-02-14', rounds_used: 1, extra_rounds_paid: 0, guarantee: true, drafts_url: null, email: 'aiman@kopiping.example', business: 'Kopi <Ping>', amount_total: 35300, staff_note: 'Call first' };
console.log('orders');
t('markup: an admin-only menu row with the due-today count, the Orders pane, on the tab switch; build and worker bumped together', () => {
  assert.match(html, /<button class="opt" id="menu-orders" hidden>Orders <span class="badge zero" id="orders-count">0<\/span>/);
  assert.match(html, /<div class="wrap" id="pane-orders" hidden>/);
  assert.match(html, /\$\('menu-orders'\)\.hidden = !\(profile && profile\.is_admin\);/);
  assert.match(html, /\$\('menu-orders'\)\.hidden = !profile\.is_admin;/);
  assert.match(html, /if \(which === 'orders'\) loadOrders\(true\);/);
  assert.match(html, /const BUILD = 'field-v61';/);
  assert.match(readFileSync(new URL('./public/field-sw.js', import.meta.url), 'utf8'), /CACHE_VERSION = 'field-v61'/);
});
t('every action goes to oneoff-order with this session\'s token (the function checks is_admin); the badge is the server\'s due_today', () => {
  // W-308 Role A: through the Panel's own origin (oneoff-order's CORS answers unaryx.com only); the token goes as before.
  assert.match(html, /fetch\('\/api\/panel-order', \{[\s\S]{0,200}Authorization: 'Bearer ' \+ \(token \|\| SUPABASE_ANON_KEY\)/);
  assert.match(html, /const n = Number\(out\.due_today\) \|\| 0;/);
  for (const a of ['list', 'drafts_sent', 'delivered', 'set_ready_by', 'refund', 'note']) assert.ok(html.includes(`'${a}'`) || html.includes(`action: '${a}'`), a);
});
t('due: ready-by today or past and not finished', () => {
  assert.equal(L.orDue(O, '2027-02-07'), true); assert.equal(L.orDue(O, '2027-02-06'), false);
  assert.equal(L.orDue({ ...O, step: 'delivered' }, '2027-03-01'), false); assert.equal(L.orDue({ ...O, ready_by: null }, '2027-03-01'), false);
});
t('the card: escaped business, items with counts, paid amount + country + guarantee, ready-by, rounds, email, the note; Refund until refunded', () => {
  const h = L.orCard(O, '2027-02-07');
  assert.match(h, /<b>Kopi &lt;Ping&gt;<span class="or-test">TEST<\/span><\/b><span class="or-step due">Details in, due<\/span>/);
  assert.match(h, /Items<\/span><span>Chinese New Year content kit, Sponsored post × 2</);
  assert.match(h, /Paid<\/span><span>RM353, MY, guarantee</);
  assert.match(h, /Ready by<\/span><span>7 Feb 2027</); assert.match(h, /Rounds<\/span><span>1 used</);
  assert.match(h, />Call first<\/textarea>/);
  assert.deepEqual([...h.matchAll(/data-or="(\w+)"/g)].map((m) => m[1]), ['drafts_sent', 'delivered', 'set_ready_by', 'refund']);
  assert.doesNotMatch(L.orCard({ ...O, step: 'refunded' }, '2027-02-07'), /data-or="refund"/);
});
t('Ops 23 Nov: the next step is the one white button (Send drafts, then Mark delivered); dates as "23 Nov"', () => {
  const cls = (step) => [...L.orCard({ ...O, step }, '2027-02-07').matchAll(/class="(\w+)" data-or="(\w+)"/g)].filter((m) => m[1] === 'primary').map((m) => m[2]);
  assert.deepEqual(cls('paid'), ['drafts_sent']); assert.deepEqual(cls('details_in'), ['drafts_sent']);
  assert.deepEqual(cls('drafts_sent'), ['delivered']); assert.deepEqual(cls('approved'), ['delivered']);
  assert.deepEqual(cls('delivered'), []); assert.deepEqual(cls('refunded'), []);
  assert.equal(L.orDate('2026-11-23', 2026), '23 Nov'); assert.equal(L.orDate('2027-02-07', 2026), '7 Feb 2027'); assert.equal(L.orDate('', 2026), '');
});
t('W-307 (12): a Stripe test order carries a TEST tag (livemode false or a cs_test_ session); a live one does not', () => {
  assert.match(L.orCard({ ...O, livemode: false }, '2027-02-07'), /<span class="or-test">TEST<\/span>/);
  assert.match(L.orCard({ ...O, session_id: 'cs_test_abc' }, '2027-02-07'), /or-test/);
  assert.doesNotMatch(L.orCard({ ...O, session_id: 'cs_live_abc', livemode: true }, '2027-02-07'), /or-test/);
});
t('W-308 DEX-142 H: late first, then by ready-by; a LATE chip and the overdue task\'s date; finished last', () => {
  const late = { ...O, session_id: 'cs_a', ready_by: '2027-02-20', checklist: [{ item: 'cny_kit', task: 'drafts', label: 'Send design drafts', due: '2027-02-01', done: false, overdue: true, step: 'drafts_sent' }] };
  const soon = { ...O, session_id: 'cs_b', ready_by: '2027-02-10', checklist: [] }, done = { ...O, session_id: 'cs_c', step: 'delivered', ready_by: '2027-01-01', checklist: [] };
  assert.deepEqual(L.orSort([done, soon, late]).map((o) => o.session_id), ['cs_a', 'cs_b', 'cs_c']);
  assert.match(L.orListCard(late), /class="or2 late"[\s\S]*<span class="chip late">LATE<\/span>[\s\S]*<span class="rb">Send design drafts due 1 Feb 2027<\/span>/);
  assert.match(L.orListCard({ ...soon, step: 'paid' }), /<span class="chip ">NEEDS DETAILS<\/span>[\s\S]*<span class="rb">Ready 10 Feb 2027<\/span>/);
});
t('W-308 DEX-142 I: one order: organiser details to copy, Steps (Details in Needed at paid), timeline steps open their form, our tasks tick with check', () => {
  const o = { ...O, step: 'paid', phone: '+60 12 345 6789', checklist: [{ item: 'cny_kit', task: 'brief', label: 'Confirm the brief', due: '2027-01-20', done: false, overdue: false },
    { item: 'cny_kit', task: 'drafts', label: 'Send design drafts', due: '2027-01-26', done: false, overdue: false, step: 'drafts_sent' }] };
  const h = L.orDetail(o);
  assert.match(h, /<span class="ey">ORGANISER<\/span><h2>Kopi &lt;Ping&gt;<\/h2>[\s\S]*data-copy="aiman@kopiping.example"[\s\S]*data-copy="\+60 12 345 6789"/);
  assert.match(h, /class="od-ck done" disabled><i>✓<\/i><span>Paid<\/span>/);
  assert.match(h, /<span>Details in<\/span><em class="need">Needed<\/em>/);
  assert.match(h, /data-or="drafts_sent" data-id="cs_test_abc123def456"><i><\/i><span>Drafts sent<\/span><em>26 Jan 2027<\/em>/);
  assert.match(h, /<p class="od-h">WE PROVIDE<\/p><button type="button" class="od-ck" data-or-check="cny_kit:brief"/);
  assert.match(html, /orCall\(\{ action: 'check', session_id: b\.dataset\.id, item, task \}\)/);
});
t('W-308 DEX-142 G: Inbox: kind chips, red edge for what needs us (unread), purple for news, TEST tagged and hidden behind the switch, tap marks read', () => {
  const now = Date.parse('2026-11-24T05:00:00Z');
  const a = L.ibRow({ id: 'x', kind: 'event_listed', title: 'QA <Night>', test: false, detail: { venue_pinned: false }, created_at: '2026-11-24T04:51:00Z', read_at: null }, now);
  assert.match(a, /class="ib-row act"[\s\S]*<span class="ago">9m<\/span><span class="ib-k ">NEW LISTING<\/span><b>QA &lt;Night&gt;<\/b><small>No pin<\/small>/);
  const p = L.ibRow({ id: 'y', kind: 'payment_received', title: 'qa', test: true, detail: {}, created_at: '2026-11-24T04:00:00Z', read_at: null }, now);
  assert.match(p, /class="ib-row test"[\s\S]*<span class="ib-k t">TEST<\/span><span class="ib-k p">PAID<\/span>/);
  assert.equal(L.ibWaiting({ kind: 'extra_bought', read_at: null }), true); assert.equal(L.ibWaiting({ kind: 'partner_joined', read_at: null }), false);
  assert.match(html, /<div class="wrap" id="pane-inbox" hidden>/); assert.match(html, /orCall\(\{ action: 'inbox_read', id: it\.id \}\)/);
  assert.match(html, /const rows = ibRows\.filter\(\(x\) => \(showTest \|\| !x\.test\)/);
});
t('W-308 DEX-142 I2/I3: Ask for details again: Logo and Event details ticked, Delivery address not; Send to their email; Details in reads "Asked again HH:MM"; ask_details through the forwarder', () => {
  const o = { ...O, step: 'paid', checklist: [], needs_you: { missing: ['Your logo'], asked_at: '2026-11-24T04:30:00Z' } };
  const d = L.orDetail(o);
  assert.match(d, /<span>Details in<\/span><em>Asked again 12:30<\/em>/);
  assert.match(d, /data-or-ask="cs_test_abc123def456">Ask for details again<\/button>/);
  const sh = L.orAskSheet(o);
  assert.match(sh, /value="Your logo" checked><span>Logo<\/span>[\s\S]*value="Event details" checked>[\s\S]*value="Delivery address"><span>Delivery address<\/span>/);
  assert.match(sh, /<div class="od-to"><span>aiman@kopiping\.example<\/span><small>Email<\/small><\/div>/);
  assert.match(html, /orCall\(\{ action: 'ask_details', session_id: id, missing \}\)/);
  assert.doesNotMatch(L.orDetail({ ...o, step: 'delivered' }), /data-or-ask=/);
});
const { createRequire } = await import('node:module');
const PO = createRequire(import.meta.url)('./api/panel-order.js');
const call = async (req) => { const out = {}; await PO({ headers: {}, ...req }, { setHeader() {}, status(c) { out.c = c; return this; }, end(b) { out.b = b; } }); return out; };
{
  const seen = []; globalThis.fetch = async (u, o) => { seen.push({ u, o }); return { status: 200, text: async () => '{"items":[]}' }; };
  const a = await call({ method: 'GET' }); assert.equal(a.c, 405);
  const b = await call({ method: 'POST', body: { action: 'details' }, headers: { authorization: 'Bearer ' + 'x'.repeat(40) } }); assert.equal(b.c, 400, 'buyer actions never come this way');
  const c = await call({ method: 'POST', body: { action: 'inbox_list' }, headers: {} }); assert.equal(c.c, 401);
  const d = await call({ method: 'POST', body: { action: 'inbox_list' }, headers: { authorization: 'Bearer ' + 'x'.repeat(40), apikey: 'k' } });
  assert.equal(d.c, 200); assert.equal(seen.length, 1); assert.equal(seen[0].u, 'https://voogrbonwmvfwtgzzrxc.supabase.co/functions/v1/oneoff-order');
  assert.equal(seen[0].o.headers.Authorization, 'Bearer ' + 'x'.repeat(40)); assert.equal(JSON.parse(seen[0].o.body).action, 'inbox_list');
  console.log('  ok   panel-order forwarder checks');
}
console.log(bad ? `\n✗ ${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

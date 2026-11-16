// W-235: the Door shows every refusal as a full-screen red "Not valid" with the reason in words;
// green only for a ticket this scan checked in. usage: node w235.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('/* TICKETS-LOGIC-START */'), html.indexOf('/* TICKETS-LOGIC-END */'));
const L = new Function(block + '\nreturn { tkDoorResult, tkTime };')();

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

const NOW = Date.parse('2026-12-05T12:00:00Z');
const at = '2026-12-05T11:42:00Z', hhmm = L.tkTime(at);
const paid = { id: 't1', buyer_name: 'Mira Lee', event_name: 'Suna Founders Night', status: 'paid', seat_no: 7, checked_in: true, already_used: false, checked_in_at: at };
const unused = { ...paid, checked_in: false, checked_in_at: null };
const WHO = 'Mira Lee · Suna Founders Night · No. 007';

t('paid, first scan: green Valid with the name', () => {
  assert.deepEqual(L.tkDoorResult(paid, null, NOW), ['ok', 'Valid', 'Mira Lee', `Suna Founders Night · No. 007 · in at ${hhmm}`]);
});
t('refunded: red Not valid, "Refunded"', () => {
  assert.deepEqual(L.tkDoorResult({ ...unused, status: 'refunded' }, null, NOW), ['no', 'Not valid', 'Refunded', WHO]);
});
t('refunded after it was used: still "Refunded", never the used/green look', () => {
  assert.deepEqual(L.tkDoorResult({ ...paid, status: 'refunded', already_used: true }, null, NOW).slice(0, 3), ['no', 'Not valid', 'Refunded']);
});
t('cancelled (released): red Not valid, "Cancelled"', () => {
  assert.deepEqual(L.tkDoorResult({ ...unused, status: 'cancelled' }, null, NOW), ['no', 'Not valid', 'Cancelled', WHO]);
});
t('expired hold (pending, past expires_at in the Door list): "Hold expired"', () => {
  const row = { id: 't1', status: 'pending', expires_at: '2026-12-05T11:00:00Z', claimed_paid_at: null };
  assert.deepEqual(L.tkDoorResult({ ...unused, status: 'pending' }, row, NOW), ['no', 'Not valid', 'Hold expired', WHO]);
});
t('pending, hold still running or list not loaded: "Not paid yet"', () => {
  const row = { id: 't1', status: 'pending', expires_at: '2026-12-05T12:20:00Z' };
  assert.deepEqual(L.tkDoorResult({ ...unused, status: 'pending' }, row, NOW).slice(0, 3), ['no', 'Not valid', 'Not paid yet']);
  assert.deepEqual(L.tkDoorResult({ ...unused, status: 'pending' }, null, NOW).slice(0, 3), ['no', 'Not valid', 'Not paid yet']);
});
t('pending, they tapped "I\'ve paid": "Not paid yet", pointing at Payments', () => {
  const v = L.tkDoorResult({ ...unused, status: 'pending' }, { id: 't1', claimed_paid_at: '2026-12-05T11:50:00Z' }, NOW);
  assert.deepEqual(v.slice(0, 3), ['no', 'Not valid', 'Not paid yet']);
  assert.match(v[3], /check Payments/);
});
t('already checked in: red Not valid, "Already used at 19:42"-style time', () => {
  assert.deepEqual(L.tkDoorResult({ ...paid, already_used: true }, null, NOW), ['no', 'Not valid', `Already used at ${hhmm}`, WHO]);
});
t('unknown code (P0002): red Not valid, "Unknown code"', () => {
  assert.deepEqual(L.tkDoorResult({ error: 'not_found' }, null, NOW).slice(0, 3), ['no', 'Not valid', 'Unknown code']);
});
t('not a ticket at all: red Not valid', () => {
  assert.deepEqual(L.tkDoorResult({ error: 'not_a_ticket' }, null, NOW).slice(0, 3), ['no', 'Not valid', 'Not a Suna ticket']);
});
t('the check failed (network, not admin): amber "Couldn\'t check", never green, never a verdict on the ticket', () => {
  for (const r of [{ error: 'failed' }, { error: 'failed', message: 'Only an admin can check tickets in.' }, null, {}]) {
    const v = L.tkDoorResult(r, null, NOW);
    assert.equal(v[0], 'err'); assert.equal(v[1], "Couldn't check");
  }
});
t('no refusal is ever green', () => {
  const cases = [{ ...unused, status: 'refunded' }, { ...unused, status: 'cancelled' }, { ...unused, status: 'pending' },
    { ...paid, already_used: true }, { ...paid, status: 'refunded', already_used: true }, { error: 'not_found' }];
  for (const r of cases) assert.notEqual(L.tkDoorResult(r, null, NOW)[0], 'ok');
});
t('the screen: a full-screen verdict element, red/green/amber, a Next ticket button; the camera pauses while it shows', () => {
  assert.match(html, /<div class="dr-verdict" id="dr-verdict" role="alert" hidden>/);
  assert.match(html, /\.dr-verdict \{ position: fixed; inset: 0;/);
  assert.match(html, /\.dr-verdict\.no \{ background: #B3261E; \}/);
  assert.match(html, /id="dr-v-next">Next ticket</);
  assert.match(html, /if \(drBusy \|\| looking \|\| drShowing\(\) \|\| v\.readyState < 2\) return;/);
  assert.match(html, /if \(v\[0\] === 'ok'\) drHideTimer = setTimeout\(drHide, 2500\);/);
});

process.exit(bad ? 1 : 0);

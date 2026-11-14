// W-228 (Ops OPS-188): Payments and Door in the Panel, app.unaryx.com/field,
// for tickets to Suna-hosted events. The logic sits between two markers in
// public/field.html; this runs that block with no browser, plus the markup
// and wiring checks. `node w228.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('/* TICKETS-LOGIC-START */'), html.indexOf('/* TICKETS-LOGIC-END */'));
const L = new Function(block + '\nreturn { tkEsc, tkRM, tkParseCode, tkState, tkCounts, tkMatches, tkCard, tkDoorResult, tkTime };')();

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const NOW = Date.parse('2026-12-01T04:00:00Z');
const ID = '11111111-2222-4333-8444-555555555555';
const T = { id: ID, event_id: 'e1', event_name: 'Suna Founders Night', status: 'pending', pay_ref: 'SUNA-7F3K', name: 'Mira <Lee>', amount_due: 20, paid_via: null,
  claimed_paid_at: null, expires_at: '2026-12-01T04:20:00Z', paid_at: null, checked_in_at: null, proof_path: null };

t('markup: admin-only menu rows (Payments with a count, Door), both panes, #payments and #door after sign-in and on hashchange', () => {
  assert.match(html, /<button class="opt" id="menu-payments" hidden>Payments <span class="badge zero" id="payments-count">0<\/span>/);
  assert.match(html, /<button class="opt" id="menu-door" hidden>Door</);
  assert.match(html, /<div class="wrap" id="pane-payments" hidden>/);
  assert.match(html, /<div class="wrap" id="pane-door" hidden>/);
  for (const m of ['payments', 'door']) {
    assert.match(html, new RegExp(`\\$\\('menu-${m}'\\)\\.hidden = !\\(profile && profile\\.is_admin\\);`));
    assert.match(html, new RegExp(`\\$\\('menu-${m}'\\)\\.hidden = !profile\\.is_admin;`));
    assert.equal((html.match(new RegExp(`if \\(location\\.hash === '#${m}'\\) switchTab\\('${m}'\\);`, 'g')) || []).length, 2, m);
  }
  assert.match(html, /'claims', 'review', 'payments', 'door'\]\) \{/);
  assert.match(html, /if \(which === 'door'\) loadTickets\('door'\); else drStop\(\);/, 'the camera stops when the Door is left');
});

t('the server: only I-604\'s admin RPCs with this session (each checks is_admin); the Panel never reads or writes event_tickets itself; the build and the cache move together', () => {
  for (const fn of ['admin_ticket_list', 'mark_ticket_paid', 'release_ticket', 'mark_ticket_refunded', 'check_in_ticket']) assert.match(html, new RegExp(`'${fn}'`), fn);
  assert.doesNotMatch(html, /from\('event_tickets'\)/);
  assert.match(html, /tkRpc\(TK_API\[act\], \{ pay_ref: b\.dataset\.ref, by: tkBy \}\)/);
  assert.match(html, /tkRpc\(TK_API\.checkIn, \{ p_code: code \}\)/);
  const build = html.match(/const BUILD = '([^']+)'/)[1];
  assert.equal(build, 'field-v45');
  assert.ok(readFileSync(new URL('./public/field-sw.js', import.meta.url), 'utf8').includes(`const CACHE_VERSION = '${build}';`));
});

t('a scan or a typed line: the ticket id out of its unaryx.com/t/ address or bare; a reference in capitals; nothing else', () => {
  assert.equal(L.tkParseCode(`https://unaryx.com/t/${ID}`), ID);
  assert.equal(L.tkParseCode(`  ${ID.toUpperCase()} `), ID);
  assert.equal(L.tkParseCode(' suna-7f3k '), 'SUNA-7F3K');
  assert.equal(L.tkParseCode('suna 7f3k'), 'SUNA7F3K');
  for (const x of ['', '   ', 'abc', 'https://example.com/', '<script>', "x'; drop table"]) assert.equal(L.tkParseCode(x), '', x);
});

t('states and counts: holding, says paid, paid, checked in; a hold that ran out with no "I\'ve paid" is closed, one with it stays waiting', () => {
  assert.equal(L.tkState(T, NOW), 'pending');
  assert.equal(L.tkState({ ...T, expires_at: '2026-12-01T03:59:00Z' }, NOW), 'closed');
  assert.equal(L.tkState({ ...T, expires_at: '2026-12-01T03:59:00Z', claimed_paid_at: '2026-12-01T03:50:00Z' }, NOW), 'claimed');
  assert.equal(L.tkState({ ...T, status: 'paid' }, NOW), 'paid');
  for (const s of ['cancelled', 'refunded']) assert.equal(L.tkState({ ...T, status: s }, NOW), 'closed');
  const rows = [T, { ...T, claimed_paid_at: '2026-12-01T03:50:00Z' }, { ...T, status: 'paid' }, { ...T, status: 'paid', checked_in_at: '2026-12-05T11:42:00Z' }, { ...T, status: 'refunded' }];
  assert.deepEqual(L.tkCounts(rows, NOW), { pending: 1, claimed: 1, paid: 2, in: 1 });
});

t('a Payments card: reference, amount, member (escaped), event; Mark paid and Release while waiting; Mark refunded once paid; a receipt button only when there is one', () => {
  const said = L.tkCard({ ...T, claimed_paid_at: '2026-12-01T03:50:00Z', proof_path: 'u1/r.jpg' }, NOW);
  assert.match(said, /<b>SUNA-7F3K<\/b><b>RM20<\/b>/);
  assert.match(said, /Mira &lt;Lee&gt;/);
  assert.match(said, /Suna Founders Night/);
  assert.match(said, /Says paid 10 min ago/);
  assert.match(said, /data-tk="paid" data-ref="SUNA-7F3K">Mark paid</);
  assert.match(said, /data-tk="release" data-ref="SUNA-7F3K">Release</);
  assert.match(said, /data-tk="receipt" data-path="u1\/r\.jpg">Receipt</);
  const hold = L.tkCard(T, NOW);
  assert.match(hold, /Hold until \d\d:\d\d/);
  assert.doesNotMatch(hold, /data-tk="receipt"/);
  const paid = L.tkCard({ ...T, status: 'paid', paid_via: 'duitnow', amount_due: 22.5, checked_in_at: '2026-12-05T11:42:00Z' }, NOW);
  assert.match(paid, /Paid · duitnow/);
  assert.match(paid, /RM22\.50/);
  assert.match(paid, /In at \d\d:\d\d/);
  assert.match(paid, /data-tk="refunded"/);
  assert.doesNotMatch(paid, /data-tk="paid"|data-tk="release"/);
  const closed = L.tkCard({ ...T, status: 'refunded' }, NOW);
  assert.match(closed, /Refunded/);
  assert.doesNotMatch(closed, /<button/);
  assert.equal(L.tkMatches(T, 'mira'), true);
  assert.equal(L.tkMatches(T, '7f3'), true);
  assert.equal(L.tkMatches(T, 'zzz'), false);
});

t('the Door: first scan shows the name and Paid; a second says "Already checked in at"; unpaid and unknown are refused in words; release and refund need a second tap', () => {
  const at = '2026-12-05T11:42:00Z', hhmm = L.tkTime(at);
  assert.deepEqual(L.tkDoorResult({ ok: true, name: 'Mira Lee', event_name: 'Suna Founders Night', checked_in_at: at, already: false }), ['ok', 'Mira Lee', `Paid · checked in at ${hhmm} · Suna Founders Night`]);
  assert.deepEqual(L.tkDoorResult({ ok: true, name: 'Mira Lee', event_name: 'Suna Founders Night', checked_in_at: at, already: true }), ['warn', `Already checked in at ${hhmm}`, 'Mira Lee · Suna Founders Night']);
  assert.deepEqual(L.tkDoorResult({ ok: false, error: 'not_paid', name: 'Mira Lee', status: 'pending' }).slice(0, 2), ['no', 'Not paid']);
  assert.deepEqual(L.tkDoorResult({ ok: false, error: 'not_found' }).slice(0, 2), ['no', 'No such ticket']);
  assert.deepEqual(L.tkDoorResult(null), ['no', 'Not checked in', "That didn't work. Try again."]);
  assert.match(html, /if \(act !== 'paid' && b\.dataset\.armed !== '1'\)/);
  assert.match(html, /if \(!raw \|\| raw === drLast\) return;/, 'one check per ticket held up, not one per frame');
});

console.log(bad ? `\n${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

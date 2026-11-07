// W-202 (Ops OPS-138): Claims in the Panel, app.unaryx.com/field. The logic
// sits between two markers in public/field.html; this runs that block with
// no browser, plus the markup checks. `node claims.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('/* CLAIMS-LOGIC-START */'), html.indexOf('/* CLAIMS-LOGIC-END */'));
const L = new Function(block + '\nreturn { clEsc, clAgo, clSite, clCard, clApprovedRow, clBody, clOrgFilter };')();

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const NOW = Date.parse('2026-11-07T02:00:00Z');
const C = {
  id: '11111111-2222-4333-8444-555555555555', status: 'pending', created_at: '2026-11-07T00:00:00Z', name: 'Rachel <Tan>', role: 'organiser',
  email: 'ra***@emspaced.com', email_full: 'rachel@emspaced.com', proof: 'https://www.emspaced.com/', message: 'We run it', domain_match: true,
  event: { id: 'e1', name: 'Free Coworking Thursday', start_time: '2026-12-03T01:00:00Z', city: 'Kuala Lumpur', organiser: null },
};

t('markup: an admin-only menu row with a count, the Claims pane, #claims after sign-in and on hashchange', () => {
  assert.match(html, /<button class="opt" id="menu-claims" hidden>Claims <span class="badge zero" id="claims-count">0<\/span>/);
  assert.match(html, /<div class="wrap" id="pane-claims" hidden>/);
  assert.match(html, /\$\('menu-claims'\)\.hidden = !\(profile && profile\.is_admin\);/);
  assert.match(html, /\$\('menu-claims'\)\.hidden = !profile\.is_admin;/);
  assert.equal((html.match(/if \(location\.hash === '#claims'\) switchTab\('claims'\);/g) || []).length, 2);
  assert.match(html, /'addplace', 'claims', 'review'\]\) \{/);
});

t('every decision goes through event-claim with this session\'s token (the function checks is_admin); no other read of claims', () => {
  assert.match(html, /fetch\(SUPABASE_URL \+ '\/functions\/v1\/event-claim'/);
  assert.match(html, /Authorization: 'Bearer ' \+ \(token \|\| SUPABASE_ANON_KEY\)/);
  assert.doesNotMatch(html, /from\('event_submissions'\)/);
});

t('a card: event, date and city, claimant (escaped), the full email with Reply, the proof link, the message, the domain match, three actions', () => {
  const card = L.clCard(C, NOW);
  assert.match(card, /<strong>Free Coworking Thursday<\/strong>/);
  assert.match(card, /2 h ago/);
  assert.match(card, /Thu 3 Dec · Kuala Lumpur/);
  assert.match(card, /Rachel &lt;Tan&gt; · Organiser/);
  assert.match(card, /rachel@emspaced\.com \(confirmed\) · <a href="mailto:rachel@emspaced\.com\?subject=Your%20claim%20for%20Free%20Coworking%20Thursday%20on%20Suna">Reply<\/a>/);
  assert.match(card, /<a href="https:\/\/www\.emspaced\.com\/" target="_blank" rel="noopener noreferrer">emspaced\.com<\/a>/);
  assert.match(card, /“We run it”/);
  assert.match(card, /Email matches organiser’s site/);
  for (const a of ['approve', 'ask_proof', 'turn_down']) assert.match(card, new RegExp(`data-cl="${a}"`));
});

t('a proof that isn\'t https is shown as text, never a link; a dispute is marked', () => {
  const card = L.clCard({ ...C, proof: 'javascript:alert(1)', status: 'dispute', email_full: null }, NOW);
  assert.doesNotMatch(card, /href="javascript/);
  assert.match(card, /<span class="cl-tag red">Dispute<\/span>/);
  assert.match(card, /ra\*\*\*@emspaced\.com \(confirmed\)/, 'masked when the function sends no full email');
});

t('approved recently: Resend where allowed; never for Me-You Market or Intrigue Summit (emailed by hand)', () => {
  assert.match(L.clApprovedRow({ ...C, resend: true, decided_at: '2026-11-06T02:00:00Z' }), /data-cl="resend"/);
  for (const name of ['Me-You Market KL', 'Intrigue Summit 2026']) {
    const r = L.clApprovedRow({ ...C, resend: true, event: { ...C.event, name } });
    assert.doesNotMatch(r, /data-cl="resend"/, name);
    assert.match(r, /emailed by hand/, name);
  }
});

t('the bodies: approve links an existing organiser by id, or creates one (name + https website only); turn down needs a reason; ask for proof; resend', () => {
  assert.deepEqual(L.clBody('approve', 'x', { existing: { id: 'org1' }, text: 'ignored' }), { action: 'approve', id: 'x', organiser: { id: 'org1' } });
  assert.deepEqual(L.clBody('approve', 'x', { text: ' Emspaced ', website: 'https://emspaced.com' }), { action: 'approve', id: 'x', organiser: { name: 'Emspaced', website: 'https://emspaced.com' } });
  assert.deepEqual(L.clBody('approve', 'x', { text: 'Emspaced', website: 'javascript:1' }), { action: 'approve', id: 'x', organiser: { name: 'Emspaced' } });
  assert.ok(L.clBody('approve', 'x', { text: 'E' }).error);
  assert.ok(L.clBody('turn_down', 'x', { text: 'no' }).error);
  assert.deepEqual(L.clBody('turn_down', 'x', { text: 'Not the organiser' }), { action: 'turn_down', id: 'x', reason: 'Not the organiser' });
  assert.deepEqual(L.clBody('ask_proof', 'x', { text: '' }), { action: 'ask_proof', id: 'x', note: '' });
  assert.deepEqual(L.clBody('resend', 'x', {}), { action: 'resend_approved', id: 'x' });
});

t('finding an organiser we have: a slug, or a website by host; prefill never uses an Instagram link as a website', () => {
  assert.equal(L.clOrgFilter('emspaced'), 'slug.eq.emspaced');
  assert.equal(L.clOrgFilter('https://www.emspaced.com/about'), 'website.ilike.*emspaced.com*');
  assert.equal(L.clOrgFilter('emspaced.com'), 'website.ilike.*emspaced.com*');
  assert.equal(L.clOrgFilter(''), null);
  assert.equal(L.clOrgFilter('a,b),or(x'), null);
  assert.equal(L.clSite('https://instagram.com/emspaced'), '');
  assert.equal(L.clSite('https://emspaced.com'), 'https://emspaced.com');
});

if (bad) { console.log(`\n✗ ${bad} failed`); process.exit(1); }
console.log('\n✓ claims in the Panel');

// W-247 (Ops OPS-240; iOS I-680): a printed sticker can be a checkpoint. The /cp/ page names a
// checkpoint sticker's place; the Panel assigns a sticker on a place. usage: node w247.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let seen = [], answers = [];
globalThis.fetch = async (url, opts) => { seen.push({ url: String(url), opts }); const a = answers.shift(); if (!a) return { ok: true, status: 200, json: async () => [] }; return a(); };
const rows = (r) => () => ({ ok: true, status: 200, json: async () => r });
const { placeFor, checkpointBody } = await import('./api/checkpoint.js');
const KEY = 'service-key-for-tests';
const BASE = 'https://voogrbonwmvfwtgzzrxc.supabase.co/rest/v1/';
const CP_ID = '0b5b2a4e-1f1c-4f6e-9d55-2c3a4b5c6d7e';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('a checkpoint sticker: /cp/ code first, then the sticker row, then its active checkpoint\'s place name', async () => {
  seen = []; answers = [rows([]), rows([{ target: CP_ID }]), rows([{ landmarks: { name: 'Emspaced @ KL Sentral' } }])];
  assert.equal(await placeFor('K7M2PQ', KEY), 'Emspaced @ KL Sentral');
  assert.deepEqual(seen.map((s) => s.url), [
    BASE + 'checkpoints?code=eq.k7m2pq&active=is.true&select=landmarks(name)&limit=1',
    BASE + 'print_codes?code=eq.K7M2PQ&kind=eq.sticker&target_type=eq.checkpoint&select=target&limit=1',
    BASE + `checkpoints?id=eq.${CP_ID}&active=is.true&select=landmarks(name)&limit=1`,
  ]);
  for (const s of seen) { assert.equal(s.opts.headers.apikey, KEY); assert.ok(s.opts.signal); assert.ok(!s.opts.method || s.opts.method === 'GET'); }
  // Lower case as typed works the same.
  seen = []; answers = [rows([]), rows([{ target: CP_ID }]), rows([{ landmarks: { name: 'X' } }])];
  assert.equal(await placeFor('k7m2pq', KEY), 'X');
});
await t('the checkpoint\'s own code is never asked for or shown; only the name', async () => {
  seen = []; answers = [rows([]), rows([{ target: CP_ID }]), rows([{ landmarks: { name: 'P' } }])];
  await placeFor('K7M2PQ', KEY);
  for (const s of seen) assert.doesNotMatch(s.url, /select=[^&]*\bcode\b/, 'no code column selected');
  const body = checkpointBody('K7M2PQ', 'P');
  assert.doesNotMatch(body, new RegExp(CP_ID));
});
await t('a /cp/ code that matches stops there (no sticker read)', async () => {
  seen = []; answers = [rows([{ landmarks: { name: 'Kwai Chai Hong' } }])];
  assert.equal(await placeFor('abcd23', KEY), 'Kwai Chai Hong');
  assert.equal(seen.length, 1);
});
await t('unassigned, non-checkpoint, retired, bad target, failed or no key: null; non-sticker shapes never read print_codes', async () => {
  for (const a of [[rows([]), rows([])], [rows([]), rows([{ target: 'not-a-uuid' }])], [rows([]), rows([{ target: CP_ID }]), rows([])], [rows([]), () => { throw new Error('down'); }]]) {
    answers = a; assert.equal(await placeFor('K7M2PQ', KEY), null);
  }
  answers = [];
  assert.equal(await placeFor('K7M2PQ', ''), null);
  seen = [];
  for (const c of ['4FWGW0', 'K7M2PQX', 'KL-KWAI-01', 'IOIOIO']) { answers = []; await placeFor(c, KEY); }
  assert.ok(!seen.some((s) => s.url.includes('print_codes')), 'only the print alphabet, 6 characters');
});

// The Panel.
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const block = html.slice(html.indexOf('/* STICKER-LOGIC-START */'), html.indexOf('/* STICKER-LOGIC-END */'));
const L = new Function(block + '\nreturn { stickerCode, stickerError, stickerDone };')();
await t('Panel: the box is admin-only, on a saved place, and calls only assign_sticker_checkpoint with the session', () => {
  assert.match(html, /<div class="fg fg-hide" id="sk-box" hidden>/);
  assert.match(html, /const show = !!\(profile && profile\.is_admin && cap && cap\.editing && cap\.onServer && cap\.id\);/);
  assert.match(html, /db\.rpc\('assign_sticker_checkpoint', \{\s*p_code: code, p_landmark_id: cap\.id, p_label:/);
  assert.equal((html.match(/renderSticker\(\);/g) || []).length, 3, 'on open (twice) and on reset');
  assert.match(html, /const BUILD = 'field-v72';/);
  assert.match(readFileSync(new URL('./public/field-sw.js', import.meta.url), 'utf8'), /CACHE_VERSION = 'field-v72'/);
});
await t('Panel: sticker codes as typed', () => {
  assert.equal(L.stickerCode(' k7m-2pq '), 'K7M2PQ');
  for (const c of ['', '4FWGW', 'K7M2PQ7', '4FWGW0', 'ABCDE1', null]) assert.equal(L.stickerCode(c), null, String(c));
});
await t('Panel: every refusal in words', () => {
  const e = (m) => L.stickerError({ message: m });
  assert.equal(e('admins only'), 'Only an admin can assign stickers.');
  assert.equal(e('unknown code'), 'No sticker has that code. Check the letters under the QR.');
  assert.equal(e('not a sticker (card)'), "That code isn't a sticker (it's printed on: card).");
  assert.equal(e('not a sticker (insert-meet-someone)'), "That code isn't a sticker (it's printed on: insert-meet-someone).");
  assert.equal(e('sticker already points at a partner'), "That sticker already points at a partner, so it can't be a checkpoint.");
  assert.equal(e('sticker already points at a event'), "That sticker already points at an event, so it can't be a checkpoint.");
  assert.equal(e('unknown place'), "This place isn't on the server yet. Save it first.");
  assert.equal(e('Could not find the function public.assign_sticker_checkpoint'), 'Could not assign the sticker: Could not find the function public.assign_sticker_checkpoint.');
  assert.equal(L.stickerDone({ code: 'K7M2PQ', label: 'By the door' }, 'Emspaced'), 'Sticker K7M2PQ is now a checkpoint at Emspaced (By the door).');
  assert.equal(L.stickerDone({ code: 'K7M2PQ', label: null }, ''), 'Sticker K7M2PQ is now a checkpoint at this place.');
});

if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');

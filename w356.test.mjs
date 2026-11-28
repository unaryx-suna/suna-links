// W-356 (Brian 28 Nov 18:0x: "When you change the hours on a place that's already there, it says Saved but nothing
// actually saves"): since 21 Sep an edit of an existing place only uploaded photos (and returned at once without
// any), so hours, name, note, address, building, category, location and city were dropped while the queue said
// Saved. Now ONE targeted update of the edited columns, read back before 'Saved'. Also (Ops on OPS-367): typing one
// day's hours saves only that day, and typed hours need an Hours source. The Panel's own functions, run with a fake
// database: `node w356.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const H = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const fn = (name) => { const i = H.indexOf(`function ${name}(`); assert.ok(i >= 0, name); let d = 0, j = H.indexOf('{', i); for (; j < H.length; j++) { if (H[j] === '{') d++; else if (H[j] === '}' && --d === 0) break; } return H.slice(H.lastIndexOf('\n', i) + 1, j + 1); };
const block = (start, end) => H.slice(H.indexOf(start), H.indexOf(end, H.indexOf(start)) + end.length);
let bad = 0;
const t = async (name, f) => { try { await f(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

// a fake landmarks table that applies an update and hands back what's stored
const table = new Map();
let refuse = false, bend = null, calls = [];
const db = { from: () => ({ update: (patch) => ({ eq: (_c, id) => ({ select: async (cols) => {
  calls.push({ patch, id, cols });
  if (refuse || !table.has(id)) return { data: [], error: null };
  const row = Object.assign(table.get(id), JSON.parse(JSON.stringify(patch)));
  if (bend) Object.assign(row, bend);
  return { data: [cols.split(',').reduce((o, c) => { o[c] = row[c]; return o; }, {})], error: null };
} }) }) }) };
const ctx = vm.createContext({ db, console, JSON, Object, Math, Set, Error, Date, Number, cap: null });
vm.runInContext([block("const EDIT_NEVER = new Set([", ']);'), fn('editPatch'), fn('sameValue'), fn('writeEditedColumns'), fn('looksLikeAuthFailure'),
  "const SIGNED_OUT_MESSAGE = 'x';", block('const DAY_NAMES = [', '];'), block('const MON_FIRST = [', '];'), fn('inheritedFrom'), fn('effectivePeriods'), fn('hhmm'), fn('ampm'), fn('buildOperatingHours')].join('\n'), ctx);
const ID = 'p1';
const fresh = () => table.set(ID, { id: ID, name: 'National Mosque', description: 'old', operating_hours: null, hours_source: null, hours_source_ref: null,
  photographer_name: 'Wee Hong', cover_source: 'commons', cover_source_ref: 'commons:X.jpg · CC BY-SA 4.0', cover_image_url: 'https://x/c.jpg', is_hidden: false, approval_status: 'approved', submitted_by: 'u0', origin: 'catalogue' });
const write = (row) => vm.runInContext('writeEditedColumns(' + JSON.stringify(row) + ')', ctx);

await t('the queue no longer returns before writing an edit: it writes the edited columns, then the photos', () => {
  assert.match(H, /if \(item\.editing\) \{[^]*?await writeEditedColumns\(row\);\s*return uploadPhotosToExistingPlace\(item, row, photos, uid\);\s*\}/);
  assert.doesNotMatch(H, /\n  if \(item\.editing\) return uploadPhotosToExistingPlace/);
});
await t('change only the hours on an existing place: hours written (source admin + its ref), name/credit/cover untouched, read back', async () => {
  fresh(); calls = [];
  const hours = { periods: [{ open: { day: 1, hour: 9, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }], weekdayDescriptions: ['Monday: 9:00 AM – 5:00 PM'] };
  await write({ id: ID, submitted_by: 'u9', origin: 'user', place_kind: 'place', approval_status: 'approved', is_hidden: false, coordinate_verified_at: 'now', last_verified_at: 'now',
    operating_hours: hours, hours_source: 'admin', hours_source_ref: 'contacted: WhatsApp 7 Nov' });
  const r = table.get(ID);
  assert.deepEqual(r.operating_hours, hours); assert.equal(r.hours_source, 'admin'); assert.equal(r.hours_source_ref, 'contacted: WhatsApp 7 Nov');
  assert.equal(r.name, 'National Mosque'); assert.equal(r.photographer_name, 'Wee Hong'); assert.equal(r.cover_image_url, 'https://x/c.jpg'); assert.equal(r.submitted_by, 'u0'); assert.equal(r.origin, 'catalogue');
  const sent = Object.keys(calls[0].patch).sort();
  assert.deepEqual(sent, ['hours_source', 'hours_source_ref', 'last_verified_at', 'operating_hours']);
});
await t('a note and a name save the same way', async () => {
  fresh();
  await write({ id: ID, last_verified_at: 'now', description: 'A new note.' });
  assert.equal(table.get(ID).description, 'A new note.');
  await write({ id: ID, last_verified_at: 'now', name: 'Masjid Negara' });
  assert.equal(table.get(ID).name, 'Masjid Negara');
});
await t('a photo-only edit never writes the row', async () => {
  fresh(); calls = [];
  await write({ id: ID, submitted_by: 'u9', origin: 'user', place_kind: 'place', approval_status: 'approved', is_hidden: false, last_verified_at: 'now', coordinate_verified_at: 'now' });
  assert.equal(calls.length, 0);
});
await t("an RLS refusal (0 rows) or a value that comes back different is an error, never 'Saved'", async () => {
  fresh(); refuse = true;
  await assert.rejects(write({ id: ID, last_verified_at: 'now', name: 'X' }), /Didn’t save: the place wasn’t updated/);
  // the same moment in another form is the same value (live 28 Nov: '…Z' sent, '+00:00' back)
  refuse = false; bend = { last_verified_at: '2026-11-28T10:20:01.123+00:00' };
  await write({ id: ID, last_verified_at: '2026-11-28T10:20:01.123Z', name: 'Y' });
  bend = { name: 'Something else' };
  await assert.rejects(write({ id: ID, last_verified_at: 'now', name: 'X' }), /Didn’t save: name came back different/);
  bend = null;
});
await t("typing ONE day's hours saves only that day: the other six 'Hours not listed', never 9 to 6, never 'Closed'", () => {
  ctx.cap = { hours: { 3: { open: true, periods: [{ from: '10:00', to: '19:00' }] } } };
  const oh = vm.runInContext('buildOperatingHours()', ctx);
  assert.equal(oh.periods.length, 1);
  assert.equal(JSON.stringify(oh.periods[0].open), JSON.stringify({ day: 3, hour: 10, minute: 0 }));
  assert.equal(oh.weekdayDescriptions.filter((d) => /Hours not listed/.test(d)).length, 6);
  assert.ok(!oh.weekdayDescriptions.some((d) => /Closed|9:00 AM/.test(d)));
  ctx.cap = { hours: { 3: { open: false, periods: [] }, 1: { open: true, periods: [{ from: '09:00', to: '17:00' }] } } };
  assert.match(vm.runInContext('buildOperatingHours()', ctx).weekdayDescriptions.join('|'), /Wednesday: Closed/);
});
await t('a day nobody set shows Not listed / Set hours / Closed (no pickers); copying to the empty days is a button', () => {
  assert.match(H, /nl\.textContent = 'Not listed\. ';/);
  assert.match(H, /id="hours-copy"/);
  assert.match(H, /Set each day you know\. A day you leave is 'not listed', never closed\./);
});
await t('typed hours need an Hours source before Save, and it is saved as hours_source_ref', () => {
  assert.match(H, /<input id="f-hours-source" type="text"/);
  assert.match(H, /hours_source_ref: buildOperatingHours\(\) \? \(\(cap\.hoursSource \|\| ''\)\.trim\(\) \|\| null\) : null,/);
  assert.match(H, /&& !hoursNeedSource;/);
});
await t('the other save paths say no to 0 rows: Replace cover, Edit credit, Review places', () => {
  assert.equal((H.match(/\.update\(patch\)\.eq\('id', cap\.id\)\.select\('id'\)\);/g) || []).length, 2);
  assert.match(H, /if \(!data \|\| !data\.length\) \{ say\('Not saved: this place wasn’t updated/);
});
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');

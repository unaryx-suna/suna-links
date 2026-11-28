// W-355 (Brian 28 Nov 17:3x): Panel place covers get a real credit ('Mine' or someone else's author + licence; a
// Wikimedia Commons link fills both), a 'Needs a credit' list for covers credited to an admin, saves that write only
// what changed (the credit no longer re-stamped on every save), and 'Hours not listed' instead of 9-6 pickers on a
// place with none. The Panel's own functions are run here, pulled out of public/field.html. `node w355.test.mjs`
// (one check reads the live Commons API; it says so if offline).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const H = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const fn = (name) => { const i = H.indexOf(`function ${name}(`); assert.ok(i >= 0, name); let d = 0, j = H.indexOf('{', i); for (; j < H.length; j++) { if (H[j] === '{') d++; else if (H[j] === '}' && --d === 0) break; } return H.slice(H.lastIndexOf('\n', i) + 1, j + 1); };
const block = (start, end) => H.slice(H.indexOf(start), H.indexOf(end, H.indexOf(start)) + end.length);
let bad = 0;
const t = async (name, f) => { try { await f(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

const ctx = vm.createContext({ URL, decodeURIComponent, encodeURIComponent, fetch: globalThis.fetch, cap: null, console });
vm.runInContext([fn('commonsFileFromLink'), block('const ALWAYS_WRITE = new Set([', "const COVER_KEYS = ['photographer_name', 'cover_source', 'cover_source_ref'];"),
  block('const EDIT_KEYS = {', '};'), fn('onlyWhatWasEdited'), 'this.ALWAYS_WRITE = ALWAYS_WRITE;'].join('\n'), ctx);

await t('a Commons link in any of its shapes gives the file name; anything else gives nothing', () => {
  const f = (u) => vm.runInContext(`commonsFileFromLink(${JSON.stringify(u)})`, ctx);
  assert.equal(f('https://commons.wikimedia.org/wiki/File:Masjid_Negara_Kuala_Lumpur.jpg'), 'Masjid Negara Kuala Lumpur.jpg');
  assert.equal(f('https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Masjid_Negara.jpg/1280px-Masjid_Negara.jpg'), 'Masjid Negara.jpg');
  assert.equal(f('https://upload.wikimedia.org/wikipedia/commons/4/4f/Masjid_Negara.jpg'), 'Masjid Negara.jpg');
  assert.equal(f('https://thumb.wikimedia.org/wikipedia/commons/thumb/5/58/Merdeka_Park_%28Johor_Bahru%29.jpg/1920px-Merdeka_Park_%28Johor_Bahru%29.jpg?utm_source=x'), 'Merdeka Park (Johor Bahru).jpg');
  assert.equal(f('https://en.wikipedia.org/wiki/National_Mosque_of_Malaysia#/media/File:Masjid_Negara.jpg'), 'Masjid Negara.jpg');
  assert.equal(f('https://www.pexels.com/photo/x-123456/'), null);
  assert.equal(f('not a link'), null);
});
await t("saving an existing place after changing only its name writes the name and nothing about hours or the credit", () => {
  const row = { id: 'p1', name: 'National Mosque', operating_hours: null, hours_source: null, hours_source_ref: null, description: 'x',
    photographer_name: 'admin', cover_source: 'user', cover_source_ref: null, submitted_by: 'u', origin: 'catalogue', place_kind: 'place',
    approval_status: 'approved', is_hidden: false, coordinate_verified_at: 'now', last_verified_at: 'now', category: 'Mosque' };
  ctx.cap = { touched: new Set(['name']), photos: [], hadCover: true };
  const out = vm.runInContext('onlyWhatWasEdited(' + JSON.stringify(row) + ')', ctx);
  assert.equal(out.name, 'National Mosque');
  for (const k of ['photographer_name', 'cover_source', 'cover_source_ref', 'operating_hours', 'hours_source', 'description', 'category']) assert.ok(!(k in out), `${k} not written`);
});
await t('a new cover in this save carries its credit; a photo added to a place that already has a cover does not', () => {
  const row = { id: 'p1', photographer_name: 'Wee Hong', cover_source: 'commons', cover_source_ref: 'commons:X.jpg · CC BY-SA 4.0' };
  ctx.cap = { touched: new Set(['cover']), photos: [{}], hadCover: false };
  assert.equal(vm.runInContext('onlyWhatWasEdited(' + JSON.stringify(row) + ')', ctx).photographer_name, 'Wee Hong');
  ctx.cap = { touched: new Set(), photos: [{}], hadCover: true };
  assert.ok(!('photographer_name' in vm.runInContext('onlyWhatWasEdited(' + JSON.stringify(row) + ')', ctx)));
});
await t("the credit sheet: Mine / Someone else's, author + licence required (Save off until both), the licence list, Commons as 'commons:<File> · <licence>', others as '<link> · <licence>'", () => {
  assert.match(H, /<h1 style="margin-top:0">Whose photo is this\?<\/h1>/);
  assert.match(H, /<button class="chip" id="cr-mine" aria-pressed="true">Mine<\/button>/);
  for (const l of ['CC BY 4.0', 'CC BY-SA 4.0', 'CC BY-SA 3.0', 'CC BY 2.0']) assert.ok(H.includes(`<option>${l}</option>`), l);
  assert.match(H, /<option value="CC0">CC0 \/ public domain<\/option><option value="other">Other<\/option>/);
  assert.match(H, /const ok = mine \|\| \(\$\('cr-author'\)\.value\.trim\(\) && crLicence\(\)\);\s*\$\('cr-save'\)\.disabled = !ok;/);
  assert.match(H, /source: 'commons', ref: 'commons:' \+ crState\.commons\.file \+ ' · ' \+ licence, photographer: author/);
  assert.match(H, /source: 'other', ref: \(link \? link \+ ' · ' : ''\) \+ licence, photographer: author/);
});
await t('every cover path asks: the Replace sheet (file and Commons link), a new place\'s first photo, and Edit credit on an existing cover (only the three credit columns)', () => {
  assert.match(H, /replaceTarget\.kind === 'cover'\s*\? await askCredit\(/);
  assert.match(H, /async function addCommonsPhoto\(file\)/);
  assert.match(H, /id="newcover-credit-btn"/);
  assert.match(H, /const patch = \{ cover_source: prov\.source, cover_source_ref: prov\.ref, photographer_name: prov\.photographer \};\s*const res = await authedWrite\(\(\) => db\.from\('landmarks'\)\.update\(patch\)\.eq\('id', cap\.id\)\.select\('id'\)\);/);
});
await t("'Needs a credit': user covers credited to an admin username, opening the credit sheet; its badge hides at 0", () => {
  assert.match(H, /\.eq\('cover_source', 'user'\)\.in\('photographer_name', names\)\.not\('cover_image_url', 'is', null\)/);
  assert.match(H, /await openExisting\(r\.id\);\s*switchTab\('capture'\);\s*\$\('cover-credit'\)\.click\(\);/);
  assert.match(H, /c\.hidden = !count;/);
});
await t("a place with no hours says 'Hours not listed' and 'Add hours'; the 9 to 6 pickers only after he asks", () => {
  assert.match(H, /if \(!Object\.keys\(cap\.hours \|\| \{\}\)\.length && !cap\.addingHours\) \{/);
  assert.match(H, /Hours not listed\./);
  assert.match(H, /add\.textContent = 'Add hours';/);
});
await t('the place page credits a Commons cover with its licence', async () => {
  const { creditFor } = await import('./api/_preview.js');
  assert.equal(creditFor({ photographer_name: 'Wee Hong', cover_source: 'commons', cover_source_ref: 'commons:Muzium Negara.jpg · CC BY-SA 4.0' }), 'Photo: Wee Hong, CC BY-SA 4.0');
  assert.equal(creditFor({ photographer_name: 'Jane', cover_source: 'other', cover_source_ref: 'https://x.org/p · CC BY 2.0' }), 'Photo: Jane, CC BY 2.0');
  assert.equal(creditFor({ photographer_name: 'Ana', cover_source: 'pexels', cover_source_ref: 'pexels:1' }), 'Photo: Ana, Pexels License');
});
await t('live: Commons answers the author and licence for a file (the read the sheet makes)', async () => {
  let j;
  try {
    const r = await fetch('https://commons.wikimedia.org/w/api.php?action=query&format=json&origin=*&prop=imageinfo&iiprop=url%7Cextmetadata&iiurlwidth=1600&titles=' + encodeURIComponent('File:Merdeka Park (Johor Bahru).jpg'), { signal: AbortSignal.timeout(8000) });
    j = await r.json();
  } catch { console.log('       (offline: skipped)'); return; }
  const ii = Object.values(j.query.pages)[0].imageinfo;
  if (!ii) { console.log('       (file not found on Commons: skipped)'); return; }
  const m = ii[0].extmetadata;
  assert.ok(m.Artist && m.Artist.value, 'an author');
  assert.ok(m.LicenseShortName && m.LicenseShortName.value, 'a licence');
  assert.match(ii[0].thumburl, /^https:\/\/(upload|thumb)\.wikimedia\.org\//);   // Commons serves its sized copies from thumb. since late 2026
});
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');

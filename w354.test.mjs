// W-354 (Ops OPS-367; Brian 28 Nov: Peyton's team adds place photos, videos and places in the Panel themselves):
// (1) on a saved place, admin: up to 8 photos after the cover (add, remove, drag or ‹ › to order) and one video, each
// with a credit AND a licence; photos go through the same 1600 px JPEG resize, a video must be .mp4 and gets a poster
// frame; (2) add a place: the same name anywhere in the city and hidden rows ('Hidden on purpose. Don't add it
// again.', no Save past it; hidden rows via the admin-only panel_place_matches, staged); (3) new rows say
// added_via 'panel'. `node w354.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const H = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
let bad = 0;
const t = async (name, f) => { try { await f(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('the place media block: up to 8 photos, order by drag or ‹ ›, one .mp4 video; admin and a saved place only', () => {
  assert.match(H, /<div class="pmedia" id="pm-block" hidden>/);
  assert.match(H, /const PM_MAX = 8;/);
  assert.match(H, /block\.hidden = !\(cap\.editing && cap\.id && profile && profile\.is_admin\);/);
  assert.match(H, /card\.addEventListener\('drop', \(e\) => \{/);
  assert.match(H, /mk\('‹', \(\) => move\(-1\)\)/);
  assert.match(H, /<input id="in-pm-video" type="file" accept="video\/mp4,\.mp4" hidden>/);
});
await t('every photo and the video ask for a credit AND a licence (no "Mine": the operator is never the credit)', () => {
  assert.match(H, /\$\('cr-mine'\)\.hidden = needLicence;/);
  assert.equal((H.match(/needLicence: true/g) || []).length >= 3, true);
  assert.match(H, /const entry = \{ url, path, credit: prov\.photographer, licence: String\(prov\.ref\)\.split\(' · '\)\.pop\(\) \};/);
});
await t('photos: the same resize as the event gallery into landmark-covers/<id>/gallery-*.jpg; a Commons link works too', () => {
  assert.match(H, /const \{ blob \} = await evResize\(file\);\s*const path = cap\.id \+ '\/gallery-' \+ stamp\(\) \+ '\.jpg';/);
  assert.match(H, /onLinkReady\('pm-link', async \(\) => \{\s*const file = commonsFileFromLink/);
});
await t("a video: .mp4 only ('Needs an .mp4. Convert it first.'), a poster frame from the file, both stored, the seconds kept", () => {
  assert.match(H, /if \(!\(f\.type === 'video\/mp4' \|\| \/\\\.mp4\$\/i\.test\(f\.name\)\)\) \{ pmNote\('Needs an \.mp4\. Convert it first\.', true\); return; \}/);
  assert.match(H, /function pmPosterFrom\(file\)/);
  assert.match(H, /video: \{ url: pub\(vp\), path: vp, poster_url: pub\(pp\), credit: prov\.photographer, licence: String\(prov\.ref\)\.split\(' · '\)\.pop\(\), seconds \}/);
});
await t('add a place: the same name in the city, hidden rows shown "Hidden on purpose" with no Save past them', () => {
  assert.match(H, /db\.rpc\('panel_place_matches', \{ p_name: cap\.name\.trim\(\), p_city: cap\.cityId \|\| null, p_lat: cap\.lat, p_lng: cap\.lon \}\)/);
  assert.match(H, /\.eq\('city_id', cap\.cityId\)\.ilike\('name', /);
  assert.match(H, /'Hidden on purpose\. Don’t add it again\.'/);
  assert.match(H, /\$\('dupe-different'\)\.hidden = anyHidden;/);
});
await t("a new row says added_via 'panel'; an edit never writes it", () => {
  assert.match(H, /\.\.\.\(cap\.editing \? \{\} : \{ added_via: 'panel' \}\),/);
  assert.ok(!/added_via/.test(H.slice(H.indexOf('const ALWAYS_WRITE'), H.indexOf('function onlyWhatWasEdited'))));
});
await t('the place page credits the video with its licence', async () => {
  const { mediaOf } = await import('./api/_placemedia.js');
  const m = mediaOf({ gallery: [], video: { url: 'https://x.supabase.co/v.mp4', poster_url: 'https://x.supabase.co/v.jpg', credit: 'Photo: Jane', licence: 'CC BY 4.0', seconds: 12 } });
  assert.equal(m.video.credit, 'Jane, CC BY 4.0');
});
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');

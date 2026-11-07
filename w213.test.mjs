// W-213 (Ops OPS-145): in the Panel, a pasted Pexels/Unsplash cover saved onto an
// existing place keeps its source, ref and photographer (it was 'user' / 'admin');
// a link box fetches on paste, Enter or leaving it, never on each keystroke.
// The real functions are sliced out of public/field.html and run with stubs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const slice = (start, end) => html.slice(html.indexOf(start), html.indexOf(end));
const UPLOAD = slice('async function uploadPhotosToExistingPlace(', '/** **Did the cover actually land?**');
const READY = slice('function onLinkReady(id, fn) {', 'function capitalise(s) {');

function runUpload(row) {
  const writes = [];
  const q = (table) => ({
    select() { return this; }, eq() { return this; }, is() { return this; },
    maybeSingle: async () => ({ data: { cover_image_url: null }, error: null }),
    upsert: async (r) => { writes.push([table, 'upsert', r]); return { error: null }; },
    update(p) { writes.push([table, 'update', p]); return this; },
    then(res) { res({ error: null }); },
  });
  const db = { from: q, storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: (p) => ({ data: { publicUrl: 'https://x/' + p } }) }) } };
  const ctx = vm.createContext({ db, profile: { username: 'admin' }, coverAlreadyLanded: async () => false, console });
  vm.runInContext(UPLOAD + '\n;this.up = uploadPhotosToExistingPlace;', ctx);
  return ctx.up({}, row, [{ photoId: 'p1', blob: {}, width: 10, height: 10 }], 'uid-1').then(() => writes.find((w) => w[0] === 'landmarks' && w[1] === 'update')[2]);
}

await t('a pasted Pexels cover on an existing place keeps provider, ref and photographer (Sushiro: was user/admin/null)', async () => {
  const p = await runUpload({ id: 'L1', cover_source: 'pexels', cover_source_ref: 'pexels:123', photographer_name: 'Jacob Yavin' });
  assert.deepEqual(JSON.parse(JSON.stringify(p)), { cover_image_url: 'https://x/L1/cover.jpg', cover_source: 'pexels', cover_source_ref: 'pexels:123', photographer_name: 'Jacob Yavin' });
});
await t('Unsplash too; no photographer name back stays null (backfillable from the ref), never his username', async () => {
  const p = await runUpload({ id: 'L2', cover_source: 'unsplash', cover_source_ref: 'unsplash:abc', photographer_name: null });
  assert.equal(p.cover_source, 'unsplash'); assert.equal(p.cover_source_ref, 'unsplash:abc'); assert.equal(p.photographer_name, null);
});
await t('his own photograph is unchanged: user, his username, no ref written', async () => {
  const p = await runUpload({ id: 'L3', cover_source: 'user', cover_source_ref: null, photographer_name: 'admin' });
  assert.deepEqual(JSON.parse(JSON.stringify(p)), { cover_image_url: 'https://x/L3/cover.jpg', cover_source: 'user', photographer_name: 'admin' });
});

await t('the link boxes: typing never fetches; paste, Enter and change do, once', async () => {
  const listeners = {};
  const el = { value: '', addEventListener: (k, f) => { (listeners[k] = listeners[k] || []).push(f); } };
  let calls = 0;
  const ctx = vm.createContext({ $: () => el, setTimeout: (f) => f(), console });
  vm.runInContext(READY + '\n;this.ready = onLinkReady;', ctx);
  ctx.ready('stock-link', async () => { calls++; el.value = ''; });
  assert.equal(listeners.input, undefined, 'no input listener: typing does nothing');
  el.value = 'https://www.pexels.com/photo/sushi-1'; listeners.paste[0](); await new Promise((r) => setImmediate(r));
  assert.equal(calls, 1, 'paste');
  el.value = 'https://www.pexels.com/photo/sushi-123/'; listeners.keydown[0]({ key: 'a', preventDefault() {} });
  assert.equal(calls, 1, 'a letter key does nothing');
  listeners.keydown[0]({ key: 'Enter', preventDefault() {} }); await new Promise((r) => setImmediate(r));
  assert.equal(calls, 2, 'Enter');
  el.value = 'https://images.unsplash.com/photo-1'; listeners.change[0](); await new Promise((r) => setImmediate(r));
  assert.equal(calls, 3, 'change (leaving the box)');
  listeners.change[0](); assert.equal(calls, 3, 'an empty box never fetches');
  assert.equal((html.match(/onLinkReady\('(stock|replace)-link'/g) || []).length, 2, 'both boxes');
  assert.doesNotMatch(html, /\$\('(stock|replace)-link'\)\.addEventListener\('input'/);
});

console.log(bad ? `\nw213: ${bad} FAILED` : '\nw213: all passed');
process.exit(bad ? 1 : 0);

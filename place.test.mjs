// W-25: the place page shows "Book tickets" only for ids in unaryx.com's
// /go/places.json, and the link is always our own /go/p-<id>.
// Plain node, every fetch stubbed: `node place.test.mjs`.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const LINKED = 'f6946e57-455d-41d1-88de-f44fb613f76c';
const PLAIN = '66a850b1-5fcd-4532-941e-df2bea8b0fe8';
const SHELL = readFileSync(new URL('./public/place.html', import.meta.url), 'utf8');

let placesList = { places: [LINKED] };
let placesFails = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, text: async () => body, json: async () => body });
  if (u.endsWith('/place.html')) return ok(SHELL);
  if (u === 'https://unaryx.com/go/places.json') {
    if (placesFails) throw new Error('timeout');
    return ok(placesList);
  }
  if (u.includes('/rest/v1/landmarks')) return ok([{ name: 'Aquaria KLCC', category: 'Attraction', description: 'x'.repeat(80), address: 'KLCC', cover_image_url: null, city_id: null }]);
  if (u.includes('/rpc/listing_public')) return ok([]);
  return { ok: false, json: async () => [] };
};

const { default: handler } = await import('./api/place.js');

async function render(path) {
  let body = '', code = 0;
  await handler({ url: path, headers: { host: 'app.unaryx.com' } },
    { status(c) { code = c; return this; }, setHeader() { return this; }, send(b) { body = b; return this; }, end() {} });
  return { code, body };
}
const bookMeta = (html) => (html.match(/<meta name="suna:book" content="([^"]*)">/) || [])[1] || null;

let bad = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); }
}

await t('a linked place gets our own /go link, from web-place', async () => {
  const r = await render(`/place/${LINKED}`);
  assert.equal(r.code, 200);
  assert.equal(bookMeta(r.body), `https://unaryx.com/go/p-${LINKED}?src=web-place`);
  assert(!r.body.includes('klook'), 'never the partner URL itself');
});

await t('upper-case id still matches', async () => {
  const r = await render(`/place/${LINKED.toUpperCase()}`);
  assert.equal(bookMeta(r.body), `https://unaryx.com/go/p-${LINKED}?src=web-place`);
});

await t('a place with no link gets no Book tickets', async () => {
  assert.equal(bookMeta((await render(`/place/${PLAIN}`)).body), null);
});

await t('places.json down or malformed: page still renders, no link', async () => {
  placesFails = true;
  let r = await render(`/place/${LINKED}`);
  assert.equal(r.code, 200); assert.equal(bookMeta(r.body), null);
  placesFails = false; placesList = { places: 'nope' };
  r = await render(`/place/${LINKED}`);
  assert.equal(r.code, 200); assert.equal(bookMeta(r.body), null);
  placesList = { places: [LINKED] };
});

await t('the link markup: sponsored, new tab, commission line, hidden by default', async () => {
  assert.match(SHELL, /<p id="book" hidden>/);
  assert.match(SHELL, /rel="sponsored noopener"/);
  assert.match(SHELL, /target="_blank"/);
  assert.match(SHELL, /Suna may earn a commission/);
});

console.log(bad ? `\nplace: ${bad} FAILED` : '\nplace: all passed');
process.exit(bad ? 1 : 0);

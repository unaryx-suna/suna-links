// W-227 (Brian, 13 Nov): share links whose `--` became a long dash.
// `node w227.test.mjs` (every fetch stubbed); `LIVE=1 node w227.test.mjs` also reads app.unaryx.com.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SLUG = 'mmutgrh6sn';
const PLACE = 'b6f1859e-b685-495e-8482-41180f8d252f';
let found = true;
globalThis.fetch = async (url) => {
  const u = String(url);
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: new Map() });
  if (u.includes('/rest/v1/public_itineraries')) return ok(found && u.includes(SLUG) ? [{ id: 'p1', name: 'Chiang mai', intro_story: 'Three stops.', resolved_city_name: 'Chiang Mai', recommended_timing: null, creator_username: 'suna_qa', creator_avatar_url: null, partner_name: null, share_slug: SLUG, cover_image_path: null }] : []);
  if (u.includes('/rest/v1/public_itinerary_stops')) return ok([{ order_index: 0, place_name: 'Stop 1', city_name: 'Chiang Mai', suggested_time: 'Day 1 · 9:00', duration_label: '1h', creator_note: '', latitude: 18.79, longitude: 98.98, landmark_id: null, category: 'Food', country_code: 'TH', place_image_url: null, moment_path: null, moment_bucket: null }]);
  return { ok: false, status: 404, json: async () => ({}), text: async () => '', headers: new Map() };
};
const S = await import('./api/_slug.js');
const I = await import('./api/itinerary.js');
async function get(url) {
  const o = { code: 0, hdr: {}, body: '' };
  const res = { setHeader(k, v) { o.hdr[k.toLowerCase()] = v; return this; }, status(c) { o.code = c; return this; }, send(b) { o.body = b; return this; }, end(b) { o.body = b || ''; return this; } };
  await I.default({ url, headers: { host: 'app.unaryx.com' } }, res);
  return o;
}
let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const CANON = `/i/chiang-mai--${SLUG}`;
const SPELLINGS = {
  'two hyphens (canonical)': `/i/chiang-mai--${SLUG}`,
  'an em dash, typed': `/i/chiang-mai—${SLUG}`,
  'an em dash, percent-encoded': `/i/chiang-mai%E2%80%94${SLUG}`,
  'an en dash, typed': `/i/chiang-mai–${SLUG}`,
  'an en dash, percent-encoded': `/i/chiang-mai%E2%80%93${SLUG}`,
  'the bare slug': `/i/${SLUG}`,
};

await t('the id is the text after the last --, em dash or en dash; a bare id is itself; a broken escape never throws', () => {
  for (const [name, path] of Object.entries(SPELLINGS)) assert.equal(S.tailOf(S.segmentAfter(path, 'i')), SLUG, name);
  assert.equal(S.tailOf(S.segmentAfter(`/i/a--b—c--${SLUG}?via=x--y`, 'i')), SLUG);
  assert.equal(S.tailOf(S.segmentAfter(`/i/chiang-mai—-${SLUG}`, 'i')), SLUG, '"---" tidied to an em dash and a hyphen');
  assert.equal(S.tailOf(S.segmentAfter('/i/%E0%A4%A', 'i')), '%E0%A4%A');
  assert.equal(S.tailOf(S.segmentAfter('/i/', 'i')), '');
});

await t('the canonical spelling renders (200), with canonical and og:url the same URL, no noindex', async () => {
  const r = await get(`${CANON}?via=suna_qa&path=chiang-mai--${SLUG}`);
  assert.equal(r.code, 200);
  const canon = (r.body.match(/<link rel="canonical" href="([^"]*)">/) || [])[1];
  const og = (r.body.match(/<meta property="og:url" content="([^"]*)">/) || [])[1];
  assert.equal(canon, `https://app.unaryx.com${CANON}`);
  assert.equal(og, canon);
  assert.match(r.body, /<title>Chiang mai — by @suna_qa<\/title>/);
  assert.doesNotMatch(r.body, /name="robots"/);
});

await t('the other five spellings answer 301 to the canonical one, keeping via and the rest of the query, never the rewrite\'s path=', async () => {
  for (const [name, path] of Object.entries(SPELLINGS)) {
    if (path === CANON) continue;
    const r = await get(`${path}?via=suna_qa&ct=x&path=${encodeURIComponent(path.slice(3))}`);
    assert.equal(r.code, 301, name);
    assert.equal(r.hdr.location, `${CANON}?via=suna_qa&ct=x`, name);
    assert.equal(r.body, '', name);
  }
  assert.equal((await get(`/i/${SLUG}`)).hdr.location, CANON, 'no query, no "?"');
  assert.equal((await get(`/i/Old-Name--${SLUG}?via=a%20b`)).hdr.location, `${CANON}?via=a+b`);
});

await t('an itinerary we can\'t show: a long dash is put back to -- (301); the -- and bare forms stay the generic noindex page, no loop', async () => {
  found = false;
  try {
    const dash = await get(`/i/secret-trip%E2%80%94zzzzzzzzzz?via=me`);
    assert.equal(dash.code, 301);
    assert.equal(dash.hdr.location, '/i/secret-trip--zzzzzzzzzz?via=me');
    for (const p of ['/i/secret-trip--zzzzzzzzzz?via=me', '/i/zzzzzzzzzz']) {
      const r = await get(p);
      assert.equal(r.code, 200, p);
      assert.match(r.body, /<meta name="robots" content="noindex">/, p);
    }
  } finally { found = true; }
});

await t('a redirect is only ever a path on this site built from the slug and the itinerary\'s own name', () => {
  const to = I.redirectFor('/i/%2F%2Fevil.example%E2%80%94x', 'https://app.unaryx.com', 'https://app.unaryx.com/', false);
  assert.ok(to.startsWith('/i/') && !to.startsWith('/i//') && !to.includes('evil.example/'), to);
  assert.equal(I.redirectFor(CANON, 'https://app.unaryx.com', `https://app.unaryx.com${CANON}`, true), null);
});

await t('/place/: the same dashes are read (name--8hex, em dash, en dash, encoded); the page script reads them too', async () => {
  const src = readFileSync('./api/place.js', 'utf8');
  assert.match(src, /tailOf\(segmentAfter\(pathname, 'place'\)\)/);
  for (const sep of ['--', '—', '–', '%E2%80%94', '%E2%80%93']) {
    assert.equal(S.tailOf(S.segmentAfter(`/place/sister-bella${sep}b6f1859e`, 'place')), 'b6f1859e', sep);
    assert.equal(S.tailOf(S.segmentAfter(`/place/sister-bella${sep}${PLACE}`, 'place')), PLACE, sep);
  }
  assert.equal(S.tailOf(S.segmentAfter(`/place/${PLACE}`, 'place')), PLACE);
  assert.match(readFileSync('./public/i.html', 'utf8'), /raw\.split\(\/--\|\[\\u2014\\u2013\]\/\)/);
});

if (process.env.LIVE) {
  const B = 'https://app.unaryx.com';
  const head = async (p) => { const r = await fetch(`${B}${p}`, { redirect: 'manual' }); return { code: r.status, to: r.headers.get('location'), body: r.status === 200 ? await r.text() : '' }; };
  await t('LIVE: Brian\'s em-dash link 301s to the canonical one, which is the real page', async () => {
    const r = await head(`/i/chiang-mai%E2%80%94${SLUG}?via=suna_qa`);
    assert.equal(r.code, 301);
    assert.equal(r.to, `${CANON}?via=suna_qa`);
    const page = await head(r.to);
    assert.equal(page.code, 200);
    assert.match(page.body, /<title>Chiang mai — by @suna_qa<\/title>/);
    assert.doesNotMatch(page.body, /name="robots"/);
    assert.ok(page.body.includes(`<meta property="og:url" content="${B}${CANON}">`) && page.body.includes(`<link rel="canonical" href="${B}${CANON}">`));
  });
  await t('LIVE: the en dash and the bare slug 301 too', async () => {
    assert.equal((await head(`/i/chiang-mai%E2%80%93${SLUG}`)).to, CANON);
    assert.equal((await head(`/i/${SLUG}`)).to, CANON);
  });
  await t('LIVE: /place/ with an em dash before the short id is the real place page', async () => {
    const r = await head('/place/sister-bella%E2%80%94b6f1859e');
    assert.equal(r.code, 200);
    assert.ok(r.body.includes(`<link rel="canonical" href="${B}/place/${PLACE}">`));
  });
}
console.log(bad ? `\n✗ ${bad} failed` : '\n✓ W-227 checks pass');
process.exit(bad ? 1 : 0);

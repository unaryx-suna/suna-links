// W-223 (Brian 12 Nov: "okay" to "count tips"): a place page is indexable, and
// in the sitemap, when its description (not filler) plus its published tips
// reach 100 characters. The page and the sitemap use the same function and the
// same tips filter; the sitemap reads the tips once, not once per place.
// `node w223.test.mjs`; `LIVE=1 node w223.test.mjs` also checks production.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import sitemap, { hasRealContent, publishedTips, PUBLISHED_TIPS, LIST_DESCRIPTION_LENGTH } from './api/sitemap.js';

let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
const x = (n) => 'x'.repeat(n);

await t('description + tips reach 100: 84 + a 64-character tip is in; 84 alone is out; 40 and no tips is out', () => {
  const tip = "It's a small room, so arrive early on Friday and Saturday nights.";
  assert.equal(hasRealContent({ description: x(84) }, undefined, [tip]), true);
  assert.equal(hasRealContent({ description: x(84) }), false);
  assert.equal(hasRealContent({ description: x(84) }, undefined, []), false);
  assert.equal(hasRealContent({ description: x(40) }), false);
  assert.equal(hasRealContent({ description: x(40) }, undefined, [x(59)]), false);
  assert.equal(hasRealContent({ description: x(40) }, undefined, [x(30), x(30)]), true);
});
await t('tips may be strings or rows with a body; whitespace runs count once; empty ones count nothing', () => {
  assert.equal(hasRealContent({ description: x(90) }, undefined, [{ body: x(10) }]), true);
  assert.equal(hasRealContent({ description: x(90) }, undefined, [{ body: `  ${x(4)}      ${x(4)}  ` }]), false);   // 9, not 20
  assert.equal(hasRealContent({ description: x(99) }, undefined, [null, '', { body: null }, '   ']), false);
});
await t('a filler description counts as 0: out with a short tip, in only when the tips alone reach 100', () => {
  const filler = `Highly rated ${'Pub '.repeat(40)}nearby.`;
  assert.equal(hasRealContent({ description: filler }, undefined, [x(60)]), false);
  assert.equal(hasRealContent({ description: filler }, undefined, [x(60), x(40)]), true);
});
await t('W-217 is unchanged without tips: 100 in, 99 out, filler out; the list bar stays 60 and takes no tips', () => {
  assert.equal(hasRealContent({ description: x(100) }), true);
  assert.equal(hasRealContent({ description: x(99) }), false);
  assert.equal(hasRealContent({ description: `Highly rated ${'Pub '.repeat(40)}nearby.` }), false);
  assert.equal(hasRealContent({ description: x(59) }, LIST_DESCRIPTION_LENGTH), false);
  assert.match(readFileSync(new URL('./api/venue.js', import.meta.url), 'utf8'), /hasRealContent\(p, LIST_DESCRIPTION_LENGTH\)\)/);
});
await t('one rule: the page calls the same function with the same tips filter (published only)', () => {
  const place = readFileSync(new URL('./api/place.js', import.meta.url), 'utf8');
  assert.equal(PUBLISHED_TIPS, 'status=eq.published');
  assert.match(place, /import \{ hasRealContent, PUBLISHED_TIPS \} from '\.\/sitemap\.js';/);
  assert.match(place, /rest\(`place_hints\?landmark_id=eq\.\$\{encodeURIComponent\(id\)\}&\$\{PUBLISHED_TIPS\}&select=body,attribution&order=id`\)/);
  assert.match(place, /indexable = hasRealContent\(\{ description: text \}, undefined, resolved\.tips\)/);
  assert.match(place, /tips: resolved\.tips,/);   // the same rows go to the page body
  assert.equal((place.match(/hasRealContent\(/g) || []).length, 1);
});

// The page prints what the gate counts (Brian 12 Nov: "Show tips, then go live").
const { tipsBlock, placeBody } = await import('./api/_placepage.js');
await t('the Tip block: every published tip, escaped, with its attribution once; "Tips" for several; nothing when there are none', () => {
  const one = tipsBlock([{ body: "It's a small room, so arrive  early <b>.", attribution: "Suna's Advice" }]);
  assert.equal(one, '<section class="tips" aria-label="Tip"><p class="kick">Tip</p><ul><li>It&#39;s a small room, so arrive early &lt;b&gt;.</li></ul><small>Suna&#39;s Advice</small></section>');
  const two = tipsBlock([{ body: 'Order the laksa.', attribution: "Suna's Advice" }, { body: 'Go before noon.', attribution: null }, { body: '  ' }]);
  assert.match(two, /aria-label="Tips"><p class="kick">Tips<\/p><ul><li>Order the laksa\.<\/li><li>Go before noon\.<\/li><\/ul><small>Suna&#39;s Advice<\/small>/);
  assert.equal(tipsBlock([]), ''); assert.equal(tipsBlock(undefined), ''); assert.equal(tipsBlock([{ body: null }]), '');
});
await t('on the page: the block sits under the hero, before the chips and the Save button; a place with no tips has no block', () => {
  const d = { place: { name: 'Sister Bella', category: 'Bar', description: 'Small cocktail bar.', latitude: null, longitude: null }, cityName: 'Melbourne', tz: 'Australia/Melbourne', cover: null, hours: null, events: [], walks: [], store: 'https://apps.apple.com/x', scheme: 'suna://place?id=x', offer: null, booking: null, now: Date.now() };
  const withTip = placeBody({ ...d, tips: [{ body: 'Arrive early.', attribution: "Suna's Advice" }] });
  assert.ok(withTip.indexOf('<div class="pad">') < withTip.indexOf('class="tips"') && withTip.indexOf('class="tips"') < withTip.indexOf('class="btns"'));
  // Three or more: the same block, below the buttons, so Save in Suna stays on a phone's first screen.
  const many = placeBody({ ...d, tips: [{ body: 'One.' }, { body: 'Two.' }, { body: 'Three.' }] });
  assert.ok(many.indexOf('class="btns"') < many.indexOf('class="tips"'));
  assert.equal(many.split('class="tips"').length - 1, 1);
  assert.equal(withTip.split('class="tips"').length - 1, 1);
  assert.ok(!placeBody({ ...d, tips: [] }).includes('class="tips"'));
  assert.ok(!placeBody(d).includes('class="tips"'));
});

// A stub database: 2,300 tips over 3 pages, 4 places.
const realFetch = globalThis.fetch;
const A = 'aaaaaaaa-0000-4000-8000-000000000001', B = 'bbbbbbbb-0000-4000-8000-000000000002', C = 'cccccccc-0000-4000-8000-000000000003', D = 'dddddddd-0000-4000-8000-000000000004';
const PLACES = [
  { id: A, name: 'Thin with a tip', category: 'Bar', description: x(84), updated_at: '2026-11-01T00:00:00Z' },
  { id: B, name: 'Thin, no tip', category: 'Bar', description: x(40), updated_at: '2026-11-01T00:00:00Z' },
  { id: C.toUpperCase(), name: 'Long', category: 'Cafe', description: x(120), updated_at: '2026-11-01T00:00:00Z' },
  { id: D, name: 'Grand Hotel', category: 'Hotel', description: x(90), updated_at: '2026-11-01T00:00:00Z' },
];
const TIPS = [{ landmark_id: A, body: x(20) }, { landmark_id: D, body: x(50) }, ...Array.from({ length: 2298 }, (_, i) => ({ landmark_id: `eeeeeeee-0000-4000-8000-${String(i).padStart(12, '0')}`, body: x(30) }))];
let calls;
const stub = (tipsFail = false) => {
  calls = [];
  globalThis.fetch = async (url, o) => {
    const u = String(url); calls.push(u);
    const [from, to] = String(o.headers.Range).split('-').map(Number);
    const page = (rows) => ({ ok: true, json: async () => rows.slice(from, to + 1) });
    if (u.includes('/place_hints?')) return tipsFail ? { ok: false, json: async () => ({}) } : page(TIPS);
    if (u.includes('/landmarks?')) return page(PLACES);
    return page([]);
  };
};
const run = async () => { const o = { xml: '' }; const res = { status() { return res; }, setHeader() { return res; }, send(b) { o.xml = b; } }; await sitemap({}, res); return o.xml; };

await t('the sitemap: the thin place with a tip is in, the thin one without is out, lodging stays out; tips are read in 3 pages, never per place', async () => {
  stub();
  const xml = await run();
  assert.ok(xml.includes(`/place/${A}</loc>`), 'thin + tip');
  assert.ok(!xml.includes(`/place/${B}</loc>`), 'thin, no tip');
  assert.ok(xml.includes(`/place/${C.toUpperCase()}</loc>`), 'long');
  assert.ok(!xml.includes(`/place/${D}</loc>`), 'lodging');
  const tipCalls = calls.filter((u) => u.includes('/place_hints?'));
  assert.equal(tipCalls.length, 3);
  for (const u of tipCalls) { assert.ok(u.includes('status=eq.published') && u.includes('select=landmark_id,body')); assert.doesNotMatch(u, /landmark_id=eq\./); }
  const m = await publishedTips();
  assert.equal(m.size, 2300); assert.deepEqual(m.get(A), [x(20)]);
});
await t('if the tips read fails, the sitemap still builds on descriptions alone (as before W-223)', async () => {
  stub(true);
  const xml = await run();
  assert.ok(!xml.includes(`/place/${A}</loc>`) && xml.includes(`/place/${C.toUpperCase()}</loc>`));
});
globalThis.fetch = realFetch;

if (process.env.LIVE) {
  const HOST = process.env.HOST || 'https://app.unaryx.com';
  // Dex's examples (Search Console, 12 Nov): 79–96-character descriptions plus a published tip.
  const EX = { 'Sister Bella': 'b6f1859e-b685-495e-8482-41180f8d252f', 'Wild Coriander': '4a3ddc36-c0d1-4204-a4df-07263726f69a', 'Gurdwara Sahib Johor Bahru': 'c4186935-5902-419a-b808-73caeba0120e' };
  const t0 = Date.now();
  const xml = await (await fetch(`${HOST}/sitemap.xml?w223=${Date.now()}`)).text();
  console.log(`  sitemap: ${(xml.match(/<url>/g) || []).length} URLs, ${(xml.match(/\/place\//g) || []).length} places, ${Math.round(xml.length / 1024)} KB, ${Date.now() - t0} ms`);
  for (const [name, id] of Object.entries(EX)) {
    await t(`${name}: no robots meta, and in the sitemap`, async () => {
      const h = await (await fetch(`${HOST}/place/${id}?w223=${Date.now()}`)).text();
      assert.doesNotMatch(h, /<meta name="robots"/);
      assert.match(h, /<section class="tips" aria-label="Tips?"><p class="kick">Tips?<\/p><ul><li>/);
      assert.ok(xml.includes(`/place/${id}</loc>`), 'in the sitemap');
    });
  }
}

console.log(bad ? `\n✗ ${bad} failed` : '\n✓ W-223 tips count toward the index gate');
process.exit(bad ? 1 : 0);

// W-349 (Ops OPS-357, 28 Nov): the app's place sitemap pages every row (no cap), but a read that failed part way
// served the places gathered so far AND cached that short list six hours (plus a day stale). Now a short list is
// kept one minute; a whole one keeps the long cache. `node w349-app.test.mjs`.
import assert from 'node:assert/strict';
let failAt = Infinity, n = 0;
globalThis.fetch = async (url) => {
  const u = String(url); n++;
  if (n >= failAt) throw new Error('timeout');
  const ok = (b) => ({ ok: true, status: 200, json: async () => b, headers: { get: () => null } });
  if (u.includes('landmarks')) return ok([{ id: 'aaaaaaaa-1111-4111-8111-111111111111', name: 'A', category: 'Museum', description: 'x'.repeat(200), updated_at: '2026-11-01' }]);
  return ok([]);
};
const { default: sitemap } = await import('./api/sitemap.js');
const run = async () => { const o = { h: {}, body: '' }; const res = { status() { return res; }, setHeader(k, v) { o.h[k.toLowerCase()] = v; return res; }, send(b) { o.body = b; return res; }, end(b) { o.body = b; return res; } }; await sitemap({ url: '/sitemap.xml', headers: {} }, res); return o; };
let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };
await t('a whole list: six hours at the edge', async () => {
  n = 0; failAt = Infinity;
  const o = await run();
  assert.match(o.body, /\/place\/aaaaaaaa/);
  assert.match(o.h['cache-control'], /s-maxage=21600/);
});
await t('a read that fails part way: whatever was gathered, kept one minute only', async () => {
  n = 0; failAt = 2;
  const o = await run();
  assert.match(o.body, /<urlset/);
  assert.equal(o.h['cache-control'], 'public, max-age=60, s-maxage=60');
});
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');

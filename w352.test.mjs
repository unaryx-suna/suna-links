// W-352 (Ops OPS-364; Brian asked for photos and videos on places): the place page's hero swipes through our cover,
// Ops's gallery photos (credit + licence on each) and one short vertical video (poster first, muted, tap for sound),
// from iOS I-790's `landmarks.gallery` / `landmarks.video`. JSON-LD image / video only from real media. Before the
// migration the columns don't exist: the read fails and the page is exactly as before. `node w352.test.mjs`
// (the browser part with PLAYWRIGHT=<dir with node_modules/playwright>).
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const ID = '66a850b1-5fcd-4532-941e-df2bea8b0fe8';
const COVER = 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/landmark-covers/x.jpg';
const G1 = 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/landmark-gallery/a.jpg';
const G2 = 'https://upload.wikimedia.org/wikipedia/commons/b/bb/Islamic_Arts_Museum.jpg';
let media = null;   // null: the columns don't exist yet (PostgREST 400)
let cover = COVER;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body), json: async () => body });
  if (u.includes('/rest/v1/landmarks') && u.includes('select=gallery,video')) return media ? ok([media]) : { ok: false, status: 400, json: async () => ({ message: 'column landmarks.gallery does not exist' }) };
  if (u.includes('/rest/v1/landmarks') && u.includes('cover_image_url=not.is.null')) return ok([]);
  if (u.includes('/rest/v1/landmarks')) return ok([{ id: ID, name: 'Islamic Arts Museum Malaysia', category: 'Museum', description: 'x'.repeat(120), address: 'Jalan Lembah Perdana, Kuala Lumpur', cover_image_url: cover, photographer_name: 'Ops', cover_source: 'own', city_id: null, city: { country_code: 'MY' }, latitude: 3.1417, longitude: 101.6894 }]);
  if (opts.method === 'HEAD') return { ok: true };
  if (u.includes('/rest/v1/')) return ok([]);
  return { ok: false, status: 404, json: async () => [] };
};
const { default: handler } = await import('./api/place.js');
const render = async () => { let body = ''; await handler({ url: `/place/${ID}`, headers: { host: 'app.unaryx.com' } }, { status() { return this; }, setHeader() { return this; }, send(b) { body = b; return this; }, end() {} }); return body; };
const ld = (h) => JSON.parse((h.match(/<script type="application\/ld\+json">([^<]*)<\/script>/) || [])[1].replace(/\\u003c/g, '<'));
let bad = 0;
const t = async (name, fn) => { try { await fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

await t('before I-790 is applied (no columns): the page is as before, one hero picture, no slides, no video', async () => {
  media = null;
  const h = await render();
  assert.match(h, /<div class="hero"><img class="hi"/);
  assert.doesNotMatch(h, /data-slides|<video/);
  assert.ok(!Array.isArray(ld(h).image) && !ld(h).video, 'JSON-LD as before: the cover only');
});
const FULL = { gallery: [
  { url: G1, path: 'landmark-gallery/a.jpg', credit: 'Islamic Arts Museum Malaysia', licence: '' },
  { url: G2, credit: 'Jane Tan', licence: 'CC BY-SA 4.0' },
  { url: 'https://lh3.googleusercontent.com/p/AF1Qip-x=s1600', credit: 'Google', licence: '' },   // never a Google photo
  { url: 'https://example.com/no-credit.jpg', credit: '', licence: '' },                            // never without a credit
], video: { url: 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/landmark-video/v.mp4', poster_url: 'https://voogrbonwmvfwtgzzrxc.supabase.co/storage/v1/object/public/landmark-video/v.jpg', credit: 'Ops', seconds: 18 } };
await t('with a gallery and a video: cover, 2 photos, the video, each "n / 4" with its credit; Google and uncredited photos left out', async () => {
  media = FULL;
  const h = await render();
  assert.match(h, /<div class="hero has-slides"><div class="slides" data-slides/);
  assert.equal((h.match(/<figure class="sl/g) || []).length, 4);
  assert.match(h, /<span class="mc">2 \/ 4 · Photo: Islamic Arts Museum Malaysia<\/span>/);
  assert.match(h, /<span class="mc">3 \/ 4 · Photo: Jane Tan · CC BY-SA 4\.0<\/span>/);
  assert.doesNotMatch(h.replace(/https:\/\/fonts\.(googleapis|gstatic)\.com[^"]*/g, ''), /googleusercontent/);
  assert.doesNotMatch(h, /no-credit\.jpg/);
});
await t('the video is last: poster first, muted, plays inline, loads nothing until shown, a tap turns the sound on', async () => {
  const h = await render();
  assert.match(h, /<figure class="sl vid"><span class="mc">4 \/ 4 · Video: Ops<\/span><video src="[^"]+v\.mp4" poster="[^"]+v\.jpg" muted playsinline loop preload="none"/);
  assert.match(h, /<button type="button" class="snd" data-snd aria-pressed="false" aria-label="Sound on">Tap for sound<\/button>/);
  assert.match(h, /v\.muted=false/);
});
await t('JSON-LD: every real photo with its credit and licence, and a VideoObject', async () => {
  const node = ld(await render());
  assert.ok(Array.isArray(node.image) && node.image.length === 3);
  assert.deepEqual(node.image[2], { '@type': 'ImageObject', url: G2, creditText: 'Jane Tan', license: 'CC BY-SA 4.0' });
  assert.deepEqual(node.video, { '@type': 'VideoObject', name: 'Islamic Arts Museum Malaysia', contentUrl: FULL.video.url, thumbnailUrl: FULL.video.poster_url, duration: 'PT18S', creditText: 'Ops' });
});
await t("a stock picture never mixes into the slides (no cover of our own: the gallery only, no 'Representative photo')", async () => {
  cover = null; media = { gallery: FULL.gallery.slice(0, 2), video: null };
  const h = await render();
  assert.equal((h.match(/<figure class="sl/g) || []).length, 2);
  assert.doesNotMatch(h, /Representative photo/);
  cover = COVER;
});
await t('a video without a poster is not shown; one photo alone stays the plain hero', async () => {
  media = { gallery: [], video: { url: FULL.video.url, poster_url: null } };
  assert.doesNotMatch(await render(), /<video|data-slides/);
});

let chromium;
try { ({ chromium } = createRequire(process.env.PLAYWRIGHT || '/nonexistent/')('playwright')); } catch { /* none */ }
if (!chromium) console.log('  (playwright not installed: browser checks skipped)');
else {
  media = FULL;
  const html = await render();
  const b = await chromium.launch();
  for (const width of [360, 390, 1440]) {
    await t(`${width} px: one slide fills the hero, the title sits over it, the credit pill doesn't cross the top bar`, async () => {
      const pg = await b.newPage({ viewport: { width, height: 900 } });
      await pg.route('**/*', (r) => (r.request().url().includes('/place/') ? r.fulfill({ status: 200, contentType: 'text/html', body: html }) : r.abort()));
      await pg.goto(`https://app.unaryx.com/place/${ID}`, { waitUntil: 'load' });
      const m = await pg.evaluate(() => {
        const R = (e) => { const r = e.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; };
        const hero = R(document.querySelector('.hero')), sl = R(document.querySelector('.sl')), mc = R(document.querySelector('.mc')), top = R(document.querySelector('.top'));
        const s = document.querySelector('[data-slides]'); s.scrollLeft = s.clientWidth * 2;
        const z = (q, pse) => Number(getComputedStyle(document.querySelector(q), pse).zIndex) || 0;
        return { hero, sl, mc, top, zs: z('.slides'), za: z('.hero', '::after'), zi: z('.hero .in'), snap: getComputedStyle(s).scrollSnapType, h1: R(document.querySelector('h1')), scrollW: document.documentElement.scrollWidth, vw: innerWidth };
      });
      await pg.close();
      assert.ok(Math.abs(m.sl.w - m.hero.w) < 1 && Math.abs(m.sl.h - m.hero.h) < 1, 'slide = hero');
      assert.ok(m.mc.t >= m.top.b - 1, `credit pill top ${m.mc.t} under the bar ${m.top.b}`);
      assert.ok(m.mc.r <= m.hero.r && m.mc.l >= m.hero.l, 'credit inside the hero');
      assert.ok(m.scrollW <= m.vw, 'no page scroll sideways');
      assert.match(m.snap, /x mandatory/);
      assert.ok(m.zs < m.za && m.za < m.zi, `scrim over the slides, title over the scrim (${m.zs} < ${m.za} < ${m.zi})`);
    });
  }
  await b.close();
}
if (bad) { console.log(`\n${bad} failed`); process.exit(1); }
console.log('\nall passed');

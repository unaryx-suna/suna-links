// W-172 (Axel AXL-092): app.unaryx.com/e/<id>'s App Store link opens Apple's
// event custom product page (&ppid=), keeping its ct. `node event-ppid.test.mjs`.
import assert from 'node:assert/strict';
const { eventBody, ctFrom, EVENT_PPID } = await import('./api/event.js');

const e = { id: '758ea725-0000-4000-8000-000000000000', name: 'Night market', venue: 'Jalan Alor, Kuala Lumpur',
  latitude: 3.1478, longitude: 101.6953, start_time: new Date(Date.now() + 864e5).toISOString(), end_time: new Date(Date.now() + 2 * 864e5).toISOString(),
  price_type: 'free', category: 'Market' };
const store = (html) => [...html.matchAll(/https:\/\/apps\.apple\.com\/[^"'\s<>]*/g)].map((m) => new URL(m[0].replace(/&amp;/g, '&')));

assert.equal(EVENT_PPID, 'fec2691e-4d4c-4e48-8520-eda55592bfe1', 'the same id as unaryx-site cpp.js');
for (const url of ['/e/x', '/e/x?action=save&src=event-web', '/e/x?action=save&src=event-web&via=org-test', '/e/x?via=ad-meta-p1']) {
  const ct = ctFrom(url);
  const links = store(eventBody(e, new Date(), [], { ct }));
  assert.ok(links.length >= 1, url);
  for (const u of links) {
    assert.deepEqual(u.searchParams.getAll('ppid'), [EVENT_PPID], url);
    assert.deepEqual(u.searchParams.getAll('ct'), [ct], url);
  }
}
console.log('✓ /e/ App Store links: ppid once, ct kept');

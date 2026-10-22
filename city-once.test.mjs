// W-109 (W-100's rule on app.unaryx.com/e/<id>): the Where line says the
// city once. Plain node: `node city-once.test.mjs`.
import assert from 'node:assert/strict';
globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => [], text: async () => '[]' });
const { withCity, eventBody } = await import('./api/event.js');

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

t('the city once, whole words, any case', () => {
  assert.equal(withCity('Jalan Dato Lee Fong Yee, Seremban', 'Seremban'), 'Jalan Dato Lee Fong Yee, Seremban');
  assert.equal(withCity('MyTOWN Shopping Centre, Cheras, kuala lumpur', 'Kuala Lumpur'), 'MyTOWN Shopping Centre, Cheras, kuala lumpur');
  assert.equal(withCity('Federation Square, Melbourne.', 'Melbourne'), 'Federation Square, Melbourne.');
  assert.equal(withCity('NotSeremban', 'Seremban'), 'NotSeremban, Seremban', 'a whole word only');
  assert.equal(withCity('Pentas 2, klpac', 'Kuala Lumpur'), 'Pentas 2, klpac, Kuala Lumpur');
  assert.equal(withCity('', 'Sydney'), 'Sydney');
});

t('the event page: "Where" isn\'t "…, Seremban, Seremban"', () => {
  const e = { id: '758ea725-0000-4000-8000-000000000000', name: 'Seremban Deepavali Carnival 2026', venue: 'Jalan Dato Lee Fong Yee, Seremban',
    latitude: 2.7258, longitude: 101.9424, start_time: new Date(Date.now() + 864e5).toISOString(), end_time: new Date(Date.now() + 9 * 864e5).toISOString(),
    price_type: 'free', category: 'Festival' };
  const html = eventBody(e, new Date(), []);
  assert.doesNotMatch(html, /Seremban, Seremban/);
});

console.log(bad ? `\n✗ ${bad} failed\n` : '\n✓ all city-once checks pass\n');
process.exit(bad ? 1 : 0);

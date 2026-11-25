// W-314 OD-web-Q9-6: /i/ descriptions are 120-155 with the closing line, built from the first two stops when needed.
import assert from 'node:assert/strict';
import { planDescription, planLd } from './api/itinerary.js';
const st = [{ place_name: 'Concubine Lane' }, { place_name: 'Kong Heng Square' }];
const full = (d) => d + ' Copy this plan to Suna.';
const a = full(planDescription('', 'Ipoh', st, '6 stops, about 5 hours'));
assert.ok(a.length >= 120 && a.length <= 155, a.length); assert.match(a, /^Start at Concubine Lane, then Kong Heng Square in Ipoh/);
assert.ok(!full(planDescription('A'.repeat(200), 'Ipoh', st, '')).includes('…'));
const story = 'We started early at the market and ended with the best laksa in town, slowly, the way a day here should go.';
assert.equal(planDescription(story, 'Ipoh', st, ''), story);
assert.deepEqual(planLd('https://app.unaryx.com/i/x', 'Ipoh', st).itemListElement.map((i) => i.name), ['Concubine Lane', 'Kong Heng Square']);
assert.equal(planLd('u', 'n', []), null);
console.log('ok itinerary seo');

// W-314 OD-web-Q9-5: /place/ titles are '<Name>, <City> · Suna', 60 at most, all-caps names title-cased.
import assert from 'node:assert/strict';
import { placeTitle, fitDescription } from './api/place.js';
assert.equal(placeTitle('Tal Barahi Temple', 'Pokhara'), 'Tal Barahi Temple, Pokhara · Suna');
assert.equal(placeTitle('THE KLCC PARK', 'Kuala Lumpur'), 'The KLCC Park, Kuala Lumpur · Suna');
assert.equal(placeTitle('Petronas Twin Towers Kuala Lumpur', 'Kuala Lumpur'), 'Petronas Twin Towers Kuala Lumpur · Suna');
assert.ok(placeTitle('A Very Long Place Name That Keeps Going And Going Forever More', 'Melbourne').length <= 60);
console.log('ok placeTitle');
// W-314 OD-web-Q9-10, -13: /e/ and /place/ titles fit 60 (the venue only when it fits); descriptions 70 to 160.
assert.equal(placeTitle('Whispering Jack: The John Farnham Musical', 'Roslyn Packer Theatre Walsh Bay'), 'Whispering Jack: The John Farnham Musical · Suna');
assert.equal(placeTitle('Joji', 'idea Live Arena'), 'Joji, idea Live Arena · Suna');
const d = fitDescription('Sat 28 Nov, 2pm to 8pm, Astana at Bamboo Hills', "Save it in Suna and get a nudge when you're nearby.");
assert.equal(d, "Sat 28 Nov, 2pm to 8pm, Astana at Bamboo Hills. Save it in Suna and get a nudge when you're nearby.");
assert.ok(d.length >= 70 && d.length <= 160);
assert.ok(fitDescription('x '.repeat(120), 'y').length <= 160);
assert.equal(fitDescription('A long enough description that already runs past seventy characters in total length.', 'nope').includes('nope'), false);
console.log('ok fitDescription');

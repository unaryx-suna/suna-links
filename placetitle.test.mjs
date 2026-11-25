// W-314 OD-web-Q9-5: /place/ titles are '<Name>, <City> · Suna', 60 at most, all-caps names title-cased.
import assert from 'node:assert/strict';
import { placeTitle } from './api/place.js';
assert.equal(placeTitle('Tal Barahi Temple', 'Pokhara'), 'Tal Barahi Temple, Pokhara · Suna');
assert.equal(placeTitle('THE KLCC PARK', 'Kuala Lumpur'), 'The KLCC Park, Kuala Lumpur · Suna');
assert.equal(placeTitle('Petronas Twin Towers Kuala Lumpur', 'Kuala Lumpur'), 'Petronas Twin Towers Kuala Lumpur · Suna');
assert.ok(placeTitle('A Very Long Place Name That Keeps Going And Going Forever More', 'Melbourne').length <= 60);
console.log('ok placeTitle');

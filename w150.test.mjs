// DEX-150 (9): /e/<8 hex> is the short form printed on story images. `node w150.test.mjs`
import assert from 'node:assert/strict';
import { shortId, eventId } from './api/event.js';
assert.equal(shortId('/e/B301A01E'), 'b301a01e');
assert.equal(shortId('/e/e-b301a01e'), 'b301a01e');
assert.equal(shortId('/e/b301a01e-18f2-4421-b6e9-8999969b6dd5'), null, 'a full id is not a short one');
assert.equal(eventId('/e/b301a01e-18f2-4421-b6e9-8999969b6dd5'), 'b301a01e-18f2-4421-b6e9-8999969b6dd5');
assert.equal(shortId('/e/b301a01'), null);
assert.equal(shortId('/e/zzzzzzzz'), null);
console.log('w150: ok');

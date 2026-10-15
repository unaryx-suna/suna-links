#!/usr/bin/env node
// Suna Panel's "Add from Maps link" (W-56), against fixtures: no live call.
//
// The logic sits between two markers in public/field.html; this file runs that
// block on its own. The fixtures are the response shapes in admin-add-place
// (I-124, deployed version 1) and claim_api_calls. Plain node, no runner:
//
//     node add-place.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
const sw = readFileSync(new URL('./public/field-sw.js', import.meta.url), 'utf8');
const block = html.match(/\/\/ W-56 logic begin[^\n]*\n([\s\S]*?)\/\/ W-56 logic end/)[1];
const { amCall, amBody, amDupe, amLane, amDescribe, amMetres } =
  new Function(block + '\nreturn { amCall, amBody, amDupe, amLane, amDescribe, amMetres };')();

let failed = 0;
async function t(name, fn) {
  try { await fn(); console.log('  ok  ', name); } catch (e) { failed++; console.log('  FAIL', name, '\n      ', e.message); }
}

const BASE = 'https://example.supabase.co';
const KEY = 'sb_publishable_test';
const fakeFetch = (status, body, seen) => async (url, init) => {
  seen.push({ url, init });
  return { status, json: async () => { if (body === undefined) throw new Error('no json'); return body; } };
};

// Fixtures: what the function returns.
const DRY_PLACE_ID = { dry_run: true, target: { placeId: 'ChIJ0123456789abcdef', name: null, lat: null, lng: null } };
const DRY_NAMED = { dry_run: true, target: { placeId: null, name: 'Kedai Kopi Lai Foong', lat: 3.1446, lng: 101.6984 } };
const ADDED = { added: { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Kedai Kopi Lai Foong', category: 'Culinary Spot', city_id: 'c1' },
  city: 'Kuala Lumpur', claim: { ok: true, provider: 'google_places', surface: 'admin_add_place', calls_made: 3, limit: 20, remaining: 17, base_limit: 20, override_until: null } };
const FILLED = { filled: { id: 'f1', name: 'Lai Foong', latitude: 3.1, longitude: 101.6 }, from: { name: 'Kedai Kopi Lai Foong', lat: 3.1446, lng: 101.6984 }, moved_pin: false };
const DUPE = { refused: 'duplicate', match: { id: 'd1', name: 'Kedai Kopi Lai Foong' }, by: 'place id' };
const LEDGER = { refused: 'the admin ledger hid or rejected this place', verdict: {} };
const USED = { error: "today's 20 adds are used", claim: { ok: false, reason: 'daily budget exceeded', provider: 'google_places', surface: 'admin_add_place', limit: 20, requested: 1 } };

await t('the request: POST to admin-add-place with the session token and the publishable key, nothing else', async () => {
  const seen = [];
  const res = await amCall(fakeFetch(200, DRY_NAMED, seen), BASE, KEY, 'jwt-abc', amBody(' https://maps.app.goo.gl/x ', {}, true));
  assert.equal(seen[0].url, BASE + '/functions/v1/admin-add-place');
  assert.equal(seen[0].init.method, 'POST');
  assert.equal(seen[0].init.headers.Authorization, 'Bearer jwt-abc');
  assert.equal(seen[0].init.headers.apikey, KEY);
  assert.deepEqual(JSON.parse(seen[0].init.body), { link: 'https://maps.app.goo.gl/x', dry_run: true });
  assert.equal(res.status, 200);
});
await t('the body: optional fields only when set; Add drops dry_run', () => {
  assert.deepEqual(amBody('L', { visitor_mix: 'local', draw: 'notable', landmark_id: 'f1' }, false),
    { link: 'L', visitor_mix: 'local', draw: 'notable', landmark_id: 'f1' });
  assert.deepEqual(amBody('L', { visitor_mix: null, draw: null, landmark_id: null }, false), { link: 'L' });
});
await t('a network failure or a non-JSON answer never throws', async () => {
  const down = await amCall(async () => { throw new TypeError('Load failed'); }, BASE, KEY, 't', {});
  assert.equal(down.status, 0); assert.match(down.body.error, /Could not reach the function/);
  const bare = await amCall(fakeFetch(502, undefined, []), BASE, KEY, 't', {});
  assert.equal(bare.status, 502); assert.match(bare.body.error, /502/);
});

await t('Preview, place id link: says what the link names, no pin, Add offered', () => {
  const v = amDescribe(200, DRY_PLACE_ID);
  assert.equal(v.canAdd, true); assert.equal(v.pin, null);
  assert.deepEqual(v.facts, [['Place id', 'ChIJ0123456789abcdef']]);
  assert.match(v.note, /Address, category and hours come from Google when you tap Add/);
});
await t('Preview, named link: name and pin, map pin set', () => {
  const v = amDescribe(200, DRY_NAMED);
  assert.deepEqual(v.pin, { lat: 3.1446, lng: 101.6984 });
  assert.deepEqual(v.facts, [['Name', 'Kedai Kopi Lai Foong'], ['Pin', '3.14460, 101.69840']]);
});
await t('Add: the new place, its link, and the lane as n of 20', () => {
  const v = amDescribe(200, ADDED);
  assert.equal(v.title, 'Added: Kedai Kopi Lai Foong');
  assert.equal(v.place.url, 'https://app.unaryx.com/place/a1b2c3d4-0000-4000-8000-000000000001');
  assert.deepEqual(v.facts, [['Category', 'Culinary Spot'], ['City', 'Kuala Lumpur']]);
  assert.equal(v.lane, '3 of 20 today');
});
await t('Fill: the filled place and its link; no lane (the answer carries no claim)', () => {
  const v = amDescribe(200, FILLED);
  assert.equal(v.title, 'Filled: Lai Foong'); assert.equal(v.place.url, 'https://app.unaryx.com/place/f1');
  assert.equal(v.lane, null);
});
await t('Duplicate: names the match and links to it', () => {
  const v = amDescribe(409, DUPE);
  assert.equal(v.tone, 'warn'); assert.equal(v.title, 'Already in Suna: Kedai Kopi Lai Foong');
  assert.equal(v.place.url, 'https://app.unaryx.com/place/d1');
});
await t('Ledger refusal and the daily cap', () => {
  assert.match(amDescribe(409, LEDGER).note, /hid or rejected/);
  const v = amDescribe(429, USED);
  assert.equal(v.lane, 'All 20 of today’s adds are used');
  assert.match(v.note, /08:00 Malaysia time/);
});
await t('errors are worded for Ops', () => {
  assert.match(amDescribe(400, { error: 'not a Google Maps place link or place id' }).note, /tap Share/);
  assert.match(amDescribe(401, { error: 'sign in' }).note, /Sign in again/);
  assert.match(amDescribe(403, { error: 'admins only' }).note, /Only admins/);
  assert.match(amDescribe(404, { error: 'Google found no place for that link' }).note, /Google found no place/);
  assert.match(amDescribe(0, { error: 'Could not reach the function. Load failed' }).note, /Could not reach/);
});

await t('duplicates: the function\'s two rules, and a filled row is never its own dupe', () => {
  const near = [{ id: 'x', name: ' kedai kopi lai foong ', latitude: 3.14462, longitude: 101.69842 }];
  assert.deepEqual(amDupe(DRY_NAMED.target, near, null), { id: 'x', name: ' kedai kopi lai foong ', by: 'name within 50 m' });
  assert.equal(amDupe(DRY_NAMED.target, near, 'x'), null);
  assert.equal(amDupe(DRY_NAMED.target, [{ ...near[0], latitude: 3.1452 }], null), null, '~65 m away is not a dupe');
  assert.equal(amDupe(DRY_NAMED.target, [{ ...near[0], name: 'Lai Foong' }], null), null, 'another name is not a dupe');
  assert.deepEqual(amDupe(DRY_PLACE_ID.target, [{ id: 'p', name: 'P', google_place_id: 'ChIJ0123456789abcdef' }], null), { id: 'p', name: 'P', by: 'place id' });
  assert(Math.abs(amMetres(0, 0, 0, 0.001) - 111.19) < 0.1);
});

await t('the page: admin-only menu row (both gates), one pane, build and worker bumped together', () => {
  assert.match(html, /<button class="opt" id="menu-addplace" hidden>/);
  assert.match(html, /\$\('menu-addplace'\)\.hidden = !\(profile && profile\.is_admin\);/);
  assert.match(html, /\$\('menu-addplace'\)\.hidden = !profile\.is_admin;/);
  assert.match(html, /'creators', 'addplace'\]\) \{/);
  const build = html.match(/const BUILD = '([^']+)'/)[1];
  assert.equal(sw.match(/const CACHE_VERSION = '([^']+)'/)[1], build);
  assert.equal(build, 'field-v36');
});
await t('no secret in the page, and no other function or endpoint', () => {
  assert(!/sb_secret_|service_role|SERVICE_ROLE/.test(block));
  assert(!/sb_secret_[A-Za-z0-9]/.test(html));
  assert.deepEqual([...block.matchAll(/\/functions\/v1\/[\w-]+/g)].map((m) => m[0]), ['/functions/v1/admin-add-place']);
});

console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);

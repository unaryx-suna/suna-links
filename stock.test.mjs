#!/usr/bin/env node
// The web's stock deal must match the app's, image for image (W-15c).
//
// The expected values were printed by running the app's own Swift source
// (TravelMug/Services/PlaceStock.swift at release-3.3 2c17632: the region enum
// and PlaceStockDealer copied verbatim) with `swift`, over the app's manifest.
// The first id is PlaceStockDealTests' own fixture. Plain node, no runner:
//
//     node stock.test.mjs

import { stockHash, stockFor, regionFromCountry, poolKey } from './api/_stock.js';

const CASES = [
  // id, category, country, hash, pool key, first image, tint index, opacity
  ['3F2504E0-4F89-41D3-9A0C-0305E82C3301', 'Museum', 'JP', '7170019380964147633',
    'museum/east-asia', 'museum/east-asia/20593434.jpg', 3, 0.57],
  ['337f941a-304c-460e-bc5f-bf1255f96f74', 'Art & Culture', 'MY', '6734539203420779257',
    'art-culture/southeast-asia', 'art-culture/southeast-asia/6727417.jpg', 1, 0.45],
  ['bad481a4-0053-46f2-9000-75558ae50560', 'Other', 'MY', '8189331242655695929',
    'other/southeast-asia', 'other/southeast-asia/13905327.jpg', 0, 0.61],
  ['4e6a75b7-3811-471f-a303-828816e63444', 'Culinary Spot', 'TH', '9138522224110726723',
    'culinary-spot/southeast-asia', 'culinary-spot/southeast-asia/12265850.jpg', 3, 0.49],
];
const TINTS = ['#406543', '#111111', '#F6CB94', '#F6CB94'];

let failures = 0;
const check = (label, got, want) => {
  if (got === want) return;
  failures++;
  console.log(`  FAIL  ${label}\n        got  ${got}\n        want ${want}`);
};

for (const [id, category, cc, hash, key, path, tint, opacity] of CASES) {
  check(`${id} hash`, stockHash(id).toString(), hash);
  // Lower-case input must hash as the uppercase string, as Swift's uuidString does.
  check(`${id} case-insensitive`, stockHash(id.toLowerCase()).toString(), hash);
  const s = stockFor({ landmarkId: id, category, countryCode: cc });
  check(`${id} key`, s.key, key);
  check(`${id} image`, s.path, path);
  check(`${id} tint`, s.tint, TINTS[tint]);
  check(`${id} opacity`, s.tintOpacity, opacity);
}

check('unknown country is Europe', regionFromCountry('ZZ'), 'europe');
check('no country is Europe', regionFromCountry(null), 'europe');
check('an unknown category falls back to Monument', poolKey('Picturesque-ish', 'europe'), 'monument-statue/europe');
check('no id, no stock', stockFor({ landmarkId: null, category: 'Museum', countryCode: 'JP' }), null);

// W-17 (I-23): sacred places get no stock photo, whichever way the category arrives.
// Jamia Masjid Gung Mahal, Lahore: a real Sacred Space stop on a public itinerary.
check('Sacred Space gets no stock', stockFor({ landmarkId: '238e4fba-bec9-4891-abdc-63428fcbf1c6', category: 'Sacred Space', countryCode: 'PK' }), null);
check('legacy Temple gets no stock', stockFor({ landmarkId: '238e4fba-bec9-4891-abdc-63428fcbf1c6', category: 'Temple', countryCode: 'TH' }), null);
check('sacred, any region', stockFor({ landmarkId: '3F2504E0-4F89-41D3-9A0C-0305E82C3301', category: 'Sacred Space', countryCode: 'JP' }), null);
check('a museum still gets its stock', stockFor({ landmarkId: '3F2504E0-4F89-41D3-9A0C-0305E82C3301', category: 'Museum', countryCode: 'JP' }).path, 'museum/east-asia/20593434.jpg');

if (failures) { console.log(`\n${failures} failed`); process.exit(1); }
console.log(`all ${CASES.length} Swift fixtures match`);

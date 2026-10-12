// The stock image the app deals a place, ported from the app (W-15c).
//
// TravelMug/Services/PlaceStock.swift: `PlaceStockRegion`, `PlaceStockDealer`
// and `PlaceStockManifest.key(landmark:region:)`. The web must pick the SAME
// image the app shows for a place, so this is a port, not a re-design: change
// it only alongside the Swift. stock.test.mjs pins it to values printed from
// the Swift source.

import { STOCK_BASE, STOCK_POOLS } from './_place-stock.js';

// ── Regions ──────────────────────────────────────────────────────────────
const REGION_CODES = {
  'east-asia': 'CN JP KR KP TW HK MO',
  'southeast-asia': 'TH VN MY SG ID PH BN KH LA MM TL',
  'south-asia': 'IN PK BD LK NP BT MV AF',
  'post-soviet-central-asia': 'RU BY UA KZ GE AM AZ UZ KG TJ TM MD',
  europe: 'GB IE FR DE ES IT PT NL BE LU CH AT PL CZ SK HU RO BG GR HR SI RS '
    + 'BA ME MK AL DK SE NO FI IS EE LV LT MC AD SM VA LI MT CY TR',
  'africa-middle-east': 'MA TN DZ EG LY SD AE SA QA KW BH OM JO LB IL PS IR IQ SY YE '
    + 'ZA KE NG GH ET TZ UG RW SN CI CM ZW ZM BW NA MZ MG MU SC AO CD CG '
    + 'GA GN ML BF NE TD SO DJ ER LR SL GM GW CV ST BI MW LS SZ',
  americas: 'US CA MX GT BZ SV HN NI CR PA CU DO HT JM TT BB BS PR '
    + 'BR AR CL CO PE VE EC BO PY UY GY SR GF',
  oceania: 'AU NZ PG FJ SB VU WS TO KI TV NR PW FM MH CK NC PF GU',
};
const REGION_OF = new Map();
for (const [region, codes] of Object.entries(REGION_CODES)) {
  for (const cc of codes.split(' ')) REGION_OF.set(cc, region);
}

/** `PlaceStockRegion.from(countryCode:)`: unknown or missing is Europe. */
export function regionFromCountry(cc) {
  const code = String(cc || '').toUpperCase();
  if (!code) return 'europe';
  return REGION_OF.get(code) || 'europe';
}

/** `PlaceStockRegion.from(latitude:longitude:)`, for a stop with no country. */
export function regionFromCoordinates(lat, lon) {
  if (lon < -25) return 'americas';
  if (lon > 110 && lat < -10) return 'oceania';
  if (lon > 155) return 'oceania';
  if (lon >= 100 && lat >= 20) return 'east-asia';
  if (lon >= 92 && lat < 20) return 'southeast-asia';
  if (lon >= 60 && lon < 92 && lat >= 5) return 'south-asia';
  if (lat >= 41 && lon >= 27) return 'post-soviet-central-asia';
  if (lat < 36) return 'africa-middle-east';
  return 'europe';
}

// ── The pool key ─────────────────────────────────────────────────────────
/** `LandmarkCategory.stockSlug(forRawValue:)`. */
export function stockSlug(raw) {
  return String(raw).toLowerCase().replace(/ & /g, '-').replace(/ /g, '-');
}

/** LandmarkCategory's raw values. The itinerary sync decodes anything else as `.monument`. */
const CATEGORY_CASES = new Set([
  'Architecture', 'Art & Culture', 'Cafe & Workspace', 'Culinary Spot', 'Hidden Gem',
  'Historic Site', 'Mall', 'Travel Hub', 'Market & Bazaar', 'Monument & Statue', 'Museum',
  'Nature & Parks', 'Neighborhoods', 'Nightlife & Social', 'Sacred Space',
  'Tourist Attraction', 'Viewpoint', 'Activity', 'Other',
]);

/**
 * `PlaceStockManifest.key(landmark:region:)`: the server's own string when the
 * manifest has that pool, else the decoded enum. A shared itinerary's places
 * reach the app through TravelPlanSyncManager, which decodes
 * `LandmarkCategory(rawValue:) ?? .monument`, so that is the fallback here.
 */
export function poolKey(categoryRaw, region) {
  const raw = String(categoryRaw || '').trim();
  if (raw) {
    const rawKey = `${stockSlug(raw)}/${region}`;
    if (STOCK_POOLS[rawKey] && STOCK_POOLS[rawKey].length) return rawKey;
  }
  const decoded = CATEGORY_CASES.has(raw) ? raw : 'Monument & Statue';
  return `${stockSlug(decoded)}/${region}`;
}

// ── The deal ─────────────────────────────────────────────────────────────
const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK64 = (1n << 64n) - 1n;

/** `PlaceStockDealer.hash`: 64-bit FNV-1a over the UUID's uppercase string. */
export function stockHash(id) {
  let h = FNV_OFFSET;
  for (const byte of Buffer.from(String(id).toUpperCase(), 'utf8')) {
    h ^= BigInt(byte);
    h = (h * FNV_PRIME) & MASK64;
  }
  return h;
}

/**
 * Sacred places never get a stock photo (W-17, mirroring the app's I-23).
 * The `sacred-space` pools mix faiths, so a mosque could be dealt a church's
 * statue. The app routes them to its designed placeholder; here the card has
 * no image, as for a place with nothing. Blocked by the resolved pool, and by
 * the legacy "Temple" string, which the app's legacyMapping files as
 * Sacred Space but the pool fallback would otherwise deal a statue.
 */
const SACRED_RAW = new Set(['Sacred Space', 'Temple']);
const isSacred = (categoryRaw, key) =>
  key.startsWith('sacred-space/') || SACRED_RAW.has(String(categoryRaw || '').trim());

// AppTheme.brandGround, brandInk, brandSand, brandSand.
const TINTS = ['#406543', '#111111', '#F6CB94', '#F6CB94'];

/**
 * The place's stock image: the first of the app's deal (`pool[start]`), with
 * the tint and its opacity dealt from the same hash. Null when the place has
 * no id or its pool is empty.
 */
export function stockFor({ landmarkId, category, countryCode, latitude, longitude }) {
  if (!landmarkId) return null;
  const region = countryCode
    ? regionFromCountry(countryCode)
    : (Number.isFinite(latitude) && Number.isFinite(longitude)
      ? regionFromCoordinates(latitude, longitude) : regionFromCountry(null));
  const key = poolKey(category, region);
  if (isSacred(category, key)) return null;
  const pool = STOCK_POOLS[key];
  if (!pool || !pool.length) return null;
  const h = stockHash(landmarkId);
  const path = pool[Number(h % BigInt(pool.length))];
  return {
    key,
    path,
    url: `${STOCK_BASE}/${path.split('/').map(encodeURIComponent).join('/')}`,
    tint: TINTS[Number((h >> 32n) % 4n)],
    tintOpacity: Math.round((0.45 + Number((h >> 48n) % 5n) * 0.04) * 100) / 100,
  };
}

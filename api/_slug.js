// W-227 (Brian, 13 Nov): the readable share links end in `--<id>`
// (`/i/chiang-mai--mmutgrh6sn`, `/place/sister-bella--b6f1859e`). Phones and
// chat apps "tidy" two hyphens into one long dash, so the link Brian shared
// arrived as `/i/chiang-mai—mmutgrh6sn` and matched nothing. The id is the
// text after the LAST separator, and a separator is `--`, an em dash (U+2014)
// or an en dash (U+2013), typed or percent-encoded.

const SEPARATOR = /--|[—–]/;
const LONG_DASH = /[—–]/;

/** A path segment decoded; a broken escape is read as typed, never thrown. */
export function decodeSegment(segment) {
  const s = String(segment || '');
  try { return decodeURIComponent(s); } catch { return s; }
}

/** The first path segment after `/<prefix>/`, decoded. */
export function segmentAfter(url, prefix) {
  const path = String(url || '').split('?')[0].split('#')[0];
  return decodeSegment((path.split(`/${prefix}/`)[1] || '').split('/')[0]);
}

/** The id at the end of a decoded segment: after the last `--`, em dash or en dash; else the whole segment. */
export function tailOf(decoded) {
  const raw = String(decoded || '');
  const parts = raw.split(SEPARATOR);
  // "---" tidied to "—-" leaves a hyphen on the id; no id starts with one.
  const tail = parts[parts.length - 1].replace(/^-+/, '');
  return tail || raw;
}

/** True when the segment carries a long dash where `--` belongs. */
export const hasLongDash = (decoded) => LONG_DASH.test(String(decoded || ''));

/** The segment with each long dash (and any hyphens around it) put back to `--`. */
export const withHyphens = (decoded) => String(decoded || '').replace(/-*[—–]-*/g, '--');

// The preview's "Copy this itinerary in Suna" tap, counted (W-15).
//
// Counts only: the platform and whether the tap went to the app's scheme.
// No slug, no IP, no user agent, nothing about the reader.
//
// It is a log line, not a row. `link_opens` is the only counter on this
// domain, and get_itinerary_opens() counts every row in it whatever its
// `source`, so a tap stored there would be paid out as an open. A table of its
// own is a migration, which is the iOS session's; until then the count lives
// in the function log as `[itinerary_preview_cta]` lines.

const PLATFORMS = new Set(['ios', 'android', 'other']);

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  try {
    const params = new URL(req.url || '/', 'https://app.unaryx.com').searchParams;
    const platform = PLATFORMS.has(params.get('platform')) ? params.get('platform') : 'other';
    const hasAppScheme = params.get('has_app_scheme') === '1';
    console.log(`[itinerary_preview_cta] ${JSON.stringify({ platform, has_app_scheme: hasAppScheme })}`);
  } catch {
    // A counter may not break, or even inconvenience, the page that calls it.
  }
  res.status(204).end();
}

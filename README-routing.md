# Routing notes

`app.unaryx.com` is this **static** Vercel site. It does not proxy to the
Supabase `well-known` edge function — that function also builds an AASA, but
nothing serves it on this domain, so editing it has no effect here. The file
iOS actually reads is `public/.well-known/apple-app-site-association`.

## Adding a new deep-link path

Three things, all required:

1. Add the path to `components` in `public/.well-known/apple-app-site-association`
   — without it the installed app never claims the link and iOS opens Safari.
2. Add a `rewrites` entry in `vercel.json` — without it the path 404s.
3. Add the landing page under `public/`, including the
   `apple-itunes-app` meta with `app-clip-bundle-id`. A link tapped in Safari
   never shows an App Clip card on its own; that meta tag is what surfaces it.

## Cache

`Cache-Control` on the AASA is deliberately short. A long edge cache meant a
change took hours to become visible (observed: `age: 27016` — 7.5h stale) even
to Apple's own fetcher. Apple caches the result separately at its CDN, so allow
time after deploying, or enable associated-domains developer mode on a test
device to bypass it.

## The App Clip's own pages (W-42)

`/c/<venue>` (`api/venue.js`) and `/e/<event id>` (`api/event.js`) are both
registered Clip experiences, so both carry `app-clip-bundle-id`, unlike
`/city/`. They read only what is already public (approved `world_events`, and
`unaryx.com/clip/venues.json`) and answer 200 for an unknown slug or id.

## Take me there and Open in Suna (W-47)

`api/_maps.js`. Every page renders both Apple Maps and Google Maps links; a
line in `<head>` shows the Apple one on Apple devices. The split is in the
browser because the pages are edge-cached by URL, not by device. Open in Suna
(the `suna://` scheme, App Store fallback after 1.5 s) shows on iPhone only:
a universal link never opens the app from a page on its own domain.

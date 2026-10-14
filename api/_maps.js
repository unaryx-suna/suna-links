// Take me there, and Open in Suna (W-47, Brian 14 Oct on his iPhone: the
// event page offered only Apple Maps, which he has deleted, and from Chrome
// the link never left the browser).
//
// MAPS. Google Maps for everyone; Apple Maps beside it, same weight, on
// iPhone, iPad and Mac. The pages are cached at the edge by URL, never by
// device, so the split can't be made on the server: an iPhone's copy would be
// served to the next Android visitor. Both links are in the HTML and one
// line in <head> shows the Apple one on Apple devices before first paint.
// Neither link needs JavaScript; without it a visitor gets Google, which
// works everywhere (it opens the Google Maps app when installed).
//
// OPEN IN SUNA. A universal link never fires from a page already on its own
// domain, and Chrome on iOS never shows Safari's banner, so iPhones get a
// visible button to the app's custom scheme, falling back to the App Store
// (with the page's ct) if the app didn't take the tap. Hidden elsewhere.
// Same pattern as place.html and i.html.

/** iPhone, iPad, iPod, or a Mac (iPadOS Safari also says Macintosh). */
export const APPLE_UA = /iPhone|iPad|iPod|Macintosh/;
/** Where the app can be: iPhone, iPad, iPod, or iPadOS posing as a Mac. */
export const IOS_UA = /iPhone|iPad|iPod/;

/** A pin worth giving directions to: finite, in range, and not 0,0. */
export function hasPin(lat, lng) {
  const a = Number(lat); const b = Number(lng);
  return lat != null && lng != null && Number.isFinite(a) && Number.isFinite(b)
    && Math.abs(a) <= 90 && Math.abs(b) <= 180 && !(a === 0 && b === 0);
}

export const googleMapsURL = (lat, lng) =>
  `https://www.google.com/maps/dir/?api=1&destination=${Number(lat)},${Number(lng)}&travelmode=walking`;
export const appleMapsURL = (lat, lng) =>
  `https://maps.apple.com/?daddr=${Number(lat)},${Number(lng)}&dirflg=w`;

/** In <head>, before first paint: marks the page so the Apple Maps link shows. */
export const MAPS_HEAD = `<script>if(${APPLE_UA}.test(navigator.userAgent))document.documentElement.classList.add('apple-maps')</script>`;

/** The two links. `cls` is the page's button class, so they match its other buttons. */
export function mapsLinks(lat, lng, cls = 'btn') {
  if (!hasPin(lat, lng)) return '';
  return `<a class="${cls} maps-apple" href="${appleMapsURL(lat, lng).replace(/&/g, '&amp;')}">Apple Maps</a>`
    + `<a class="${cls} maps-google" href="${googleMapsURL(lat, lng).replace(/&/g, '&amp;')}">Google Maps</a>`;
}

/** Hides the Apple link off Apple devices; otherwise the button styles stay the page's own. */
export const MAPS_CSS = 'html:not(.apple-maps) .maps-apple{display:none !important}';

/**
 * Open in Suna: rendered hidden with the App Store as its href, so without
 * JavaScript, or off iOS, it's never seen. `scheme` is a suna:// URL built on
 * the server from a value it has already validated.
 */
export function openInSuna(scheme, store, cls = 'btn') {
  return `<a class="${cls} open-suna" id="open-suna" hidden data-scheme="${scheme.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"`
    + ` href="${store.replace(/&/g, '&amp;').replace(/"/g, '&quot;')}">Open in Suna</a>`;
}

/** At the end of <body>: shows the button on iOS and falls back to the store after ~1.5 s. */
export const OPEN_SCRIPT = `<script>(function(){var b=document.getElementById('open-suna');`
  + `if(!b||!${IOS_UA}.test(navigator.userAgent))return;var store=b.href;b.href=b.getAttribute('data-scheme');b.hidden=false;`
  + `b.addEventListener('click',function(){var t=Date.now();setTimeout(function(){`
  + `if(document.hidden||Date.now()-t>2000)return;window.location.href=store},1500)})})()</script>`;

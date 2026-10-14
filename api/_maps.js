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
// domain, and Chrome on iOS never shows Safari's banner, so iPhones go to the
// app's custom scheme, falling back to the App Store (with the page's ct) if
// the app didn't take the tap. Same pattern as place.html and i.html; on /e/
// and /c/ it's the Save in Suna button below (W-48 (2)).

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

// ---- W-48 (2): one Directions button, one Save in Suna (Ops's W1–W3) ----
//
// Brian, 14 Oct: "too many buttons". /e/ and /c/ now carry one Directions
// button and one Save in Suna. Directions is a plain link to Google Maps, so
// it works with no JavaScript and on Android and desktop; on iPhone and iPad
// a tap opens Ops's W3 sheet (Apple Maps / Google Maps / Cancel) instead,
// because either app may be the one that's installed. Same edge-cache reason
// as above for deciding it in the browser.

/** iPadOS Safari says Macintosh; a touch screen tells it apart from a Mac. */
const TOUCH_APPLE = `(${IOS_UA}.test(navigator.userAgent)||(/Macintosh/.test(navigator.userAgent)&&navigator.maxTouchPoints>1))`;

/** The Directions button and its sheet, or '' without a pin. `label` names the destination in the sheet. */
export function directions(lat, lng, label, cls = 'btn btn-outline') {
  if (!hasPin(lat, lng)) return '';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<a class="${cls}" id="directions" href="${esc(googleMapsURL(lat, lng))}">Directions</a>`
    + '<div class="sheet-dim" id="dir-sheet" hidden><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="dir-title">'
    + `<div class="sheet-group"><p class="sheet-title" id="dir-title">${esc(label ? `Directions to ${label}` : 'Directions')}</p>`
    + `<a class="sheet-opt" href="${esc(appleMapsURL(lat, lng))}">Apple Maps</a>`
    + `<a class="sheet-opt" href="${esc(googleMapsURL(lat, lng))}">Google Maps</a></div>`
    + '<button class="sheet-group sheet-cancel" type="button" id="dir-cancel">Cancel</button></div></div>';
}

/**
 * Save in Suna: the App Store link (with the page's ct) everywhere, and on
 * iPhone/iPad the app's own scheme first, falling back to the store if the
 * app didn't take the tap. Replaces both Open in Suna and Get Suna.
 */
export function saveInSuna(scheme, store, cls = 'btn', text = 'Save in Suna') {
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  return `<a class="${cls} save-suna" data-scheme="${esc(scheme)}" href="${esc(store)}">${text}</a>`;
}

/** At the end of <body>: the Directions sheet and the Save in Suna hand-off, iPhone and iPad only. */
export const PAGE_SCRIPT = `<script>(function(){if(!${TOUCH_APPLE})return;`
  + `var d=document.getElementById('directions'),s=document.getElementById('dir-sheet');`
  + `if(d&&s){var close=function(){s.hidden=true};d.addEventListener('click',function(ev){ev.preventDefault();s.hidden=false;s.querySelector('.sheet-opt').focus()});`
  + `s.addEventListener('click',function(ev){if(ev.target===s)close()});document.getElementById('dir-cancel').addEventListener('click',close);`
  + `document.addEventListener('keydown',function(ev){if(ev.key==='Escape')close()})}`
  + `Array.prototype.forEach.call(document.querySelectorAll('a.save-suna[data-scheme]'),function(b){var store=b.href;`
  + `b.addEventListener('click',function(ev){ev.preventDefault();var t=Date.now();window.location.href=b.getAttribute('data-scheme');`
  + `setTimeout(function(){if(document.hidden||Date.now()-t>2000)return;window.location.href=store},1500)})})})()</script>`;

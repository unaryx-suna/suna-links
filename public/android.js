// W-115 (Brian, 22 Oct): Android visitors get the Android waitlist, never the
// App Store. Every Get Suna / Download / Save in Suna / Copy itinerary button
// goes to the iPhone App Store, a dead end on Android.
//
// Client-side on purpose: the pages are edge-cached, so the server can't know
// the phone without varying the cache on user agent, which we never do.
// iPhone, iPad and desktop are untouched: the script returns at its first line.
//
// Loaded last on every page (<script src="/android.js" data-from="<kind>"
// data-city="<slug>">), after the page's own scripts, so nothing sets an App
// Store href back afterwards. On Android every App Store link (and any link
// marked data-app) becomes "Join the Android list" →
// https://unaryx.com/android?city=<slug>&from=<kind>, with one line under the
// buttons. unaryx.com/android counts the arrival (website_cta_clicked,
// placement android_waitlist, page = from); this site has no analytics.
// unaryx.com has the same function in api/_lib/android.js.
(function () {
  if (!/Android/i.test(navigator.userAgent)) return;
  var me = document.currentScript;
  var from = (me && me.getAttribute("data-from")) || "page";
  var city = (me && me.getAttribute("data-city")) || "";
  window.sunaIsAndroid = true;
  var NOTE = "Suna is on iPhone first. We'll email you when it's on Android.";
  var SEL = 'a[href*="apps.apple.com"], a[data-app]';
  var css = document.createElement("style");
  css.textContent = ".android-note{display:block;flex-basis:100%;margin:8px 0 0;font-size:13px;line-height:1.4;opacity:.72;text-align:inherit}";
  document.head.appendChild(css);

  function cityNow() {
    var m = location.pathname.match(/^\/city\/([a-z0-9-]+)/);
    return city || (m ? m[1] : "");
  }
  function href() {
    var c = cityNow();
    return "https://unaryx.com/android?" + (c ? "city=" + encodeURIComponent(c) + "&" : "") + "from=" + encodeURIComponent(from);
  }
  // One line per button or row of buttons; none for the creator's small
  // Follow pill or inside a nav.
  function note(a) {
    if (a.closest("nav") || /(^|\s)follow(\s|$)/.test(a.className)) return;
    // Under the row when the button sits in a row of buttons, else under it.
    var host = a.parentNode, cs = getComputedStyle(host);
    var after = /flex/.test(cs.display) && !/column/.test(cs.flexDirection) && host !== document.body ? host : a;
    var next = after.nextElementSibling;
    if (next && next.className === "android-note") return;
    // A caption about the App Store ("Opens Suna, or the App Store…") says
    // this line instead.
    if (next && /(^|\s)caption(\s|$)/.test(next.className)) { next.textContent = NOTE; next.className += " android-note"; return; }
    var p = document.createElement("p");
    p.className = "android-note";
    p.textContent = NOTE;
    after.parentNode.insertBefore(p, after.nextSibling);
  }
  function swap(root) {
    var links = root.querySelectorAll ? root.querySelectorAll(SEL) : [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.hasAttribute("data-android")) continue;
      a.setAttribute("data-android", a.id || a.className || "link");
      // The iPhone hand-off (try the app, then the App Store) is iOS-only
      // already; this makes sure no hand-off reads it on Android.
      a.removeAttribute("data-scheme");
      a.removeAttribute("data-open-suna");
      a.removeAttribute("data-app");
      a.removeAttribute("target");
      a.href = href();
      a.textContent = "Join the Android list";
      // A half-width pair (Directions + Save on /e/) stacks full width, so
      // the longer label stays on one line.
      if (/(^|\s)half(\s|$)/.test(a.className)) {
        var pair = a.parentNode.children;
        for (var k = 0; k < pair.length; k++) if (/(^|\s)half(\s|$)/.test(pair[k].className)) pair[k].style.gridColumn = "1 / -1";
      }
      note(a);
    }
  }
  swap(document);
  new MutationObserver(function (ms) {
    for (var i = 0; i < ms.length; i++) {
      for (var j = 0; j < ms[i].addedNodes.length; j++) {
        var n = ms[i].addedNodes[j];
        if (n.nodeType === 1) swap(n.matches && n.matches(SEL) ? n.parentNode : n);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  // A page script can't send the tap anywhere else: the href is set again
  // as the tap starts.
  document.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a[data-android]") : null;
    if (a) a.href = href();
  }, true);
})();

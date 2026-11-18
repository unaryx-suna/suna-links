// W-241 (Ops OPS-230; Brian, 18 Nov): Suna is on Google Play, so on Android
// every App Store button goes to the Play listing instead. (Before, W-115
// sent them to the Android waitlist on unaryx.com.)
//
// Client-side on purpose: the pages are edge-cached, so the server can't know
// the phone without varying the cache on user agent, which we never do.
// iPhone, iPad and desktop are untouched: the script returns at its first line.
//
// Loaded last on every page (<script src="/android.js" data-from="<kind>"
// data-city="<slug>">), after the page's own scripts, so nothing sets an App
// Store href back afterwards. On Android every App Store link (and any link
// marked data-app) points at
// https://play.google.com/store/apps/details?id=com.unaryx.suna, with the
// link's own ct (when it is a clean [a-z0-9-] name) as the install
// referrer's campaign (utm_source=suna&utm_campaign=<ct>), so Play Console
// counts installs per campaign. "App Store" in a label becomes "Google
// Play"; any other label stays. A caption about the App Store next to the
// button says "Free on Google Play." instead.
// unaryx.com has the same function in api/_lib/android.js.
//
// W-242 (Brian, 18 Nov; Android half A-167): the referrer also carries the
// page itself, suna_target=<path>, so the app opens it after the install.
// Only these path shapes: /i/<slug>, /e/<id>, /place/<slug>, /u/<username>,
// /cp/<code>; never the query (a share token can sit there), never anything
// else. Encoded, 200 characters at most, else left out (the link still
// works). With no clean ct, the campaign is the page kind (data-from).
(function () {
  if (!/Android/i.test(navigator.userAgent)) return;
  window.sunaIsAndroid = true;
  var PLAY = "https://play.google.com/store/apps/details?id=com.unaryx.suna";
  var SEL = 'a[href*="apps.apple.com"], a[data-app]';
  var me = document.currentScript;
  var KIND = (me && me.getAttribute("data-from")) || "";
  var CLEAN = /^[a-z0-9-]{1,40}$/;
  var SHAPES = [/^\/i\/[A-Za-z0-9-]{1,100}$/, /^\/e\/[A-Za-z0-9-]{1,64}$/, /^\/place\/[A-Za-z0-9-]{1,120}$/, /^\/u\/[A-Za-z0-9._]{1,40}$/, /^\/cp\/[A-Za-z0-9-]{1,40}$/];
  // This page's path when it is one of the shapes, encoded; else "".
  function target() {
    var p = location.pathname.replace(/\/+$/, "");
    for (var i = 0; i < SHAPES.length; i++) {
      if (SHAPES[i].test(p)) { var e = encodeURIComponent(p); return e.length <= 200 ? e : ""; }
    }
    return "";
  }
  window.sunaPlayTarget = target;

  // The Play link for one button: its original ct (else the page kind) as
  // the campaign, and this page as suna_target.
  function playHref(ct) {
    var camp = CLEAN.test(ct || "") ? ct : (CLEAN.test(KIND) ? KIND : "");
    var t = target();
    if (!camp && !t) return PLAY;
    var ref = "utm_source=suna" + (camp ? "&utm_campaign=" + camp : "") + (t ? "&suna_target=" + t : "");
    return PLAY + "&referrer=" + encodeURIComponent(ref);
  }
  function ctOf(a) {
    try { return new URL(a.getAttribute("href") || "", location.href).searchParams.get("ct") || ""; } catch (e) { return ""; }
  }
  // Swap "App Store" for "Google Play" in the label's text nodes only, so an
  // icon inside the button is kept.
  function relabel(node) {
    for (var c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) c.nodeValue = c.nodeValue.replace(/App Store/g, "Google Play");
      else if (c.nodeType === 1) relabel(c);
    }
  }
  // A caption about the App Store under the button (or its row).
  function caption(a) {
    var host = a.parentNode, cs = getComputedStyle(host);
    var after = /flex/.test(cs.display) && !/column/.test(cs.flexDirection) && host !== document.body ? host : a;
    var next = after.nextElementSibling;
    if (next && /(^|\s)caption(\s|$)/.test(next.className) && /App Store/.test(next.textContent)) next.textContent = "Free on Google Play.";
  }
  function swap(root) {
    var links = root.querySelectorAll ? root.querySelectorAll(SEL) : [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      if (a.hasAttribute("data-android")) continue;
      a.setAttribute("data-android", playHref(ctOf(a)));
      // The iPhone hand-off (try the app, then the App Store) is iOS-only
      // already; this makes sure no hand-off reads it on Android.
      a.removeAttribute("data-scheme");
      a.removeAttribute("data-open-suna");
      a.removeAttribute("data-app");
      a.removeAttribute("target");
      a.href = a.getAttribute("data-android");
      var before = a.textContent;
      relabel(a);
      // A half-width pair (Directions + Save on /e/) stacks full width when
      // the label grew, so it stays on one line.
      // An Apple logo beside "Google Play" would be wrong: it goes.
      if (a.textContent !== before) { var svgs = a.querySelectorAll("svg"); for (var v = 0; v < svgs.length; v++) svgs[v].parentNode.removeChild(svgs[v]); }
      if (a.textContent !== before && /(^|\s)half(\s|$)/.test(a.className)) {
        var pair = a.parentNode.children;
        for (var k = 0; k < pair.length; k++) if (/(^|\s)half(\s|$)/.test(pair[k].className)) pair[k].style.gridColumn = "1 / -1";
      }
      caption(a);
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
    if (a) a.href = a.getAttribute("data-android");
  }, true);
})();

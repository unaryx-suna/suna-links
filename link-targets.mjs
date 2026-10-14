// W-50 (Brian, 15 Oct): a link that leaves our sites opens in a new tab, and
// one that stays on them never does. Shared by the test suites; not served
// (nothing outside public/ and api/ is). Outbound = unaryx.com/go/ (it 302s to
// a seller or organiser) or any http(s) host that isn't ours. The App Store is
// left alone on purpose: iOS hands it to its own app, the same as Save in Suna.
// Mirrors unaryx-site smoke.mjs `badLinkTargets`.
const OUR_HOSTS = new Set(['unaryx.com', 'www.unaryx.com', 'app.unaryx.com']);

export function badLinkTargets(body) {
  const html = String(body).replace(/<script[\s\S]*?<\/script>/g, '');
  const bad = [];
  for (const m of html.matchAll(/<a\b[^>]*>/g)) {
    const tag = m[0];
    const href = (tag.match(/\bhref="([^"]*)"/) || [])[1];
    if (!href || /^(mailto:|tel:|#)/.test(href)) continue;
    let url = null;
    if (/^https?:\/\//.test(href)) { try { url = new URL(href.replace(/&amp;/g, '&')); } catch { continue; } }
    if (url && url.hostname === 'apps.apple.com') continue;
    const outbound = href.startsWith('/go/') || (url && (!OUR_HOSTS.has(url.hostname) || url.pathname.startsWith('/go/')));
    const blank = /\btarget="_blank"/.test(tag);
    const noopener = /\brel="[^"]*\bnoopener\b/.test(tag);
    if (outbound && !(blank && noopener)) bad.push(`outbound without a new tab: ${tag.slice(0, 140)}`);
    if (!outbound && blank) bad.push(`internal link opens a new tab: ${tag.slice(0, 140)}`);
  }
  return bad;
}

#!/usr/bin/env node
// W-52: the daily third-party dependency check for unaryx.com and
// app.unaryx.com. The same file lives in both repos (unaryx-site and
// suna-links-main); the iOS session's nightly (I-113) runs it.
//
//   node scripts/deps-check.mjs            JSON on stdout, exit 0
//   node scripts/deps-check.mjs --strict   exit 1 when a high/critical
//                                          advisory is found
//
// What the pages load is vendored files (unaryx-site's /vendor) and CDN tags
// (jsdelivr, cdnjs, unpkg), which `npm outdated` / `npm audit` can't see; and
// since W-112 unaryx-site's package.json pins the image routes' packages
// (sharp, satori), read here too. This does what npm's checks do, from the
// npm registry only:
//   - finds every vendored library and CDN-pinned script in tracked files,
//     with the version it is (or the range a CDN resolves, e.g. `@2`);
//   - asks the registry for the latest version and the newest in that range,
//     and says whether the gap is major, minor or patch;
//   - asks the registry's advisory endpoint (the one `npm audit` uses) about
//     the version each page actually gets.
// Read-only: never upgrades, never writes a file, no network beyond
// registry.npmjs.org. Anything it can't name or look up is listed, not
// guessed.

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const REGISTRY = 'https://registry.npmjs.org';
const STRICT = process.argv.includes('--strict');

// Vendored files we know: the npm package each one is, and how to read its
// version out of the file itself (a stale header would be caught by the
// second pattern where there is one).
const VENDORED = [
  { match: /(^|\/)gsap(\.min)?\.js$/, npm: 'gsap', version: [/GSAP (\d+\.\d+\.\d+)/] },
  { match: /(^|\/)ScrollTrigger(\.min)?\.js$/, npm: 'gsap', version: [/ScrollTrigger (\d+\.\d+\.\d+)/] },
  { match: /(^|\/)posthog[\w-]*\.js$/, npm: 'posthog-js', version: [/LIB_VERSION="(\d+\.\d+\.\d+)"/, /"version":"(\d+\.\d+\.\d+)"/] },
];
const VENDOR_DIR = /^(public\/)?vendor\//;

// CDN URLs that name an npm package and a version or range.
const CDN = [
  // cdn.jsdelivr.net/npm/<name>@<range>/...   unpkg.com/<name>@<range>/...
  { re: /https:\/\/(?:cdn\.jsdelivr\.net\/npm|unpkg\.com)\/((?:@[\w.-]+\/)?[\w.-]+)@([\w.^~*x-]+)/g, host: (m) => (m[0].includes('unpkg') ? 'unpkg.com' : 'cdn.jsdelivr.net') },
  // cdnjs.cloudflare.com/ajax/libs/<name>/<version>/...
  { re: /https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([\w.-]+)\/(\d+\.\d+\.\d+)/g, host: () => 'cdnjs.cloudflare.com' },
];
// Other outside scripts and stylesheets: listed, with their version when the
// URL carries one, but not on npm.
const OTHER_ASSET = /<(?:script|link)\b[^>]*\b(?:src|href)="(https:\/\/[^"]+)"/g;
const NOT_A_DEPENDENCY = /^https:\/\/(apps\.apple\.com|unaryx\.com|app\.unaryx\.com|voogrbonwmvfwtgzzrxc\.supabase\.co)(?![\w.-])|\$\{/;

/** Is a tracked path published? app.unaryx.com serves public/ and api/; unaryx.com the root minus .vercelignore. */
function servedTest() {
  if (existsSync(join(ROOT, 'public'))) return (p) => p.startsWith('public/') || p.startsWith('api/');
  const ignore = existsSync(join(ROOT, '.vercelignore'))
    ? readFileSync(join(ROOT, '.vercelignore'), 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
    : [];
  const rules = ignore.map((g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}(/|$)`));
  return (p) => !rules.some((r) => r.test(p) || r.test(p.split('/').pop()));
}

// ---- tiny semver: x.y.z only; prereleases are never "latest" ----
const parse = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v); return m ? m.slice(1).map(Number) : null; };
const cmp = (a, b) => { for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
/** Does `v` satisfy a CDN range: "3.12.5", "2", "2.x", "5.x.x", "^2.1.0", "~1.2.3", "latest"? */
function satisfies(v, range) {
  const p = parse(v); if (!p) return false;
  if (range === 'latest' || range === '*') return true;
  const caret = range.startsWith('^'); const tilde = range.startsWith('~');
  const parts = range.replace(/^[\^~]/, '').split('.');
  const nums = parts.map((x) => (/^\d+$/.test(x) ? Number(x) : null));
  if (caret && nums.length === 3 && nums.every((n) => n !== null)) return p[0] === nums[0] && cmp(p, nums) >= 0;
  if (tilde && nums.length === 3 && nums.every((n) => n !== null)) return p[0] === nums[0] && p[1] === nums[1] && cmp(p, nums) >= 0;
  return nums.every((n, i) => n === null || p[i] === n);
}
function bump(from, to) {
  const a = parse(from || ''); const b = parse(to || '');
  if (!a || !b) return null;
  if (cmp(a, b) >= 0) return 'none';
  return a[0] !== b[0] ? 'major' : a[1] !== b[1] ? 'minor' : 'patch';
}

async function getJSON(url, init) {
  const r = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`${url.replace(REGISTRY, 'registry')} → ${r.status}`);
  return r.json();
}

async function main() {
  const out = {
    repo: ROOT.split('/').pop(),
    generated_at: new Date().toISOString(),
    runtime: {},
    dependencies: [],
    other_third_party: [],
    summary: {},
    errors: [],
  };
  const files = execFileSync('git', ['ls-files'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const served = servedTest();

  // ---- runtime: what Vercel runs the api/ functions on ----
  const pkg = existsSync(join(ROOT, 'package.json')) ? JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) : null;
  const vercel = existsSync(join(ROOT, 'vercel.json')) ? JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8')) : {};
  const fnRuntimes = Object.values(vercel.functions || {}).map((f) => f && f.runtime).filter(Boolean);
  out.runtime = {
    node_pinned: (pkg && pkg.engines && pkg.engines.node) || (fnRuntimes.length ? fnRuntimes.join(', ') : null),
    note: (pkg && pkg.engines && pkg.engines.node) || fnRuntimes.length ? null
      : 'Not pinned in the repo (no package.json engines, no vercel.json runtime): the Vercel project\'s Node.js setting decides.',
    node_local: process.version,
  };

  // ---- find what the pages load ----
  const deps = new Map(); // npm name -> { name, where: [], versions: Set, ranges: Set, sources: Set }
  const add = (name, rec) => {
    const d = deps.get(name) || { name, where: [], versions: new Set(), ranges: new Set(), sources: new Set() };
    d.where.push(rec.where); d.sources.add(rec.source);
    if (rec.version) d.versions.add(rec.version);
    if (rec.range) d.ranges.add(rec.range);
    deps.set(name, d);
  };
  for (const f of files) {
    const isServed = served(f);
    if (VENDOR_DIR.test(f)) {
      const known = VENDORED.find((v) => v.match.test(f));
      const text = readFileSync(join(ROOT, f), 'utf8');
      if (!known) { out.other_third_party.push({ file: f, served: isServed, note: 'vendored file this check does not know; add it to VENDORED' }); continue; }
      const version = known.version.map((re) => (text.match(re) || [])[1]).find(Boolean) || null;
      if (!version) out.errors.push(`${f}: no version found in the file`);
      add(known.npm, { where: { file: f, served: isServed, kind: 'vendored' }, version, source: 'vendored' });
      continue;
    }
    if (!/\.(html|js|mjs|cjs|json|css)$/.test(f) || /(^|\/)(package-lock\.json)$/.test(f)) continue;
    const text = readFileSync(join(ROOT, f), 'utf8');
    for (const c of CDN) {
      for (const m of text.matchAll(c.re)) {
        const exact = parse(m[2]) ? m[2] : null;
        add(m[1], { where: { file: f, served: isServed, kind: 'cdn', url: m[0] }, version: exact, range: exact ? null : m[2], source: c.host(m) });
      }
    }
    for (const m of text.matchAll(OTHER_ASSET)) {
      if (/\brel="(preconnect|dns-prefetch)"/.test(m[0])) continue; // a hint, not a download
      const url = m[1];
      if (NOT_A_DEPENDENCY.test(url) || CDN.some((c) => new RegExp(c.re.source).test(url))) continue;
      const host = new URL(url).host;
      const ver = (url.match(/\/(\d+\.(?:\d+|x)\.(?:\d+|x))\//) || [])[1] || null;
      const seen = out.other_third_party.find((o) => o.url === url);
      if (seen) { if (!seen.files.includes(f)) seen.files.push(f); continue; }
      out.other_third_party.push({ url, host, version: ver, files: [f], served: isServed,
        note: ver && /x/.test(ver) ? 'floating range served by its owner; not on npm' : 'not on npm, no version in the URL' });
    }
  }
  // W-112: npm packages the api/ functions use (unaryx-site's image routes),
  // pinned exactly in package.json. Server-side: no page loads them.
  for (const [name, version] of Object.entries((pkg && pkg.dependencies) || {})) {
    add(name, { where: { file: 'package.json', served: false, kind: 'npm' }, version: parse(version) ? version : null, range: parse(version) ? null : version, source: 'package.json' });
  }
  // An outside asset only in unserved files isn't loaded by any page.
  for (const o of out.other_third_party) if (o.files) o.served = o.files.some((f) => served(f));

  // ---- ask the registry ----
  const queried = {};
  for (const d of deps.values()) {
    const rec = {
      name: d.name,
      sources: [...d.sources],
      where: d.where,
      served: d.where.some((w) => w.served),
      current: d.versions.size ? [...d.versions].sort((a, b) => cmp(parse(a), parse(b))) : [],
      ranges: [...d.ranges],
      latest: null,
      newest_in_range: {},
      update: null,
      advisories: [],
    };
    try {
      const meta = await getJSON(`${REGISTRY}/${d.name.replace('/', '%2F')}`, { headers: { Accept: 'application/vnd.npm.install-v1+json' } });
      const all = Object.keys(meta.versions || {}).filter(parse).sort((a, b) => cmp(parse(a), parse(b)));
      rec.latest = (meta['dist-tags'] && meta['dist-tags'].latest) || all[all.length - 1] || null;
      for (const r of rec.ranges) rec.newest_in_range[r] = all.filter((v) => satisfies(v, r)).pop() || null;
      // What visitors get: the pinned versions, and the newest in each range.
      const effective = [...rec.current, ...Object.values(rec.newest_in_range).filter(Boolean)];
      rec.effective = [...new Set(effective)];
      const oldest = rec.effective.slice().sort((a, b) => cmp(parse(a), parse(b)))[0];
      rec.update = oldest && rec.latest ? { from: oldest, to: rec.latest, bump: bump(oldest, rec.latest) } : null;
      if (rec.effective.length) queried[d.name] = rec.effective;
    } catch (e) {
      out.errors.push(`${d.name}: ${e.message}`);
    }
    out.dependencies.push(rec);
  }
  if (Object.keys(queried).length) {
    try {
      const adv = await getJSON(`${REGISTRY}/-/npm/v1/security/advisories/bulk`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(queried),
      });
      for (const rec of out.dependencies) {
        rec.advisories = (adv[rec.name] || []).map((a) => ({
          id: a.id, severity: a.severity, title: a.title, url: a.url, vulnerable_versions: a.vulnerable_versions,
          affects: (rec.effective || []).filter((v) => satisfiesRange(v, a.vulnerable_versions)),
        }));
      }
    } catch (e) {
      out.errors.push(`advisories: ${e.message}`);
    }
  }

  const sev = out.dependencies.flatMap((d) => d.advisories.map((a) => a.severity));
  out.summary = {
    dependencies: out.dependencies.length,
    served: out.dependencies.filter((d) => d.served).length,
    updates: { major: 0, minor: 0, patch: 0 },
    advisories: { critical: 0, high: 0, moderate: 0, low: 0 },
    high_or_critical: sev.filter((s) => s === 'high' || s === 'critical').length,
    floating: out.dependencies.filter((d) => d.ranges.length).map((d) => `${d.name}@${d.ranges.join(',')}`)
      .concat(out.other_third_party.filter((o) => o.version && /x/.test(o.version)).map((o) => o.url)),
    errors: out.errors.length,
  };
  for (const d of out.dependencies) if (d.update && out.summary.updates[d.update.bump] !== undefined) out.summary.updates[d.update.bump]++;
  for (const s of sev) if (out.summary.advisories[s] !== undefined) out.summary.advisories[s]++;

  process.stdout.write(JSON.stringify(out, null, 2) + '\n');
  if (STRICT && out.summary.high_or_critical) process.exit(1);
}

/** npm advisory ranges: "<1.2.3", ">=2.0.0 <2.4.1", "<=1.0.0 || >=3.0.0 <3.1.0". */
function satisfiesRange(v, range) {
  const p = parse(v); if (!p || !range) return false;
  return String(range).split('||').some((alt) => alt.trim().split(/\s+/).filter(Boolean).every((c) => {
    const m = /^(<=|>=|<|>|=)?v?(\d+\.\d+\.\d+)/.exec(c);
    if (!m) return c === '*';
    const d = cmp(p, parse(m[2]));
    return { '<': d < 0, '<=': d <= 0, '>': d > 0, '>=': d >= 0, '=': d === 0, undefined: d === 0 }[m[1]];
  }));
}

main().catch((e) => {
  process.stdout.write(JSON.stringify({ repo: ROOT.split('/').pop(), error: String(e && e.message || e) }) + '\n');
  process.exit(2);
});

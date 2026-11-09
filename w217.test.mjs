// W-217 (Search Console): app.unaryx.com's robots.txt keeps crawlers off the
// Save links (`?action=`) and leaves the event pages crawlable. `node w217.test.mjs`.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const robots = readFileSync(new URL('./public/robots.txt', import.meta.url), 'utf8');
const rules = robots.split('\n').map((l) => l.trim()).filter((l) => /^(Allow|Disallow):/.test(l));

// Google's matching: the longest matching rule wins; '*' is any run, '$' ends.
function allowed(path) {
  let best = null;
  for (const r of rules) {
    const [kind, pat] = r.split(/:\s*/);
    const re = new RegExp('^' + pat.replace(/[.+?^${}()|[\]\\]/g, (c) => (c === '$' ? c : `\\${c}`)).replace(/\*/g, '.*'));
    if (re.test(path) && (!best || pat.length > best.pat.length || (pat.length === best.pat.length && kind === 'Allow'))) best = { kind, pat };
  }
  return !best || best.kind === 'Allow';
}

let bad = 0;
const t = (name, fn) => { try { fn(); console.log('  ok   ' + name); } catch (e) { bad++; console.log('  FAIL ' + name + '\n       ' + e.message); } };

t('robots.txt has Disallow: /*?action= once', () => {
  assert.equal(rules.filter((r) => r === 'Disallow: /*?action=').length, 1);
});
t('a Save link is off limits; the event page, /i/ and /place/ stay crawlable', () => {
  assert.equal(allowed('/e/0b082ac6-5f11-424e-b0af-96d9d414acd5?action=save&src=event-web'), false);
  assert.equal(allowed('/e/0b082ac6-5f11-424e-b0af-96d9d414acd5'), true);
  assert.equal(allowed('/e/0b082ac6-5f11-424e-b0af-96d9d414acd5?via=qr-desktop'), true);
  assert.equal(allowed('/i/kl-nights--abc1234567'), true);
  assert.equal(allowed('/place/e88af899-3272-4daa-950a-13e485c499f5'), true);
  assert.equal(allowed('/field'), false);
});

console.log(bad ? `\n✗ ${bad} failed` : '\n✓ W-217 robots');
process.exit(bad ? 1 : 0);

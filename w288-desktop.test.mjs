// W-288 desktop Panel (Ops - Design 09:0x; Brian 09:02 "It's part of w288"). `node w288-desktop.test.mjs`
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const h = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
console.log('w288-desktop');
t('everything desktop sits behind min-width 900px; the phone layout has no new rules outside it', () => {
  const css = h.slice(h.indexOf('/* ════ W-288 DESKTOP'), h.indexOf('</style>'));
  assert.match(css, /^\/\* ════ W-288 DESKTOP[\s\S]*?\*\/\n  \.dk-only, \.dk-side \{ display: none; \}\n  @media \(min-width: 900px\) \{/);
  assert.equal(css.trim().endsWith('}'), true);
  assert.match(h, /const DK = window\.matchMedia\('\(min-width: 900px\)'\);/);
});
t('the sidebar: brand, white Add a place, Home, the four groups from HOME_GROUPS with their counts, the current tool highlighted; the phone menu stays one click away', () => {
  assert.match(h, /<nav class="dk-side" id="dk-side" aria-label="Panel"><\/nav>/);
  assert.match(h, /async function renderSide\(\)[\s\S]*for \(const \[title, rows\] of HOME_GROUPS\)[\s\S]*HOME_COUNT\[t\][\s\S]*'Account and build'[\s\S]*openMenu\(\)/);
});
t('Payments and Orders tables reuse the phone actions (data-tk / data-or), so the existing click handlers run them', () => {
  assert.match(h, /function dkPay\(\)[\s\S]*data-tk="paid"[\s\S]*Amount matches, mark paid<\/button><button type="button" class="ghost" data-tk="release"[\s\S]*class="ghost" data-tk="paid" data-ref="' \+ ref \+ '">Mark paid<\/button>/);
  assert.match(h, /function dkOrders\(\)[\s\S]*rp\.innerHTML = orCard\(sel\)/);
  assert.match(h, /<th>Package<\/th><th>Buyer<\/th><th>Paid<\/th><th>Next step<\/th><th class="r">Amount<\/th>/);
  assert.match(h, /<th>Reference<\/th><th>Name<\/th><th>Event<\/th><th>Should pay<\/th>/);
});
t('D1 moves the capture form\'s nodes (never copies) and puts them back under 900 px or during a Finish run', () => {
  assert.match(h, /function dkCapture\(on\)[\s\S]*for \(const k of dkCapState\.kids\) pane\.appendChild\(k\)/);
  assert.match(h, /dkCapture\(DK\.matches && !split\)/);
});
t('no dashes in the run\'s More label (Ops: no dashes in copy)', () => { assert.doesNotMatch(h, /More — everything else/); });
console.log(bad ? `\n✗ ${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

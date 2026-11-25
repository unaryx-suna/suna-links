// W-314 OD-web-Q8-1 / W-Q8-1: the Panel's Home leads with the Inbox: its unread count (purple when > 0), and the card opens the Inbox.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const html = readFileSync(new URL('./public/field.html', import.meta.url), 'utf8');
assert.match(html, /const ib = stat\(hc\('inbox'\), 'new in the inbox'\); ib\.classList\.add\('dk-ib'\); if \(hc\('inbox'\) > 0\) ib\.classList\.add\('on'\);/);
assert.match(html, /ib\.onclick = \(\) => switchTab\('inbox'\);/);
assert.match(html, /stats\.append\(ib, stat\(hc\('payments'\)/);
assert.match(html, /\.dk-ib\.on b \{ color: #B3A6FF; \}/);
assert.match(html, /if \(typeof dkTab !== 'undefined' && dkTab === 'home' && typeof renderDkHome === 'function'\) renderDkHome\(\);/);
console.log('w314-panel: all passed');

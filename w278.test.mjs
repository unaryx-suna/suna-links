// W-278 (Ops OPS-328) (b) and (c): the Panel opens any event by id; a refused photo says so loudly.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const f = readFileSync('./public/field.html', 'utf8');
let bad = 0;
const t = (n, fn) => { try { fn(); console.log('  ok   ' + n); } catch (e) { bad++; console.log('  FAIL ' + n + '\n       ' + e.message); } };
console.log('w278');
t('(b) #event=<id> outside the 400 loaded (after ~15 Jan, or over) is fetched by id, any status, then opened', () => {
  const fn = f.slice(f.indexOf('async function evOpenFromHash'), f.indexOf('$(\'ev-search\').oninput'));
  assert.match(fn, /if \(!row && \/\^\[0-9a-f-\]\{36\}\$\/i\.test\(id\)\)/);
  assert.match(fn, /\.from\('world_events'\)[\s\S]*?\.eq\('id', id\)\.maybeSingle\(\)/);
  assert.doesNotMatch(fn.split(".eq('id', id)")[0].split("if (!row &&")[1], /\.gte\(|\.in\('status'/, 'no date or status filter on the single read');
  assert.match(fn, /evRows\.push\(data\); row = data;/);
});
t('(c) a refusal (e.g. "That photo is 520 pixels wide. We need at least 600.") is a red alert scrolled into view, never a quiet grey line', () => {
  assert.match(f, /That photo is ' \+ img\.naturalWidth\s*\+ ' pixels wide\. We need at least ' \+ EV_MIN_WIDTH \+ '\.'/);
  const fn = f.slice(f.indexOf('function evNote('), f.indexOf('const EV_RESIZE_TIMEOUT_MS'));
  assert.match(fn, /classList\.toggle\('ev-bad', bad\)/);
  assert.match(fn, /setAttribute\('role', bad \? 'alert' : 'status'\)/);
  assert.match(fn, /scrollIntoView/);
  assert.match(f, /#ev-note\.ev-bad \{ color: #b3261e;/);
});
console.log(bad ? `\n✗ ${bad} failed` : '\nall passed');
process.exit(bad ? 1 : 0);

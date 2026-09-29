// Suna Lab — decisions, not chat. The quick-answer UI.
//
// Brief: claude/PROMPT-LAB-UI-DECISIONS-BUILD.md. Layout, copy and spacing
// from the canvas export; type and colour from the app brand. No photos.
//
// Quick answers only. Plans keep today's screens — renderPlan is untouched.
//
// Everything here is presentation. The lines come from the server (one per
// real stage event), the picks come from the writer, and every number on the
// card face — walk, open till, price — is computed by code, never written.

import { SUNA_DEFS, SUNA_CSS, SUNA_STATES, SUNA_FACE_STATE, sunaSvg } from './suna-faces.js?v=lab-v51';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

let cssInjected = false;
export function installDecisionsUI() {
  if (cssInjected) return;
  cssInjected = true;
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = '/lab/decisions.css?v=lab-v51';
  document.head.append(link);
  const st = document.createElement('style');
  st.textContent = SUNA_CSS;
  document.head.append(st);
  // Her gradients and filters live once in the document, not once per face:
  // every rig points at the same url(#sna-…) ids.
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  defs.setAttribute('width', '0'); defs.setAttribute('height', '0');
  defs.setAttribute('aria-hidden', 'true');
  defs.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden';
  defs.innerHTML = `<defs>${SUNA_DEFS}</defs>`;
  document.body.prepend(defs);
}

// ── Suna ───────────────────────────────────────────────────────────────────
//
// The canvas's motion, lifted whole (suna-motion.css). Each state is a 7–18 s
// scene with separately moving parts, so a state is a CLASS on one <svg>, not
// a different drawing: swapping the markup would restart every part mid-scene.
//
// Sizes are the boards': about 190 px while she is waiting, the found scene
// big for 1.5 s and then 56 px beside the card, 120 px pouting in the sheet.

export const SUNA_WAIT_H = 190;
export const SUNA_CARD_H = 56;
export const SUNA_POUT_H = 120;
export const SUNA_REACT_H = 58;
/// The found scene plays at full size this long before she takes her seat.
const FOUND_BIG_MS = 1500;
/// st-found-once runs 3.2 s once; after it she settles into the small loop.
const FOUND_ONCE_MS = 3200;
/// A new line arrives faded under the old one, then takes its place.
const LINE_SWAP_MS = 500;

const stillness = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

const stateFor = (face) => SUNA_FACE_STATE[face] ?? 'st-idle';

/// Put her in a state. Where two states draw her the same way — the found
/// scene at three sizes and three speeds — only the class changes, so the
/// scene carries on instead of snapping back to frame zero.
function setState(fig, state) {
  const svg = fig.querySelector('svg');
  const now = fig.dataset.state;
  if (svg && now && SUNA_STATES[now]?.body === SUNA_STATES[state]?.body) {
    svg.setAttribute('class', `sn ${state}`);
    const label = SUNA_STATES[state]?.label;
    if (label) svg.setAttribute('aria-label', label);
  } else {
    fig.innerHTML = sunaSvg(state, SUNA_WAIT_H);
  }
  fig.dataset.state = state;
}

/// Her face and her line.
export function sunaBlock(face = 'idle', text = '', opts = {}) {
  installDecisionsUI();
  const wrap = el('div', `dx sunablock${opts.hello ? ' hello' : ''}${opts.small ? ' small' : ''}`);
  const fig = el('div', 'sunafig');
  setState(fig, stateFor(face));
  // ONE line. Brian, 29 Sep: "Lines replace each other, one at a time, all
  // in the same style." The board's faded queued second line meant two
  // stages were on screen at once, in two different weights, and the
  // mismatch line arrived in a third style in a box of its own.
  const lines = el('div', 'sunalines');
  lines.append(el('div', 'sunaline', text ?? ''));
  wrap.append(fig, lines);
  return wrap;
}

/// A new line appears faded below the one on screen, then takes its place —
/// the canvas's two-line composition, and the reason the second line is only
/// ever a step that really ran.
function sayLine(node, text) {
  if (!text) return;
  const now = node.querySelector('.sunaline');
  if (!now || now.textContent === text) return;
  // She is on one stage at a time, so the line for the stage she is on is
  // the only line. Swapped, not stacked.
  now.textContent = text;
}

export function updateSuna(node, face, text, small) {
  if (!node) return;
  const fig = node.querySelector('.sunafig');
  if (fig && face) setState(fig, stateFor(face));
  sayLine(node, text);
  if (small) node.classList.add('small');
}

/// §5. A card has landed. She plays the found scene big, then takes her
/// 56 px seat beside it — the card board's entry, without its fixed frame.
export function sunaFound(node) {
  if (!node) return;
  const fig = node.querySelector('.sunafig');
  if (!fig) return;
  clearTimeout(node._big); clearTimeout(node._settle);
  if (stillness()) { setState(fig, 'st-foundsm'); node.classList.add('small'); return; }
  setState(fig, 'st-found-once');
  node.classList.add('entry');
  node._big = setTimeout(() => { node.classList.remove('entry'); node.classList.add('small'); }, FOUND_BIG_MS);
  node._settle = setTimeout(() => setState(fig, 'st-foundsm'), FOUND_ONCE_MS);
}

/// A-0228. The waiting line goes when the answer lands. A plan has no
/// "found" line to replace it with, so she is left small and silent beside
/// it rather than still saying "Checking Mongolia…" over a finished plan.
export function hushSuna(node) {
  if (!node) return;
  for (const l of node.querySelectorAll('.sunaline')) l.textContent = '';
}

/// One face on its own, at a given height — the sheet's pout, the reaction
/// beside a Not this line.
export function sunaFigure(face, height) {
  installDecisionsUI();
  const fig = el('div', 'sunafig one');
  fig.style.setProperty('--sunah', `${height}px`);
  fig.innerHTML = sunaSvg(stateFor(face), height);
  fig.dataset.state = stateFor(face);
  return fig;
}

// ── Ask ────────────────────────────────────────────────────────────────────

/// The canvas's three examples, verbatim.
export const EXAMPLES = [
  'Got 3 hours, surprise me',
  'Somewhere good to eat nearby',
  'Plan my weekend',
];

/// §3 / Main.dc.html. The landing screen: her greeting, one big box with
/// Send inside it, and three examples. No sentence builder, no thread.
///
/// The box and the send button are the page's OWN `#box` and `#send`, moved
/// in here rather than rebuilt. Everything already wired to them — the send
/// handler, prefetch-while-typing, the daily limit, clearing on send — keeps
/// working, and there is only ever one composer in the document.
export function askScreen({ greeting, box, send, attach, onExample }) {
  installDecisionsUI();
  const root = el('div', 'dx ask');

  root.append(sunaBlock('idle', greeting, { hello: true }));

  const wrap = el('div', 'askbox-wrap');
  if (box) {
    box.classList.add('askbox');
    // The board's label is for screen readers only: the placeholder carries
    // it on screen, and a visible copy above the box is a second heading.
    box.setAttribute('aria-label', "Tell Suna what you're up for");
    box.placeholder = "Tell Suna what you're up for…";
    box.rows = 4;
    wrap.append(box);
  }
  if (attach) { attach.classList.add('askattach'); wrap.append(attach); }
  if (send) { send.classList.add('asksend'); wrap.append(send); }
  root.append(wrap);

  const stuck = el('section', 'stuck');
  stuck.append(el('h2', null, 'Stuck? Tap one'));
  const examples = el('div', 'examples');
  for (const e of EXAMPLES) {
    const b = el('button', 'example', e);
    b.type = 'button';
    // §3: an example TAP is logged as one, so "typed vs tapped" is a real
    // measure rather than whatever ended up in the box.
    b.onclick = () => onExample(e);
    examples.append(b);
  }
  stuck.append(examples);
  root.append(stuck);
  return root;
}

// ── Understood chips ───────────────────────────────────────────────────────

const CHIP_KEYS = [
  ['time', 'How long have you got?'],
  ['area', 'Where?'],
  ['who', "Who's coming?"],
];

/// §4. What Suna understood, tappable to fix, × to drop. Either one cancels
/// the running search and re-runs it with the change.
export function chipsBlock(parse, { onEdit, onRemove, onAdd }) {
  const wrap = el('div', 'dx');
  wrap.append(el('div', 'chiphint', 'Suna understood · tap to fix, × to drop'));
  const row = el('div', 'chips understood');

  const add = (key, value, kind) => {
    if (!value) return;
    const chip = el('div', `chip2${kind === 'not' ? ' no' : ''}`);
    const label = el('button', null, kind === 'not' ? `no ${value}` : String(value));
    label.type = 'button';
    label.onclick = () => onEdit(key, value, kind);
    const x = el('button', 'x', '×');
    x.type = 'button';
    x.setAttribute('aria-label', `Remove ${value}`);
    x.onclick = () => onRemove(key, value, kind);
    chip.append(label, x);
    row.append(chip);
  };

  for (const [k] of CHIP_KEYS) add(k, parse?.[k], 'one');
  for (const v of (parse?.likes ?? [])) add('likes', v, 'like');
  for (const v of (parse?.not_for_me ?? [])) add('not_for_me', v, 'not');
  // Ask-chip.dc.html: "Add something Suna missed". The chips are what she
  // heard, so there has to be a way to tell her what she did not.
  if (onAdd) {
    const plus = el('button', 'chipadd', '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Add something Suna missed');
    plus.onclick = onAdd;
    row.append(plus);
  }
  wrap.append(row);
  return wrap;
}

/// §4 / Ask-chip.dc.html. Tapping a chip opens its sheet. It used to open
/// `window.prompt`, which is a blocking browser dialog, not a design — and
/// the time chip is the one the board actually draws, with six presets.
export const CHIP_SHEETS = {
  time: {
    title: 'How long have you got?',
    hint: 'The search keeps going. Changing this re-runs it.',
    options: ['Right now', '1 hour', '3 hours', 'Tonight', 'Tomorrow night', 'A trip…'],
  },
  area: { title: 'Where?', hint: 'Changing this re-runs the search.', options: [] },
  who: { title: "Who's coming?", hint: 'Changing this re-runs the search.',
         options: ['Solo', 'Two of us', 'With friends', 'With kids'] },
  likes: { title: 'What are you after?', hint: 'Changing this re-runs the search.', options: [] },
  not_for_me: { title: "What's out?", hint: 'Changing this re-runs the search.', options: [] },
};

export function chipSheet(key, value, { onPick }) {
  const spec = CHIP_SHEETS[key] ?? { title: `Change "${value}"`, hint: '', options: [] };
  return sheet(spec.title, (close) => {
    const f = document.createDocumentFragment();
    if (spec.hint) f.append(el('div', 'src', spec.hint));
    if (spec.options.length) {
      const row = el('div', 'reasons');
      for (const o of spec.options) {
        const b = el('button', `reason${o.toLowerCase() === String(value ?? '').toLowerCase() ? ' on' : ''}`, o);
        b.type = 'button';
        b.setAttribute('aria-pressed', String(o.toLowerCase() === String(value ?? '').toLowerCase()));
        b.onclick = () => { close(); onPick(o); };
        row.append(b);
      }
      f.append(row);
    }
    // Anything the presets do not cover. The board has presets only, but a
    // chip the tester typed has to be editable or the × is the only way out.
    const own = el('input', 'askown');
    own.type = 'text';
    own.value = value ?? '';
    own.setAttribute('aria-label', spec.title);
    const save = el('button', 'go', 'Use this');
    save.type = 'button';
    save.onclick = () => { const v = own.value.trim(); if (v) { close(); onPick(v); } };
    f.append(own, save);
    return f;
  });
}

/// One line of text, in a sheet. Same reason as chipSheet: window.prompt
/// and window.confirm are system dialogs, and this design does not have
/// any. Returns through onSave; Cancel just closes.
export function textSheet(title, value, { onSave, hint, confirmLabel = 'Save' }) {
  return sheet(title, (close) => {
    const f = document.createDocumentFragment();
    if (hint) f.append(el('div', 'src', hint));
    const input = el('input', 'askown');
    input.type = 'text';
    input.value = value ?? '';
    input.setAttribute('aria-label', title);
    const go = el('button', 'go', confirmLabel);
    go.type = 'button';
    go.onclick = () => { const v = input.value.trim(); close(); if (v && v !== value) onSave(v); };
    const cancel = el('button', 'linkish2', 'Cancel');
    cancel.type = 'button';
    cancel.onclick = close;
    f.append(input, go, cancel);
    setTimeout(() => input.focus(), 50);
    return f;
  });
}

/// A destructive confirm, as a sheet rather than window.confirm.
export function confirmSheet(title, { hint, danger = 'Delete', onYes }) {
  return sheet(title, (close) => {
    const f = document.createDocumentFragment();
    if (hint) f.append(el('div', 'src', hint));
    const yes = el('button', 'btn danger', danger);
    yes.type = 'button';
    yes.onclick = () => { close(); onYes(); };
    const no = el('button', 'linkish2', 'Keep it');
    no.type = 'button';
    no.onclick = close;
    f.append(yes, no);
    return f;
  });
}

// ── The decision card ──────────────────────────────────────────────────────

/// §5. Walk, open till and price are CODE's, from Routes or distance,
/// weekly_hours at for_time, and the price level. The writer never writes
/// them, so they are read off the pick rather than out of its prose.
/// The board's glyphs, inline so there is no second request for them.
const ICON = {
  walk: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="13" cy="4" r="1.6"/><path d="M11 21l1.5-6-2.5-2 1-5 3 2 2.5 1"/><path d="M9.5 12L8 16"/><path d="M13 15l3 6"/></svg>',
  clock: '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>',
  info: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>',
  save: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg>',
  go: '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 11l18-8-8 18-2-8z"/></svg>',
};

/// A glyph beside its text, in one element.
function withIcon(tag, cls, icon, text) {
  const n = el(tag, cls);
  const g = el('span', 'gi');
  g.innerHTML = ICON[icon] ?? '';
  n.append(g, el('span', null, text));
  return n;
}

/// 24-hour times are a data format; the card speaks. "00:00" is "12am".
export function ampm(t) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
  if (!m) return t ?? null;
  const h = Number(m[1]), mins = m[2];
  if (!Number.isFinite(h) || h > 24) return t;
  const suffix = h >= 12 && h < 24 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return mins === '00' ? `${h12}${suffix}` : `${h12}:${mins}${suffix}`;
}

/// GO-LIVE §2.1. Beyond this the walk stops being a walk and the card shows
/// the distance instead.
const WALK_MAX_KM = 2;

export function walkText(pick) {
  // "about", because Mode A has no Routes: these legs are a straight line
  // x 1.3 at 4.8 km/h, and the server marks them `estimate`. Printing "12 min
  // walk" would dress a guess up as a measurement.
  const far = pick.km != null && Number(pick.km) >= WALK_MAX_KM;
  if (pick.walk_minutes != null && !far) return `about ${pick.walk_minutes} min walk`;
  if (pick.km != null) return `${pick.km} km away`;
  if (pick.walk_minutes != null) return `about ${pick.walk_minutes} min walk`;
  return null;
}

function factsLine(pick) {
  const out = [];
  const walk = walkText(pick);
  if (walk) out.push(withIcon('span', 'fact', 'walk', walk));
  // "Open till 14:30–00:00" is a range wearing the wrong label. The hours
  // string can hold several sessions; what the card face wants is the last
  // closing time of the day.
  const closes = lastCloseOf(pick.open_till);
  if (closes) out.push(withIcon('span', 'fact', 'clock', `Open till ${ampm(closes)}`));
  else if (pick.open_till) out.push(withIcon('span', 'fact', 'clock', pick.open_till));
  else if (pick.open_now === false) out.push(withIcon('span', 'fact', 'clock', 'Closed now'));
  // §2.1: "Show price on the card only when the place has a price level.
  // Otherwise leave it off; don't show a placeholder." A row of empty dollar
  // signs is a claim about a place nobody priced.
  const level = Number(pick.price_level);
  if (Number.isFinite(level) && level >= 1) {
    const p = el('span', 'fact', '$'.repeat(Math.min(4, Math.round(level))));
    p.setAttribute('aria-label', `Price: ${'$'.repeat(Math.min(4, Math.round(level)))}`);
    out.push(p);
  }
  return out;
}

/// The last closing time in an hours string, or null when it is not a
/// simple one. "09:00–17:30" → "17:30"; "08:00–13:00, 14:00–04:00" → "04:00".
export function lastCloseOf(hours) {
  const t = String(hours ?? '');
  if (!t.trim() || /closed/i.test(t)) return null;
  if (/open 24 hours/i.test(t)) return null;
  const times = [...t.matchAll(/(\d{1,2}:\d{2}|\d{1,2}\s?[ap]m)/gi)].map((m) => m[1]);
  return times.length >= 2 ? times[times.length - 1] : null;
}

export function decisionCard(pick, {
  onGo, onNotThis, onSave, onDetails, onNudge, onWouldGo, onAfterGo, after, nudges,
}) {
  const card = el('div', 'card');

  const top = el('div', 'cardtop');
  top.append(el('div', 'eyebrow', 'Your pick for tonight'));
  const details = withIcon('button', 'linkish2 withicon', 'info', 'Details');
  details.type = 'button';
  details.onclick = onDetails;
  top.append(details);
  card.append(top);

  card.append(el('div', 'placename', pick.name ?? 'Somewhere'));
  if (pick.why) card.append(el('div', 'why', pick.why));

  const facts = el('div', 'facts');
  for (const f of factsLine(pick)) facts.append(f);
  if (facts.children.length) card.append(facts);

  const actions = el('div', 'actions');
  const go = withIcon('button', 'go', 'go', 'Go');
  go.type = 'button'; go.onclick = onGo;
  const not = el('button', 'btn', 'Not this');
  not.type = 'button'; not.onclick = onNotThis;
  const save = withIcon('button', 'btn', 'save', 'Save');
  save.type = 'button'; save.onclick = onSave;
  actions.append(go, not, save);
  card.append(actions);

  const blocks = [card];

  // §5 / GO-LIVE §3.5. "After that" is its own small card with its own Go —
  // and on Card.dc.html it sits BELOW the pick's card, not inside its
  // border: it is a second place, not a footnote on the first.
  if (after?.name) {
    // Card.dc.html: one compact row — the label, the name, the travel — with
    // an outlined sand Go on the right. Not a second full card.
    const a = el('div', 'after');
    const words = el('div', 'afterwords');
    words.append(el('div', 'eyebrow', 'After that'));
    words.append(el('div', 'aftername', after.name));
    const travel = after.travel ?? walkText(after);
    if (travel) words.append(el('div', 'src', travel));
    a.append(words);
    const go = el('button', 'aftergo', 'Go');
    go.type = 'button';
    go.setAttribute('aria-label', `Go to ${after.name}`);
    go.onclick = () => onAfterGo?.(after);
    a.append(go);
    blocks.push(a);
  }

  if (nudges?.length) {
    const row = el('div', 'nudges');
    for (const n of nudges) {
      const b = el('button', 'nudge', n);
      b.type = 'button';
      b.onclick = () => onNudge(n);
      row.append(b);
    }
    blocks.push(row);
  }

  // Centred, and plain: the board does not put these in buttons, because
  // they are a question about the pick, not another thing to do with it.
  const wy = el('div', 'wouldyou');
  wy.append(el('span', 'wylabel', 'Would you go?'));
  for (const label of ['Yes', 'No']) {
    const b = el('button', 'plain', label);
    b.type = 'button';
    b.onclick = () => onWouldGo(label === 'Yes');
    wy.append(b);
  }
  blocks.push(wy);

  // One element back to the caller, holding the card and everything the
  // board places under it.
  const stack = el('div', 'cardstack');
  stack.append(...blocks);
  return stack;
}

export const NUDGES = ['Closer', 'Cheaper', 'Indoors', 'Livelier', 'Tomorrow night'];

// ── Sheets ─────────────────────────────────────────────────────────────────

/// `build` is handed the sheet's own `close`. It used to close itself with
/// `document.querySelector('.scrim').remove()`, and the page already has a
/// `.scrim` — the menu's, sitting earlier in the document. So every Not this
/// removed the MENU's scrim and left the sheet's own one covering the app:
/// the whole screen stayed dimmed for the rest of the session, and the menu
/// stopped closing. Nothing here queries the document for its own nodes.
function sheet(title, build, onClose, opts = {}) {
  const scrim = el('div', 'dxscrim');
  const s = el('div', 'dx sheet');
  const close = () => { scrim.remove(); s.remove(); onClose?.(); };
  // Details.dc.html and NotThis.dc.html both open with a grab handle, and
  // Details has an explicit close. A sheet you can only dismiss by hitting
  // the strip of scrim above it is a sheet that feels stuck.
  s.append(el('div', 'grab'));
  // The board puts her beside the title, not above it: 120 px, pouting,
  // already sulking before you have picked a reason.
  if (opts.face) {
    const head = el('div', 'sheethead');
    head.append(sunaFigure(opts.face, SUNA_POUT_H));
    const words = el('div');
    words.append(el('h3', null, title));
    if (opts.hint) words.append(el('p', 'src', opts.hint));
    head.append(words);
    s.append(head);
  } else {
    const head = el('div', 'sheettitle');
    const words = el('div');
    // "Details / Jalan Alor", not "Details for Jalan Alor": the place is
    // the heading, and the word above it says what you are looking at.
    if (opts.eyebrow) words.append(el('div', 'eyebrow', opts.eyebrow));
    words.append(el('h3', null, title));
    head.append(words);
    const x = el('button', 'sheetclose', '\u00D7');
    x.type = 'button';
    x.setAttribute('aria-label', 'Close');
    x.onclick = close;
    head.append(x);
    s.append(head);
  }
  s.append(build(close));
  scrim.onclick = close;
  document.body.append(scrim, s);
  return close;
}

/// §6. Reasons, "Skip, just show it", Undo.
export const NOT_THIS_REASONS = [
  ['too_far', 'Too far'],
  ['not_my_thing', 'Not my thing'],
  ['been_there', 'Been there'],
  ['looks_shut', 'Looks shut'],
  ['too_pricey', 'Too pricey'],
  ['too_busy', 'Too busy'],
];

export function notThisSheet(placeName, { onReason, onSkip, onUndo }) {
  return sheet(`What's off about ${placeName}?`, (close) => {
    const f = document.createDocumentFragment();
    const row = el('div', 'reasons');
    for (const [key, label] of NOT_THIS_REASONS) {
      const b = el('button', 'reason', label);
      b.type = 'button';
      b.onclick = () => { close(); onReason(key, label); };
      row.append(b);
    }
    f.append(row);
    const skip = el('button', 'plain muted', 'Skip, just show it');
    skip.type = 'button';
    skip.onclick = () => { close(); onSkip(); };
    const undo = el('button', 'linkish2', 'Undo');
    undo.type = 'button';
    undo.onclick = () => { close(); onUndo(); };
    f.append(skip, undo);
    return f;
  }, undefined, { face: 'pout', hint: 'One tap. Your next pick is already here.' });
}

/// §6. Her reaction to the reason, above the next card. The line came down
/// with the answer, so this costs nothing and lands with the card.
export function reactionLine(reaction, { skipped, savedText, onUndo } = {}) {
  // NotThis.dc.html: one strip above the next card — what was skipped, her
  // reaction with her face, what got saved, and Undo.
  const wrap = el('div', 'dx reaction');
  // Top row: what was skipped, and the way back. The board keeps these two
  // on one line because they are the same thought.
  const top = el('div', 'skiprow');
  top.append(el('span', 'skipped', skipped ? `Skipping ${skipped}` : ''));
  if (onUndo) {
    const u = el('button', 'plain undo', 'Undo');
    u.type = 'button';
    u.onclick = onUndo;
    top.append(u);
  }
  wrap.append(top);
  // Then her face and what she said about it.
  const said = el('div', 'saidrow');
  said.append(sunaFigure(reaction?.face ?? 'pout', SUNA_REACT_H));
  const words = el('div', 'sunalines');
  words.append(el('div', 'sunaline', reaction?.text ?? ''));
  if (savedText) words.append(el('div', 'src', savedText));
  said.append(words);
  wrap.append(said);
  return wrap;
}

/// §5. Details behind one tap. Sources are printed by code.
export function detailsSheet(pick, { onWrong }) {
  return sheet(pick.name ?? 'This place', () => {
    const f = document.createDocumentFragment();
    const section = (title, body) => {
      if (!body) return;
      f.append(el('div', 'eyebrow', title));
      if (typeof body === 'string') f.append(el('div', null, body));
      else f.append(body);
    };
    section('Hours today', pick.hours_today ?? "Not published, so worth checking.");
    section('How far', pick.walk_minutes != null
      ? `${pick.walk_minutes} min walk from where you are.`
      : (pick.km != null ? `${pick.km} km from where you are.` : null));
    if (pick.fits?.length) {
      const row = el('div', 'chips');
      for (const fit of pick.fits) row.append(el('span', 'chip2', fit));
      section('Why this for you', row);
    }
    section('Heads up', pick.heads_up);
    if (pick.unknowns?.length) {
      section("What we couldn't check", pick.unknowns.join(' '));
    }
    if (pick.claims?.length) {
      const list = el('div');
      for (const c of pick.claims) {
        const r = el('div', 'rowline');
        r.append(el('span', null, c.text ?? String(c)));
        if (c.source_name) r.append(el('span', 'src', c.source_name));
        list.append(r);
      }
      section('Sources', list);
    }
    const wrong = el('button', 'linkish2', 'Something wrong?');
    wrong.type = 'button';
    wrong.onclick = onWrong;
    f.append(wrong);
    return f;
  }, undefined, { eyebrow: 'Details' });
}

/// §7. What Suna knows: every row editable, Reset clears the lot.
export function knowsPanel(profile, { onEdit, onRemove, onReset, onAdd }) {
  return sheet('What Suna knows', () => {
    const f = document.createDocumentFragment();
    f.append(el('div', 'src', 'Your chips are filled in from this. Change anything.'));
    const group = (title, rows, addKey) => {
      f.append(el('div', 'eyebrow', title));
      if (!rows.length) {
        f.append(el('div', 'src', addKey === 'learned'
          ? 'Nothing yet. Reasons you give on Not this show up here.'
          : 'Nothing yet.'));
      }
      for (const r of rows) {
        const line = el('div', 'rowline');
        const label = el('button', 'linkish2', r.value);
        label.type = 'button';
        label.onclick = () => onEdit(r);
        line.append(label);
        const right = el('span');
        if (r.source_label) right.append(el('span', 'src', r.source_label));
        const x = el('button', 'x', ' ×');
        x.type = 'button';
        x.setAttribute('aria-label', `Remove ${r.value}`);
        x.onclick = () => onRemove(r);
        right.append(x);
        line.append(right);
        f.append(line);
      }
      if (addKey && addKey !== 'learned') {
        const add = el('button', 'linkish2', 'Add');
        add.type = 'button';
        add.onclick = () => onAdd(addKey);
        f.append(add);
      }
    };
    group('This trip', profile.trip ?? []);
    group('Likes', profile.likes ?? [], 'interests');
    group('Not for me', profile.not_for_me ?? [], 'avoid');
    group('Learned from your Not this taps', profile.learned ?? [], 'learned');
    // Knows.dc.html marks it as the destructive action it is.
    const reset = el('button', 'btn danger', 'Reset what Suna knows');
    reset.type = 'button';
    reset.onclick = onReset;
    f.append(reset);
    return f;
  });
}

/// §6. Code reorders the remaining picks by the reason given.
export function reorderByReason(picks, reason, rejected) {
  const rest = picks.filter((p) => p !== rejected);
  const by = (fn) => [...rest].sort(fn);
  switch (reason) {
    case 'too_far':
      return by((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
    case 'too_pricey':
      return by((a, b) => (a.price_level ?? 9) - (b.price_level ?? 9));
    case 'not_my_thing':
      // A different kind from the one just rejected, first.
      return by((a, b) =>
        Number(a.kind === rejected?.kind) - Number(b.kind === rejected?.kind));
    case 'too_busy':
      return by((a, b) => (a.rating_count ?? Infinity) - (b.rating_count ?? Infinity));
    default:
      return rest;   // by rank, as given
  }
}

// ── Plans ──────────────────────────────────────────────────────────────────
//
// Plan.dc.html and PlanDay.dc.html. A plan is a strip of day cards titled by
// their anchor place, and a day is its stops as small cards with the same
// three actions as a decision card. No THE PLAN / WORTH EATING / CAVEATS
// rows, and no "Save plan": the day cards ARE the plan.

/// The stops of a day, in the order they are done, for the strip's summary.
function stopNames(day, nameOf) {
  return ((day?.items ?? []).map((it) => nameOf(it)).filter(Boolean));
}

/// A day's heading is its anchor place. The writer's own label is used when
/// it names one; otherwise the day's first stop is the honest answer, and
/// `generic_day_title` has already counted the writer's miss.
export function dayHeading(block, day, nameOf) {
  const names = stopNames(day, nameOf);
  const label = String(block?.label ?? '').trim();
  const dayLabel = String(day?.day ?? '').trim();
  const partOfDay = /\b(morning|afternoon|evening|night|weekend|arrival|arriving|departure|departing|dawn|dusk|midday|noon|lunch|dinner|breakfast)\b/i;

  // v2.6 writes the day as "Day N · <anchor place>", so the anchor is the
  // writer's own choice of what the day is about. Take it.
  const anchor = /·/.test(dayLabel) ? dayLabel.split('·').pop().trim() : '';
  if (anchor && !partOfDay.test(anchor) && anchor.toLowerCase() !== 'free') return anchor;

  // The block label counts only when it names one of the day's places.
  const oneDay = (block?.days ?? []).length <= 1;
  const namesAPlace = label && names.some((n) => {
    const a = String(n).toLowerCase(), l = label.toLowerCase();
    return l.includes(a) || a.includes(l);
  });
  if (label && oneDay && !partOfDay.test(label) && namesAPlace) return label;

  // Brian, 29 Sep: "A day's title is never the first stop. Use the writer's
  // anchor, or the LONGEST stop if there's none." The first stop is an
  // accident of ordering — a coffee before the thing you came for — and it
  // made the card read as though the day were about the coffee.
  const longest = [...names].sort((a, b) => String(b).length - String(a).length)[0];
  return longest ?? (label && !partOfDay.test(label) ? label : String(block?.base ?? 'Your day'));
}

/// §4. The strip: one card per day, titled by where it goes.
export function planScreen(parsed, { nameOf, onDay, headline }) {
  installDecisionsUI();
  const root = el('div', 'dx plan');

  const title = headline ?? String(parsed?.title ?? '').trim();
  if (title) root.append(el('h1', 'planhead', title));

  // §4. What the plan is built on, in the model's own words. Not rendered
  // before this version: A-0237 and A-0238 both wrote a `context` line and a
  // `meta` count and both were dropped on the floor.
  const context = String(parsed?.context ?? '').trim();
  const meta = String(parsed?.meta ?? '').trim();
  if (context || meta) {
    const lead = el('div', 'planlead');
    if (meta) lead.append(el('div', 'eyebrow', meta));
    if (context) lead.append(el('p', 'planctx', context));
    root.append(lead);
  }

  // "Sort these first" survives from the old screens because it is the one
  // part a tester has to act on before the trip, not while reading it.
  const first = (parsed?.sort_first ?? []).filter((x) => x?.headline);
  if (first.length) {
    const sec = el('section', 'sortfirst');
    sec.append(el('h2', null, 'Sort these first'));
    for (const f of first) {
      const row = el('label', 'sortrow');
      const box = el('input'); box.type = 'checkbox';
      const words = el('span');
      words.append(el('span', 'sortline', f.headline));
      if (f.detail) words.append(el('span', 'src', f.detail));
      row.append(box, words);
      sec.append(row);
    }
    root.append(sec);
  }

  // Where to stay, when the answer has a view on it. One area, the lines
  // behind it, the tradeoff, and the alternative if there is one.
  const stay = parsed?.stay;
  if (stay?.area) {
    const sec = el('section', 'planbox');
    sec.append(el('h2', null, 'Where to stay'));
    sec.append(el('div', 'boxhead', String(stay.area)));
    for (const line of (stay.lines ?? [])) {
      if (line) sec.append(el('p', 'boxline', String(line)));
    }
    if (stay.tradeoff) sec.append(el('p', 'src', String(stay.tradeoff)));
    if (stay.alternative?.area) {
      sec.append(el('p', 'src', `Or ${stay.alternative.area}.`));
    }
    root.append(sec);
  }

  // One thing worth knowing before the trip, with what it costs.
  const wk = parsed?.worth_knowing;
  if (wk?.line) {
    const sec = el('section', 'planbox');
    sec.append(el('h2', null, 'Worth knowing'));
    sec.append(el('p', 'boxline', String(wk.line)));
    if (wk.cost) sec.append(el('p', 'src', String(wk.cost)));
    root.append(sec);
  }

  // Getting there: the one thing to do at each arrival point.
  const arriving = (parsed?.getting_there ?? []).filter((x) => x?.thing);
  if (arriving.length) {
    const sec = el('section', 'planbox');
    sec.append(el('h2', null, 'Getting there'));
    for (const g of arriving) {
      const row = el('div', 'boxrow');
      const where = nameOf?.(g);
      if (where) row.append(el('span', 'boxhead', where));
      row.append(el('span', 'boxline', String(g.thing)));
      sec.append(row);
    }
    root.append(sec);
  }

  // What to book or buy before leaving.
  const setup = (parsed?.setup ?? []).filter((x) => x?.name);
  if (setup.length) {
    const sec = el('section', 'planbox');
    sec.append(el('h2', null, 'Sort before you go'));
    for (const x of setup) {
      const row = el('div', 'boxrow');
      row.append(el('span', 'boxhead', String(x.name)));
      if (x.for) row.append(el('span', 'src', String(x.for)));
      sec.append(row);
    }
    root.append(sec);
  }

  // What the plan leaves out, and what keeping it would have cost.
  const dropped = (parsed?.drop ?? []).filter((x) => x?.save_id);
  if (dropped.length) {
    const sec = el('section', 'planbox');
    sec.append(el('h2', null, 'Left out'));
    for (const x of dropped) {
      const row = el('div', 'boxrow');
      row.append(el('span', 'boxhead', nameOf?.({ place_id: x.save_id }) ?? String(x.save_id)));
      if (x.cost_of_keeping) row.append(el('span', 'src', String(x.cost_of_keeping)));
      sec.append(row);
    }
    root.append(sec);
  }

  root.append(el('h2', 'daysHead', 'Your days'));
  const strip = el('div', 'daystrip');
  let n = 0;
  for (const block of (parsed?.plan ?? [])) {
    for (const day of (block?.days ?? [])) {
      n += 1;
      const card = el('button', 'daycard');
      card.type = 'button';
      const words = el('div', 'daywords');
      words.append(el('div', 'eyebrow', day?.day ? String(day.day) : `Day ${n}`));
      // The heading already names one stop; listing it again underneath
      // reads as two of the same place (A-0246:
      // "Gandantegchinlen Monastery / Gandantegchinlen Monastery · …").
      const heading = dayHeading(block, day, nameOf);
      words.append(el('div', 'daytitle', heading));
      const stops = stopNames(day, nameOf).filter((n) => String(n) !== heading);
      if (stops.length) words.append(el('div', 'daystops', stops.join(' · ')));
      card.append(words);
      card.append(el('span', 'chev', '›'));
      const d = day, b = block;
      card.onclick = () => onDay(b, d);
      strip.append(card);
    }
  }
  root.append(strip);

  // Brian, 29 Sep: A-0237 and A-0238 both returned seven dishes and the plan
  // showed none of them. The name, the local name, and the one line on tap.
  const eats = (parsed?.worth_eating ?? []).filter((x) => x?.name);
  if (eats.length) {
    const sec = el('section', 'eats');
    sec.append(el('h2', null, 'Worth eating'));
    const strip2 = el('div', 'eatstrip');
    for (const dish of eats) {
      const card = el('button', 'eatcard');
      card.type = 'button';
      card.append(el('span', 'eatname', String(dish.name)));
      if (dish.local_name) card.append(el('span', 'eatlocal', String(dish.local_name)));
      // v2.6's `where`. Nothing at all when it is null or missing — an empty
      // grey tag under a dish reads as a place we failed to name.
      const whereText = String(dish.where ?? '').trim();
      if (whereText) card.append(el('span', 'eatwhere', whereText));
      const what = dish.what ? el('span', 'eatwhat', String(dish.what)) : null;
      if (what) {
        what.hidden = true;
        card.append(what);
        card.setAttribute('aria-expanded', 'false');
        card.onclick = () => {
          const open = what.hidden;
          what.hidden = !open;
          card.classList.toggle('open', open);
          card.setAttribute('aria-expanded', String(open));
        };
      } else {
        card.disabled = true;
      }
      strip2.append(card);
    }
    sec.append(strip2);
    root.append(sec);
  }

  // What Suna could not check. The schema has it, and hiding it is how a
  // plan reads more certain than it is.
  const unknowns = (parsed?.unknowns ?? []).filter(Boolean);
  const conflicts = (parsed?.conflicts ?? []).filter((c) => c?.topic);
  if (unknowns.length || conflicts.length) {
    const sec = el('section', 'planbox');
    sec.append(el('h2', null, "What I couldn't check"));
    for (const u of unknowns) sec.append(el('p', 'boxline', String(u)));
    for (const c of conflicts) {
      sec.append(el('p', 'boxline', `Sources disagree on ${c.topic}.`));
    }
    root.append(sec);
  }

  // A rough weekly spend, when the answer carries one.
  const b = parsed?.budget;
  if (Array.isArray(b?.per_week_local) && b.per_week_local.length === 2) {
    const [lo, hi] = b.per_week_local;
    const cur = b.currency_local ? ` ${b.currency_local}` : '';
    const sec = el('section', 'planbox');
    sec.append(el('h2', null, 'Rough budget'));
    sec.append(el('div', 'boxhead', `${lo}–${hi}${cur} a week`));
    if (b.excludes?.length) {
      sec.append(el('p', 'src', `Not counting ${b.excludes.join(', ')}.`));
    }
    root.append(sec);
  }

  return root;
}

/// §4. One day: its stops as small cards, each with Go / Not this / Save,
/// and the walk between them where code measured one.
export function planDayScreen(block, day, {
  nameOf, placeOf, onBack, onGo, onNotThis, onSave, legBetween,
}) {
  installDecisionsUI();
  const root = el('div', 'dx planday');

  const back = el('button', 'planback', `‹ ${block?.base ?? 'the plan'}`);
  back.type = 'button';
  back.onclick = onBack;
  root.append(back);

  // `day.type` says what kind of day it is; a day that isn't `out` reads as
  // a gap in the plan unless it's labelled. `unplanned_days` flags the gap,
  // so the tester should see the same thing the flag sees.
  const DAY_TYPE = { work: 'Working day', travel: 'Travel day', free: 'Free day' };
  const kind = DAY_TYPE[String(day?.type ?? '')] ?? null;
  const eyebrow = [String(day?.day ?? '').trim(), kind].filter(Boolean).join(' · ');
  if (eyebrow) root.append(el('div', 'eyebrow', eyebrow));
  root.append(el('h1', 'planhead', dayHeading(block, day, nameOf)));
  // Why these stops and this base. The model writes it per block and it was
  // going unread.
  if (block?.why) root.append(el('p', 'planctx', String(block.why)));

  const list = el('ol', 'stops');
  const items = day?.items ?? [];
  items.forEach((item, i) => {
    const place = placeOf(item) ?? {};
    const name = nameOf(item);
    const li = el('li', 'stop');
    if (item?.duration) li.append(el('div', 'eyebrow', String(item.duration)));
    li.append(el('h2', 'stopname', name ?? 'Somewhere'));
    if (item?.line) li.append(el('p', 'stopline', String(item.line)));

    const facts = el('div', 'facts');
    const closes = lastCloseOf(item?.hours ?? place.hours_today);
    if (closes) facts.append(withIcon('span', 'fact', 'clock', `Open till ${ampm(closes)}`));
    else if (item?.hours) facts.append(withIcon('span', 'fact', 'clock', String(item.hours)));
    if (facts.children.length) li.append(facts);

    const acts = el('div', 'actions');
    const go = withIcon('button', 'go', 'go', 'Go');
    go.type = 'button'; go.onclick = () => onGo(item, place);
    const not = el('button', 'btn', 'Not this');
    not.type = 'button'; not.onclick = () => onNotThis(item, place, day);
    const save = withIcon('button', 'btn', 'save', 'Save');
    save.type = 'button'; save.onclick = () => onSave(item, place);
    acts.append(go, not, save);
    li.append(acts);
    list.append(li);

    // The walk to the next stop, when code measured one.
    const leg = i < items.length - 1 ? legBetween?.(item, items[i + 1]) : null;
    if (leg) {
      const hop = el('li', 'leg');
      hop.append(withIcon('span', 'fact', 'walk', leg));
      list.append(hop);
    }
  });
  root.append(list);
  return root;
}

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

import { SUNA_DEFS, SUNA_CSS, SUNA_STATES, SUNA_FACE_STATE, sunaSvg } from './suna-faces.js?v=lab-v35';

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
  link.href = '/lab/decisions.css?v=lab-v35';
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
  const lines = el('div', 'sunalines');
  lines.append(el('div', 'sunaline', text ?? ''));
  lines.append(el('div', 'sunaline next'));
  wrap.append(fig, lines);
  return wrap;
}

/// A new line appears faded below the one on screen, then takes its place —
/// the canvas's two-line composition, and the reason the second line is only
/// ever a step that really ran.
function sayLine(node, text) {
  if (!text) return;
  const now = node.querySelector('.sunaline:not(.next)');
  const next = node.querySelector('.sunaline.next');
  if (!now || !next) return;
  if (!now.textContent.trim() || stillness()) {
    now.textContent = text; next.textContent = '';
    return;
  }
  if (now.textContent === text) return;
  clearTimeout(node._swap);
  next.textContent = text;
  node._swap = setTimeout(() => { now.textContent = text; next.textContent = ''; }, LINE_SWAP_MS);
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

/// §3. A greeting, a big box, three examples. No sentence builder.
export function askScreen({ greeting, onSend }) {
  installDecisionsUI();
  const root = el('div', 'dx');
  const ask = el('div', 'ask');
  ask.append(sunaBlock('idle', greeting, { hello: true }));

  const label = el('div', 'asklabel', "Tell Suna what you're up for");
  const box = el('textarea', 'askbox');
  box.placeholder = 'Got a few hours in Bukit Bintang…';
  box.setAttribute('aria-label', "Tell Suna what you're up for");

  const hint = el('div', 'asklabel', 'Stuck? Tap one');
  const examples = el('div', 'examples');
  for (const e of EXAMPLES) {
    const b = el('button', 'example', e);
    b.type = 'button';
    // §3: log whether the ask was typed or an example tap.
    b.onclick = () => { box.value = e; box.dataset.source = 'example'; box.focus(); };
    examples.append(b);
  }
  box.addEventListener('input', () => { if (box.dataset.source !== 'example' || !box.value) box.dataset.source = 'typed'; });

  const go = el('button', 'go', 'Go');
  go.type = 'button';
  go.onclick = () => {
    const text = box.value.trim();
    if (text) onSend(text, box.dataset.source === 'example' ? 'example' : 'typed');
  };

  ask.append(label, box, hint, examples, go);
  root.append(ask);
  return { root, box };
}

// ── Understood chips ───────────────────────────────────────────────────────

const CHIP_KEYS = [
  ['time', 'How long have you got?'],
  ['area', 'Where?'],
  ['who', "Who's coming?"],
];

/// §4. What Suna understood, tappable to fix, × to drop. Either one cancels
/// the running search and re-runs it with the change.
export function chipsBlock(parse, { onEdit, onRemove }) {
  const wrap = el('div', 'dx');
  wrap.append(el('div', 'chiphint', 'Suna understood · tap to fix, × to drop'));
  const row = el('div', 'chips');

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
  wrap.append(row);
  return wrap;
}

// ── The decision card ──────────────────────────────────────────────────────

/// §5. Walk, open till and price are CODE's, from Routes or distance,
/// weekly_hours at for_time, and the price level. The writer never writes
/// them, so they are read off the pick rather than out of its prose.
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
  const bits = [];
  const walk = walkText(pick);
  if (walk) bits.push(walk);
  // "Open till 14:30–00:00" is a range wearing the wrong label. The hours
  // string can hold several sessions; what the card face wants is the last
  // closing time of the day.
  const closes = lastCloseOf(pick.open_till);
  if (closes) bits.push(`Open till ${closes}`);
  else if (pick.open_till) bits.push(pick.open_till);
  else if (pick.open_now === false) bits.push('Closed now');
  // §2.1: "Show price on the card only when the place has a price level.
  // Otherwise leave it off; don't show a placeholder." A row of empty dollar
  // signs is a claim about a place nobody priced.
  const level = Number(pick.price_level);
  if (Number.isFinite(level) && level >= 1) bits.push('$'.repeat(Math.min(4, Math.round(level))));
  return bits;
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
  const details = el('button', 'linkish2', 'Details');
  details.type = 'button';
  details.onclick = onDetails;
  top.append(details);
  card.append(top);

  card.append(el('div', 'placename', pick.name ?? 'Somewhere'));
  if (pick.why) card.append(el('div', 'why', pick.why));

  const facts = el('div', 'facts');
  for (const f of factsLine(pick)) facts.append(el('span', null, f));
  if (facts.children.length) card.append(facts);

  const actions = el('div', 'actions');
  const go = el('button', 'go', 'Go');
  go.type = 'button'; go.onclick = onGo;
  const not = el('button', 'btn', 'Not this');
  not.type = 'button'; not.onclick = onNotThis;
  const save = el('button', 'btn', 'Save');
  save.type = 'button'; save.onclick = onSave;
  actions.append(go, not, save);
  card.append(actions);

  // §5 / GO-LIVE §3.5. "After that" is its own small card with its own Go —
  // it is a second place to walk to, not a footnote under the first.
  if (after?.name) {
    const a = el('div', 'after');
    const head = el('div', 'afterhead');
    head.append(el('div', 'eyebrow', 'After that'));
    if (after.maps_uri) {
      const go = el('button', 'linkish2', 'Go');
      go.type = 'button';
      go.onclick = () => onAfterGo?.(after);
      head.append(go);
    }
    a.append(head);
    a.append(el('div', 'aftername', after.name));
    if (after.line) a.append(el('div', null, after.line));
    // The walk to it, computed the same way as the pick's own.
    const travel = after.travel ?? walkText(after);
    if (travel) a.append(el('div', 'src', travel));
    card.append(a);
  }

  if (nudges?.length) {
    const row = el('div', 'nudges');
    for (const n of nudges) {
      const b = el('button', 'nudge', n);
      b.type = 'button';
      b.onclick = () => onNudge(n);
      row.append(b);
    }
    card.append(row);
  }

  const wy = el('div', 'wouldyou');
  wy.append(el('span', null, 'Would you go?'));
  for (const label of ['Yes', 'No']) {
    const b = el('button', 'btn', label);
    b.type = 'button';
    b.onclick = () => onWouldGo(label === 'Yes');
    wy.append(b);
  }
  card.append(wy);
  return card;
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
    s.append(el('h3', null, title));
  }
  const close = () => { scrim.remove(); s.remove(); onClose?.(); };
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
    const skip = el('button', 'btn', 'Skip, just show it');
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
export function reactionLine(reaction, savedText) {
  const wrap = el('div', 'dx reaction');
  wrap.append(sunaFigure(reaction?.face ?? 'pout', SUNA_REACT_H));
  const words = el('div', 'sunalines');
  words.append(el('div', 'sunaline', reaction?.text ?? ''));
  if (savedText) words.append(el('div', 'src', savedText));
  wrap.append(words);
  return wrap;
}

/// §5. Details behind one tap. Sources are printed by code.
export function detailsSheet(pick, { onWrong }) {
  return sheet(`Details for ${pick.name ?? 'this'}`, () => {
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
  });
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
    const reset = el('button', 'btn', 'Reset what Suna knows');
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

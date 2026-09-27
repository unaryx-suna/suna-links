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

import { SUNA_FACES, SUNA_CSS } from './suna-faces.js';

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
  link.href = '/lab/decisions.css';
  document.head.append(link);
  const st = document.createElement('style');
  st.textContent = SUNA_CSS;
  document.head.append(st);
}

// ── Suna ───────────────────────────────────────────────────────────────────

/// Her face and her line. She shrinks when a card lands (§2).
export function sunaBlock(face = 'idle', text = '', opts = {}) {
  const wrap = el('div', `suna${opts.small ? ' small' : ''}`);
  const holder = el('div');
  holder.innerHTML = SUNA_FACES[face] ?? SUNA_FACES.idle;
  wrap.append(holder);
  if (text) wrap.append(el('div', 'sunaline', text));
  return wrap;
}

export function updateSuna(node, face, text, small) {
  if (!node) return;
  const holder = node.firstElementChild;
  if (holder && SUNA_FACES[face]) holder.innerHTML = SUNA_FACES[face];
  let line = node.querySelector('.sunaline');
  if (!line) { line = el('div', 'sunaline'); node.append(line); }
  if (text) line.textContent = text;
  node.classList.toggle('small', !!small);
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
  ask.append(sunaBlock('idle', greeting));

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
function factsLine(pick) {
  const bits = [];
  if (pick.walk_minutes != null) bits.push(`${pick.walk_minutes} min walk`);
  else if (pick.km != null) bits.push(`${pick.km} km away`);
  // "Open till 14:30–00:00" is a range wearing the wrong label. The hours
  // string can hold several sessions; what the card face wants is the last
  // closing time of the day.
  const closes = lastCloseOf(pick.open_till);
  if (closes) bits.push(`Open till ${closes}`);
  else if (pick.open_till) bits.push(pick.open_till);
  else if (pick.open_now === false) bits.push('Closed now');
  if (pick.price_level) bits.push('·'.repeat(0) + '$'.repeat(Math.max(1, Number(pick.price_level))));
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
  onGo, onNotThis, onSave, onDetails, onNudge, onWouldGo, after, nudges,
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

  // §5. "After that": the next place, with its travel time from code.
  if (after?.name) {
    const a = el('div', 'after');
    a.append(el('div', 'eyebrow', 'After that'));
    a.append(el('div', null, after.name));
    if (after.travel) a.append(el('div', 'src', after.travel));
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

function sheet(title, build, onClose) {
  const scrim = el('div', 'scrim');
  const s = el('div', 'dx sheet');
  s.append(el('h3', null, title));
  s.append(build());
  const close = () => { scrim.remove(); s.remove(); onClose?.(); };
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
  return sheet(`What's off about ${placeName}?`, () => {
    const f = document.createDocumentFragment();
    f.append(el('div', 'src', 'One tap. Your next pick is already here.'));
    const row = el('div', 'reasons');
    for (const [key, label] of NOT_THIS_REASONS) {
      const b = el('button', 'reason', label);
      b.type = 'button';
      b.onclick = () => { onReason(key, label); document.querySelector('.dx.sheet')?.remove(); document.querySelector('.scrim')?.remove(); };
      row.append(b);
    }
    f.append(row);
    const skip = el('button', 'btn', 'Skip, just show it');
    skip.type = 'button';
    skip.onclick = () => { onSkip(); document.querySelector('.dx.sheet')?.remove(); document.querySelector('.scrim')?.remove(); };
    const undo = el('button', 'linkish2', 'Undo');
    undo.type = 'button';
    undo.onclick = () => { onUndo(); document.querySelector('.dx.sheet')?.remove(); document.querySelector('.scrim')?.remove(); };
    f.append(skip, undo);
    return f;
  });
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

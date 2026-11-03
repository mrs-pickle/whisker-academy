import { artFile } from '../core/art-file.js';
import { h } from '../core/dom.js';
import { heroText } from '../profile/hero.js';

export const COPILOT_TURN = Object.freeze({
  read: "Grown-up's turn: did she read it?",
  said: "Grown-up's turn: did she say it?",
});

export const COPILOT_HELP = 'Count it if she read the right word. Wait 5 seconds before helping.';

export const artUrl = (id) => `assets/art/${artFile(id)}`;

const picture = (id, className) => h('img', { class: className, src: artUrl(id), alt: '', draggable: 'false' });

function pop(el) {
  el.classList.remove('pop');
  void el.offsetWidth;
  el.classList.add('pop');
}

export function speakerButton({ onReplay }) {
  return h('button', { type: 'button', class: 'speaker-button', 'aria-label': 'Hear it again', onClick: () => onReplay?.() },
    picture('ui/speaker'));
}

export function pathStones({ total, done }) {
  const count = Math.max(0, Math.floor(total));
  const lit = Math.min(count, Math.max(0, Math.floor(done)));
  const stones = [];
  for (let i = 0; i < count; i++) stones.push(picture(i < lit ? 'ui/stone-on' : 'ui/stone-off', i < lit ? 'stone lit' : 'stone'));
  return h('div', { class: 'path-stones', role: 'img', 'aria-label': `${lit} of ${count} done`, style: { '--stones': String(Math.max(count, 1)) } }, stones);
}

export function lessonBar() {
  const label = h('span', { class: 'lesson-bar-label' });
  const bar = h('div', { class: 'lesson-bar', role: 'progressbar', 'aria-label': "How much of today's lesson is done", 'aria-valuemin': '0', 'aria-valuemax': '100' },
    h('div', { class: 'lesson-bar-fill' }), label);
  setLessonBar(bar, 0);
  return bar;
}

export function setLessonBar(bar, percent) {
  bar.setAttribute('aria-valuenow', String(percent));
  bar.style.setProperty('--done', `${percent}%`);
  (bar.querySelector('.lesson-bar-label')).textContent = `${percent}%`;
}

export function tile({ label, onPick, size = 120 }) {
  const face = Math.max(110, size);
  const font = Math.min(130, Math.max(96, Math.round(face * 0.8)));
  return h('button', { type: 'button', class: 'tile', 'data-label': label, style: { '--tile': `${face}px`, '--tile-font': `${font}px` },
    onClick: () => onPick?.(label) }, h('span', { class: 'tile-label' }, label));
}

export function soundBoxes({ count, filled, glow }) {
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const grapheme = filled?.[i] ?? null;
    boxes.push(h('div', { class: ['sound-box', grapheme === null && 'empty', i === glow && 'glow'], 'data-index': i },
      grapheme === null ? null : h('span', { class: 'sound-box-label' }, grapheme)));
  }
  return h('div', { class: ['sound-boxes', count > 4 && 'many'] }, boxes);
}

export function takeBackButton({ onBack }) {
  const button = (h('button', { type: 'button', class: 'take-back', 'aria-label': 'Take back a letter',
    onClick: () => { if (button.disabled) return; pop(button); onBack?.(); } }, h('span', { class: 'take-back-mark', 'aria-hidden': 'true' }, '⌫')));
  return button;
}

export function keysOnPage(control, onKey) {
  const doc = globalThis.document;
  let seen = control.isConnected;
  const here = () => {
    if (control.isConnected) seen = true;
    else if (seen) stop();
    return control.isConnected;
  };
  const listener = (event) => { if (here() && !control.closest?.('[data-keys-held]')) onKey(event); };
  const page = new globalThis.MutationObserver(here);
  const stop = () => {
    page.disconnect();
    doc.removeEventListener('keydown', listener);
  };
  doc.addEventListener('keydown', listener);
  page.observe(doc.body, { childList: true, subtree: true });
  return stop;
}

export function nextButton({ onNext }) {
  let pressed = false;
  const button = (h('button', { type: 'button', class: 'next-button', 'aria-keyshortcuts': 'Enter ArrowRight',
    onClick: () => {
      if (pressed) return;
      pressed = true;
      onNext?.();
    } }, h('span', { class: 'next-label' }, 'Next'), h('span', { class: 'next-arrow', 'aria-hidden': 'true' })));
  keysOnPage(button, (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key !== 'Enter' && event.key !== 'ArrowRight') return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'Enter' && target?.closest?.('button, a')) return;
    event.preventDefault();
    button.click();
  });
  return button;
}

export function passButton({ onPass }) {
  return h('button', { type: 'button', class: 'pass-button', onClick: ( event) => onPass?.(event) },
    h('span', { class: 'pass-mark', 'aria-hidden': 'true' }, '→'), h('span', {}, 'Pass'));
}

export function pawButton({ onTap }) {
  const button = (h('button', { type: 'button', class: 'paw-button', 'aria-label': 'Tap for each sound',
    onClick: () => { if (button.disabled) return; pop(button); onTap?.(); } }, picture('ui/paw')));
  return button;
}

let bannerCount = 0;

export function copilotBanner({ onYes, onAgain, onHelp, onUndo, onPass, helpText = COPILOT_HELP, kind = 'read', hero = 'princess' }) {
  const hx = (text) => heroText(text, hero);
  const help = h('p', { class: 'copilot-help', id: `copilot-help-${++bannerCount}`, hidden: true }, hx(helpText));
  const rule = h('button', { type: 'button', class: 'copilot-rule', 'aria-label': 'How to judge', 'aria-expanded': 'false', 'aria-controls': help.id,
    onClick: () => { help.hidden = !help.hidden; rule.setAttribute('aria-expanded', String(!help.hidden)); } }, '?');
  const keys = {};
  const choice = (key, kind, mark, label, fn) => {
    const button = h('button', { type: 'button', class: ['copilot-choice', kind], 'aria-keyshortcuts': key, onClick: ( event) => { pop(button); fn?.(event); } },
      h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, mark), h('span', {}, label), h('kbd', { 'aria-hidden': 'true' }, key));
    keys[key] = button;
    return button;
  };
  const undo = onUndo
    ? h('button', { type: 'button', class: 'copilot-undo', hidden: true, 'aria-label': 'Undo the last tap', onClick: () => { pop(undo); onUndo(); } },
      h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, '↶'), h('span', {}, 'Undo'))
    : null;
  const banner = h('div', { class: 'copilot-banner', role: 'group', 'aria-label': "Grown-up's turn" },
    h('p', { class: 'copilot-title' }, hx(COPILOT_TURN[kind] ?? COPILOT_TURN.read)),
    h('div', { class: 'copilot-tips' }),
    undo,
    rule,
    h('div', { class: 'copilot-choices' },
      choice('1', 'yes', '✓', 'Yes', onYes),
      choice('2', 'again', '↻', 'Try again', onAgain),
      choice('3', 'help', '🔊', 'Help', onHelp),
      onPass ? choice('4', 'pass', '→', 'Pass', onPass) : null),
    help);

  keysOnPage(banner, (event) => {
    if (banner.hidden || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const button = keys[event.key];
    if (!button) return;
    event.preventDefault();
    button.click();
  });
  return banner;
}

export function setUndo(banner, on) {
  const undo = (banner.querySelector('.copilot-undo'));
  if (undo) undo.hidden = !on;
}

export const PENCIL_TURN = Object.freeze({
  letter: Object.freeze({ title: 'Grown-up: watch the first stroke.', yes: 'Started in the right place, went the right way', again: 'Watch it again' }),
  write: Object.freeze({ title: 'Grown-up: is it on the paper?', yes: 'Done', again: 'Hear it again' }),
});

export function pencilBanner({ kind, onYes, onAgain, onSkip, hero = 'princess' }) {
  const words = PENCIL_TURN[kind];
  const keys = {};
  const choice = (key, cls, mark, label, fn) => {
    const button = h('button', { type: 'button', class: ['copilot-choice', cls], 'aria-keyshortcuts': key, onClick: ( event) => {
      if ((event?.detail ?? 0) >= 2) return;
      pop(button);
      fn();
    } }, h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, mark), h('span', {}, label));
    keys[key] = button;
    return button;
  };
  const banner = h('div', { class: 'copilot-banner pencil-banner', role: 'group', 'aria-label': "Grown-up's turn" },
    h('p', { class: 'copilot-title' }, heroText(words.title, hero)),
    h('div', { class: 'copilot-tips' }),
    h('div', { class: 'copilot-choices' },
      choice('1', 'yes', '✓', words.yes, onYes),
      choice('2', 'again', '↻', words.again, onAgain),
      choice('3', 'skip', '→', 'Skip today', onSkip)));
  keysOnPage(banner, (event) => {
    if (banner.hidden || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    const button = keys[event.key];
    if (!button) return;
    event.preventDefault();
    button.click();
  });
  return banner;
}

export const COPILOT_HOLD = 'Grown-up: Continue, or Undo your last tap.';

export function copilotHold({ onGo, onUndo }) {
  const choice = (kind, mark, label, fn, key) => {
    const button = h('button', { type: 'button', class: ['copilot-choice', kind], ...(key ? { 'aria-keyshortcuts': `${key} Enter` } : {}), onClick: ( event) => {
      if (event.detail >= 2) return;
      pop(button);
      fn();
    } },
      h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, mark), h('span', {}, label), key ? h('kbd', { 'aria-hidden': 'true' }, key) : null);
    return button;
  };
  const go = choice('go', '▶', 'Continue', onGo, '1');
  const hold = h('div', { class: 'copilot-banner copilot-hold', role: 'group', 'aria-label': "Grown-up's turn" },
    h('p', { class: 'copilot-title' }, COPILOT_HOLD),
    h('div', { class: 'copilot-choices' }, go, choice('back', '↶', 'Undo', onUndo)));
  keysOnPage(hold, (event) => {
    if (hold.hidden || event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'Enter' && target?.closest?.('button, a')) return;
    if (event.key !== '1' && event.key !== 'Enter') return;
    event.preventDefault();
    go.click();
  });
  return hold;
}

export function copilotUndoAside({ onUndo }) {
  const button = (h('button', { type: 'button', class: 'copilot-undo', 'aria-label': 'Undo the last tap',
    onClick: () => { pop(button); onUndo(); } },
  h('span', { class: 'copilot-mark', 'aria-hidden': 'true' }, '↶'), h('span', {}, 'Undo')));
  const aside = (h('div', { class: 'copilot-aside', role: 'group', 'aria-label': "Grown-up's Undo" },
    h('span', { class: 'copilot-aside-label' }, 'Grown-up:'), button));
  return aside;
}

export function fullscreenButton() {
  const button = h('button', { type: 'button', class: 'fullscreen-button', 'aria-label': 'Full screen', onClick: () => {
    const doc = button.ownerDocument;
    const request = doc.fullscreenElement ? doc.exitFullscreen?.() : doc.documentElement.requestFullscreen?.();
    request?.catch?.(() => {});
  } });
  return button;
}

export function kittenBubble({ lineId, text }) {
  return h('div', { class: 'kitten-bubble', 'data-line': lineId },
    text ? h('span', { class: 'kitten-bubble-text' }, text)
      : h('span', { class: 'kitten-bubble-dots', 'aria-hidden': 'true' }, h('span'), h('span'), h('span')));
}

export function layeredArt(ids, className) {
  return h('div', { class: ['art-layers', className], 'aria-hidden': 'true' }, ids.map(id => picture(id)));
}

export const HOLD_MS = 3000;

export function holdToActivate(button, onHeld, ms = HOLD_MS) {
  let timer;
  button.style.setProperty('--hold-ms', `${ms}ms`);
  const start = () => {
    if (timer !== undefined) return;
    button.classList.add('holding');
    timer = setTimeout(() => { timer = undefined; button.classList.remove('holding'); onHeld(); }, ms);
  };
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    button.classList.remove('holding');
  };
  button.addEventListener('pointerdown', ( event) => {
    if (event.button !== 0) return;
    button.setPointerCapture?.(event.pointerId);
    start();
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(type, cancel);
  button.addEventListener('keydown', ( event) => {
    if (event.key !== ' ' && event.key !== 'Enter') return;
    event.preventDefault();
    if (!event.repeat) start();
  });
  button.addEventListener('keyup', ( event) => { if (event.key === ' ' || event.key === 'Enter') cancel(); });
  return { cancel };
}

export function bigButton({ label, icon, glyph, onClick }) {
  return h('button', { type: 'button', class: 'big-button', onClick: ( event) => onClick?.(event) },
    icon ? picture(icon, 'big-button-icon') : glyph ? h('span', { class: 'big-button-glyph', 'aria-hidden': 'true' }, glyph) : null,
    h('span', { class: 'big-button-label' }, label));
}

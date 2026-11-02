import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { artUrl, bigButton, holdToActivate } from '../../ui/components.js';

export const SCREENS = Object.freeze([
  ['settings', 'Settings'],
  ['deck', 'Sound cards'],
  ['instant', 'Instant words'],
  ['progress', 'Progress'],
  ['quest-results', 'Quest results'],
  ['passes', 'Passes'],
  ['pages', 'Coloring pages'],
  ['soundcheck', 'Sound check'],
  ['backup', 'Backup'],
  ['tips', 'Co-pilot tips'],
  ['about', 'About'],
].map((entry) => Object.freeze(entry)));

const PIN = /^\d{4,8}$/;

export async function hashPin(pin) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(String(pin)));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function checkPin(pin, hash) {
  if (typeof hash !== 'string' || hash === '') return false;
  return (await hashPin(pin)) === hash;
}

export const isValidPin = (pin) => typeof pin === 'string' && PIN.test(pin);

export const isUnlocked = (params) => params?.unlocked === true;

export const nextScreen = (next) => (SCREENS.some(([name]) => name === next) ? (next) : 'settings');

export function unsavedBanner(ctx) {
  if (ctx.store?.persistent === false) {
    return h('p', { class: 'gu-warning', role: 'status' },
      h('strong', {}, "Progress can't be saved in this browser window."),
      ' Use Backup to keep a copy before you close it.');
  }
  if (ctx.saveFailed !== true) return null;
  return h('p', { class: 'gu-warning', role: 'status' },
    h('strong', {}, "The last save didn't work."),
    ' Use Backup to keep a copy of her progress, then reload the page.');
}

export function cornerFrame(el, ctx, params, screen) {
  if (!isUnlocked(params)) {
    ctx.router.go('grownup/gate', { next: screen }).catch(( err) => console.error('The grown-up gate could not open', err));
    return null;
  }
  const lock = createLock();
  const go = (name, p) => {
    lock.run(() => ctx.router.go(name, p)).catch((err) => console.warn(`The grown-up corner could not open "${name}"`, err));
  };
  const title = SCREENS.find(([name]) => name === screen)?.[1] ?? '';
  const body = h('div', { class: 'gu-body' });
  el.append(h('div', { class: 'grownup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/grownup'), alt: '' }),
    h('header', { class: 'gu-header' },
      h('p', { class: 'gu-corner-title' }, 'Grown-up corner'),
      h('button', { type: 'button', class: 'gu-button gu-leave', onClick: () => go('hub') }, 'Back to the castle')),
    h('nav', { class: 'gu-nav', 'aria-label': 'Grown-up corner' },
      SCREENS.map(([name, label]) => h('button', {
        type: 'button', class: 'gu-tab', 'aria-current': name === screen ? 'page' : null,
        onClick: () => { if (name !== screen) go(`grownup/${name}`, { unlocked: true }); },
      }, label))),
    h('main', { class: 'gu-main' }, unsavedBanner(ctx), h('h1', { class: 'gu-title' }, title), body)));
  return body;
}

export function mount(el, ctx, params = {}) {
  if (typeof ctx.settings.pin !== 'string') {
    ctx.router.go('grownup/setup').catch(( err) => console.error('First-run setup could not open', err));
    return () => {};
  }
  const lock = createLock();
  const target = `grownup/${nextScreen(params.next)}`;
  const enter = (how) => {
    ctx.cornerEntry = how;
    lock.run(() => ctx.router.go(target, { unlocked: true })).catch((err) => console.warn('The grown-up corner could not open', err));
  };
  const leave = () => {
    lock.run(() => ctx.router.go('hub')).catch((err) => console.warn('The hub could not open', err));
  };

  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const input = (h('input', {
    type: 'password', class: 'gu-input gu-pin', inputmode: 'numeric', autocomplete: 'off', maxlength: '8', id: 'gu-gate-pin',
  }));
  const form = h('form', { class: 'gu-gate-form', onSubmit: ( event) => {
    event.preventDefault();
    lock.run(async () => {
      if (input.value === '') {
        message.textContent = 'Type the PIN first.';
        input.focus();
        return;
      }
      if (await checkPin(input.value, ctx.settings.pin)) { ctx.cornerEntry = 'pin'; await ctx.router.go(target, { unlocked: true }); return; }
      input.value = '';
      message.textContent = "That PIN doesn't match. Try again, or hold the button below for 3 seconds.";
      input.focus();
    }).catch((err) => console.error('The grown-up corner could not open', err));
  } },
  h('label', { class: 'gu-label', for: 'gu-gate-pin' }, 'PIN'),
  h('div', { class: 'gu-row' }, input, h('button', { type: 'submit', class: 'gu-button gu-primary' }, 'Open')));

  const hold = h('button', { type: 'button', class: 'gu-button gu-hold' },
    h('span', { class: 'gu-hold-fill', 'aria-hidden': 'true' }),
    h('span', { class: 'gu-hold-label' }, 'Hold for 3 seconds'));
  const holding = holdToActivate(hold, () => enter('hold'));

  el.append(h('div', { class: 'grownup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/grownup'), alt: '' }),
    h('div', { class: 'gu-card gu-gate' },
      unsavedBanner(ctx),
      h('h1', { class: 'gu-title' }, 'Grown-ups only'),
      h('p', {}, 'Type your PIN to open the grown-up corner.'),
      form,
      message,
      h('p', { class: 'gu-or' }, 'or'),
      hold,
      h('div', { class: 'gu-back' }, bigButton({ label: 'Back to the castle', icon: 'ui/door-button', onClick: leave })))));
  input.focus();
  return () => { holding.cancel(); };
}

import { h } from '../core/dom.js';
import { artUrl, layeredArt } from '../ui/components.js';
import { castArt } from '../ui/story-stage.js';
import { dressUpButton } from './dressup.js';

export const BREAK_STYLES = Object.freeze(['ballet', 'jumps', 'swim']);
const MOVES = 4;

const START_MS = 4000;
const MOVE_MS = 9000;
const DONE_MS = 3000;
const CUDDLE_MS = 9000;
const HEART_EVERY_MS = 1100;
const HEART_MS = 2400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const breakStyle = (style) => (typeof style === 'string' && BREAK_STYLES.includes(style) ? style : 'ballet');

export function breakLines(style) {
  const s = breakStyle(style);
  return ['break.start', ...Array.from({ length: MOVES }, (_, i) => `break.${s}.${i + 1}`), 'break.done'];
}


function breakView(el, ctx, className, dressUp) {
  let skip = () => {};
  const skipped = new Promise((resolve) => { skip = () => resolve(undefined); });
  let over = false;
  let exit;
  const end = () => {
    over = true;
    ctx.audio.stop();
    skip();
  };
  const kitten = layeredArt(castArt('kitten', ctx.profile?.look, 'sit'), 'break-kitten');
  const skipButton = h('button', { type: 'button', class: 'break-skip', 'aria-label': 'Skip the break', onClick: end }, 'Skip');
  const root = h('div', { class: ['break', className] },
    h('img', { class: 'scene-bg', src: artUrl('bg/hub'), alt: '' }), kitten, skipButton,
    dressUp ? h('div', { class: 'break-dressup' }, dressUpButton(ctx.profile?.look, () => {
      if (over) return;
      exit = 'dressup';
      end();
    })) : null);
  el.append(root);
  const live = () => !over && root.isConnected;
  return {
    root,
    kitten,
    live,
    exit: () => exit,
    async step(lineId, ms) {
      if (!live()) return false;
      await Promise.race([Promise.all([ctx.say(lineId), wait(ms)]), skipped]);
      return live();
    },
    pose(pose) {
      const [body] = castArt('kitten', ctx.profile?.look, pose);
      const img = kitten.querySelector('img');
      if (img) img.setAttribute('src', artUrl(body));
    },
    destroy() {
      over = true;
      if (!root.isConnected) return;
      ctx.setReplay?.(null);
      root.remove();
    },
  };
}

export async function runBreak(el, ctx, { style, dressUp = false } = {}) {
  const s = breakStyle(style);
  const view = breakView(el, ctx, `break-${s}`, dressUp);
  const [start, ...rest] = breakLines(s);
  const done = (rest.pop());
  const moves = async () => {
    if (!(await view.step(start, START_MS))) return;
    view.pose('cheer');
    for (const [i, line] of rest.entries()) {
      view.kitten.setAttribute('data-move', String(i + 1));
      if (!(await view.step(line, MOVE_MS))) return;
    }
    view.kitten.removeAttribute('data-move');
    view.pose('sit');
    await view.step(done, DONE_MS);
  };
  try {
    await moves();
  } finally {
    view.destroy();
  }
  return view.exit();
}

export async function runCuddle(el, ctx, { dressUp = false } = {}) {
  const view = breakView(el, ctx, 'cuddle', dressUp);
  const heart = () => {
    if (!view.live()) return;
    const img = h('img', { class: 'cuddle-heart', src: artUrl('ui/heart-paw'), alt: '', draggable: 'false',
      style: { left: `${560 + ctx.rng.int(160)}px` } });
    view.root.append(img);
    setTimeout(() => img.remove(), HEART_MS);
  };
  const pet = h('button', { type: 'button', class: 'cuddle-pet', 'aria-label': 'Cuddle Kitty', onClick: heart });
  view.root.append(pet);
  const hearts = setInterval(heart, HEART_EVERY_MS);
  try {
    await view.step('break.cuddle', CUDDLE_MS);
  } finally {
    clearInterval(hearts);
    view.destroy();
  }
  return view.exit();
}

export function mount(el, ctx, params = {}) {
  const played = params.kind === 'cuddle' ? runCuddle(el, ctx) : runBreak(el, ctx, { style: params.style ?? ctx.settings.breakStyle });
  played.then(() => (el.isConnected ? ctx.router.go('hub') : undefined))
    .catch((err) => console.error('The break preview stopped', err));
  return () => {};
}

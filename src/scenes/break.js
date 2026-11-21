import { h } from '../core/dom.js';
import { MIX_IT_UP } from '../profile/settings.js';
import { artUrl, bigButton, layeredArt } from '../ui/components.js';
import { castArt } from '../ui/story-stage.js';
import { dressUpButton } from './dressup.js';

export const BREAK_STYLES = Object.freeze(['ballet', 'jumps', 'swim', 'stretch', 'parade']);
const OWN_START = Object.freeze(['stretch', 'parade']);
const MOVES = 4;

const START_MS = 4000;
const MOVE_MS = 9000;
const DONE_MS = 3000;
const CUDDLE_MS = 9000;
const MINUTE_MS = 60000;
export const CONFIDENCE_LINES = Object.freeze(['confidence.1', 'confidence.2', 'confidence.3']);
export const CONFIDENCE_MAX = 1;

export function confidenceBudget(rng, max = CONFIDENCE_MAX) {
  let next;
  let used = 0;
  return () => {
    if (used >= max) return null;
    used++;
    next ??= rng.int(CONFIDENCE_LINES.length);
    return `v.${CONFIDENCE_LINES[next++ % CONFIDENCE_LINES.length]}`;
  };
}

export const CALM_CHOICES = Object.freeze([
  ['now', 'Start now'],
  ['minute', 'Take a minute'],
  ['ready', "I'll tell you when I'm ready"],
]);

const HEART_EVERY_MS = 1100;
const HEART_MS = 2400;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const breakStyle = (style) => (typeof style === 'string' && BREAK_STYLES.includes(style) ? style : 'ballet');

export function breakLines(style) {
  const s = breakStyle(style);
  const start = OWN_START.includes(s) ? `break.${s}.start` : 'break.start';
  return [start, ...Array.from({ length: MOVES }, (_, i) => `break.${s}.${i + 1}`), 'break.done'];
}

export function nextInMix(played, rng) {
  const cycle = (Array.isArray(played) ? played : []).filter((s, i, all) => BREAK_STYLES.includes(s) && all.indexOf(s) === i);
  const left = BREAK_STYLES.filter((s) => !cycle.includes(s));
  if (left.length > 0) { const style = rng.pick(left); return { style, played: [...cycle, style] }; }
  const style = rng.pick(BREAK_STYLES.filter((s) => s !== cycle.at(-1)));
  return { style, played: [style] };
}

export function nextBreak(ctx) {
  if (ctx.settings.breakStyle !== MIX_IT_UP) return ctx.settings.breakStyle;
  const { style, played } = nextInMix(ctx.profile.breaks, ctx.rng);
  ctx.profile = { ...ctx.profile, breaks: played };
  return style;
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
      await Promise.race([Promise.all([lineId ? ctx.say(lineId) : null, wait(ms)]), skipped]);
      return live();
    },
    async until(promise) {
      if (!live()) return undefined;
      const got = await Promise.race([promise, skipped.then(() => undefined)]);
      return live() ? got : undefined;
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
    if (await view.step('break.cuddle', CUDDLE_MS)) await calmChoice(view, ctx);
  } finally {
    clearInterval(hearts);
    view.destroy();
  }
  return view.exit();
}

async function calmChoice(view, ctx) {
  let choose = () => {};
  const chosen = new Promise((resolve) => { choose = resolve; });
  const row = h('div', { class: 'calm-choices' }, CALM_CHOICES.map(([id, label]) =>
    h('button', { type: 'button', class: 'calm-choice', 'data-choice': id, onClick: () => choose(id) }, label)));
  view.root.append(row);
  ctx.say('break.choice');
  const choice = await view.until(chosen);
  row.remove();
  if (choice === undefined) return;
  ctx.audio.stop();
  if (choice === 'minute') {
    if (!(await view.step(null, MINUTE_MS))) return;
  } else if (choice === 'ready') {
    let ready = () => {};
    const tapped = new Promise((resolve) => { ready = () => resolve(true); });
    const paw = h('div', { class: 'calm-ready' }, bigButton({ label: "I'm ready", icon: 'ui/paw', onClick: () => ready() }));
    view.root.append(paw);
    ctx.say('break.ready');
    const was = await view.until(tapped);
    paw.remove();
    if (was === undefined) return;
    ctx.audio.stop();
  }
  const line = CONFIDENCE_LINES[ctx.rng.int(CONFIDENCE_LINES.length)];
  view.pose('cheer');
  await view.step(line, 2500);
}

export function mount(el, ctx, params = {}) {
  const played = params.kind === 'cuddle' ? runCuddle(el, ctx) : runBreak(el, ctx, { style: params.style ?? nextBreak(ctx) });
  played.then(() => (el.isConnected ? ctx.router.go('hub') : undefined))
    .catch((err) => console.error('The break preview stopped', err));
  return () => {};
}

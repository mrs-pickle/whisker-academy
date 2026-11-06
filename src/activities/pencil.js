import { h } from '../core/dom.js';
import { LETTER_SECURE_BOX } from '../engine/session-builder.js';
import { heroOf } from '../profile/hero.js';
import { pencilBanner } from '../ui/components.js';
import { offerTips, PENCIL_TIPS } from '../ui/tips.js';
import { cardSoundClips, createActivityView, listenDisc, now, wait } from './cards.js';


export const STEP_MS = 900;
const INK_MS = 250;
const RULES = Object.freeze([['top', 40], ['middle', 200], ['base', 360]]);
const OTHER_START_GAP = 75;
const BLANK_BOX = Object.freeze({ w: 480, h: 480 });
export const WRITES = 3;
const SLOT_ROOM = 80;
const SLOT_MIN = 280;
export const DICTATE_BOX = Object.freeze({ w: 1120, h: 480 });
const INK_STEP = 2;
const SVG_NS = 'http://www.w3.org/2000/svg';

export function padLayout(letter) {
  if (!letter) return { w: DICTATE_BOX.w, h: DICTATE_BOX.h, slots: [{ x: 0, w: DICTATE_BOX.w, dx: 0 }] };
  const { w, h: tall } = letter.box;
  const slot = Math.max(SLOT_MIN, w + SLOT_ROOM);
  const slots = Array.from({ length: WRITES }, (_, i) => ({ x: i * slot, w: slot, dx: i * slot + (slot - w) / 2 }));
  return { w: slot * WRITES, h: tall, slots };
}

export function padPoint({ clientX, clientY }, rect, box) {
  const scale = Math.min(rect.width / box.w, rect.height / box.h) || 1;
  const left = rect.left + (rect.width - box.w * scale) / 2;
  const top = rect.top + (rect.height - box.h * scale) / 2;
  const clamp = ( v, max) => Math.min(max, Math.max(0, v));
  const round = ( v) => Math.round(v * 10) / 10;
  return [round(clamp((clientX - left) / scale, box.w)), round(clamp((clientY - top) / scale, box.h))];
}

export function addPoint(points, p) {
  const last = points.at(-1);
  if (last && Math.hypot(p[0] - last[0], p[1] - last[1]) < INK_STEP) return false;
  points.push(p);
  return true;
}

export function inkPath(points) {
  if (points.length === 0) return '';
  const n = ( v) => String(Math.round(v * 10) / 10);
  const [x0, y0] = points[0];
  if (points.length === 1) return `M${n(x0)} ${n(y0)} L${n(x0 + 0.1)} ${n(y0)}`;
  let d = `M${n(x0)} ${n(y0)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i];
    const [nx, ny] = points[i + 1];
    d += ` Q${n(x)} ${n(y)} ${n((x + nx) / 2)} ${n((y + ny) / 2)}`;
  }
  const [xl, yl] = points.at(-1) ?? points[0];
  return `${d} L${n(xl)} ${n(yl)}`;
}

export function writingPad(letter, { trace = false } = {}) {
  const box = padLayout(letter);
  const strokes = (letter?.strokes ?? []).map(s => `<path d="${s.d}"/>`).join('');
  const rules = RULES.map(([name, y]) => `<line class="pencil-rule ${name}" x1="0" x2="${box.w}" y1="${y}" y2="${y}"/>`).join('');
  const faint = trace && letter ? box.slots.map(s => `<g class="pencil-faint" transform="translate(${s.dx} 0)">${strokes}</g>`).join('') : '';
  const markup = `<svg xmlns="${SVG_NS}" viewBox="0 0 ${box.w} ${box.h}" aria-hidden="true"><g class="pencil-rules">${rules}</g>${faint}<g class="pencil-ink"></g></svg>`;
  const parsed = new globalThis.DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = (document.importNode(parsed.documentElement, true));
  svg.classList.add('pencil-svg');
  const ink = (svg.querySelector('.pencil-ink'));
  const pad = h('div', { class: ['pencil-pad', letter ? null : 'wide'], style: { '--w': String(box.w), '--h': String(box.h) } }, svg);
  let stroke = null;
  let count = 0;
  const at = (event) => padPoint(event, (stroke).rect, box);
  pad.addEventListener('pointerdown', ( event) => {
    if (stroke || (event.pointerType === 'mouse' && event.button !== 0)) return;
    event.preventDefault?.();
    pad.setPointerCapture?.(event.pointerId);
    const r = pad.getBoundingClientRect?.() ?? { left: 0, top: 0, width: box.w, height: box.h };
    const path = (document.createElementNS(SVG_NS, 'path'));
    stroke = { id: event.pointerId, points: [], path, rect: { left: r.left, top: r.top, width: r.width, height: r.height } };
    addPoint(stroke.points, at(event));
    path.setAttribute('d', inkPath(stroke.points));
    ink.append(path);
    count++;
  });
  pad.addEventListener('pointermove', ( event) => {
    if (!stroke || event.pointerId !== stroke.id) return;
    event.preventDefault?.();
    const events = event.getCoalescedEvents?.() ?? [];
    let added = false;
    for (const e of events.length > 0 ? events : [event]) added = addPoint(stroke.points, at(e)) || added;
    if (added) stroke.path.setAttribute('d', inkPath(stroke.points));
  });
  const lift = (event) => {
    if (!stroke || event.pointerId !== stroke.id) return;
    stroke = null;
  };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) pad.addEventListener(type, lift);
  const clear = () => { stroke = null; count = 0; ink.replaceChildren(); };
  const eraser = h('button', { type: 'button', class: 'pencil-clear', 'aria-label': 'Wipe it clean', onClick: clear },
    h('span', { class: 'pencil-clear-art', 'aria-hidden': 'true' }));
  const el = h('div', { class: 'pencil-pad-row' }, pad, eraser);
  return { el, pad, clear, strokes: () => count, box };
}

function showPad(view, ...nodes) {
  view.root.classList.add('pencil-writing');
  view.show(...nodes);
}

export function stageOf(states, id) {
  const box = states?.get(`lf:${id}#paper`)?.box;
  if (box === undefined || box <= 0) return 'new';
  return box >= LETTER_SECURE_BOX ? 'secure' : 'next';
}

export const startLine = (letter) => (letter.id === 'e' ? 'v.pencil.start-middle' : 'v.pencil.start');

export function startChoices(letter) {
  const dots = letter.strokes.flatMap(s => s.dots);
  const [start] = dots;
  const gap = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  const far = dots.filter(d => gap(d, start) >= OTHER_START_GAP);
  const last = far.at(-1);
  const others = last ? far.filter(d => gap(d, last) >= OTHER_START_GAP) : [];
  const third = others.sort((a, b) => Math.min(gap(b, start), gap(b, (last))) - Math.min(gap(a, start), gap(a, (last))))[0];
  return ([start, last, third].filter(d => d !== undefined));
}

function letterBoard(letter) {
  const { w, h: tall } = letter?.box ?? BLANK_BOX;
  const strokes = (letter?.strokes ?? []).map(s => `<path d="${s.d}" pathLength="1"/>`).join('');
  const rules = RULES.map(([name, y]) => `<line class="pencil-rule ${name}" x1="0" x2="${w}" y1="${y}" y2="${y}"/>`).join('');
  const markup = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${tall}" aria-hidden="true"><g class="pencil-rules">${rules}</g>`
    + `<g class="pencil-ghost">${strokes}</g><g class="pencil-model">${strokes}</g><g class="pencil-trace">${strokes}</g></svg>`;
  const parsed = new globalThis.DOMParser().parseFromString(markup, 'image/svg+xml');
  const svg = (document.importNode(parsed.documentElement, true));
  svg.classList.add('pencil-svg');
  const dots = h('div', { class: 'pencil-dots' });
  const el = h('div', { class: 'pencil-board', style: { '--w': String(w), '--h': String(tall) } }, svg, dots);
  const paths = (layer) => [...svg.querySelectorAll('path')].filter(p => p.parentNode === svg.querySelector(`.pencil-${layer}`));
  const layers = { model: paths('model'), trace: paths('trace') };
  const set = (path, left, ms) => {
    path.style.setProperty('transition', ms > 0 ? `stroke-dashoffset ${ms}ms linear` : 'none');
    path.style.setProperty('stroke-dashoffset', String(left));
  };
  const showing = (mode) => el.setAttribute('data-show', mode);
  for (const p of [...layers.model, ...layers.trace]) set(p, 1, 0);
  showing('rules');
  return {
    el,
    dots,
    showing,
    clearModel() { for (const p of layers.model) set(p, 1, 0); },
    async drawModel( i, ms) {
      const p = layers.model[i];
      if (!p) return;
      set(p, 1, 0);
      svg.getBoundingClientRect?.();
      await wait(20);
      set(p, 0, ms);
    },
    fullModel() { for (const p of layers.model) set(p, 0, 0); },
    ink( i, done) { if (layers.trace[i]) set(layers.trace[i], 1 - done, INK_MS); },
  };
}


async function playModel(view, board, letter) {
  board.clearModel();
  board.showing('model');
  await view.say([startLine(letter)]);
  for (const [i, step] of letter.strokes.entries()) {
    if (!view.live()) return;
    if (step.lift) await view.say(['v.pencil.lift']);
    await Promise.all([board.drawModel(i, STEP_MS), view.say([step.say], STEP_MS)]);
  }
  if (view.live()) await view.say(letter.sounds, 300);
}

function clickTrace(view, board, letter) {
  return new Promise((resolve) => {
    const points = letter.strokes.flatMap((step, i) => step.dots.map((at, k) => ({ i, k, n: step.dots.length, at, lift: k === 0 && step.lift === true })));
    let next = 0;
    let elsewhere = 0;
    const { w, h: tall } = letter.box;
    const buttons = points.map(({ at }, j) => h('button', {
      type: 'button', class: ['pencil-dot', j === 0 ? 'start' : null], 'aria-label': j === 0 ? 'The start' : 'The next dot',
      style: { left: `${(100 * at[0]) / w}%`, top: `${(100 * at[1]) / tall}%` },
      onClick: ( event) => { event?.stopPropagation?.(); tap(j); },
    }));
    const live = () => buttons.forEach((b, j) => b.classList.toggle('live', j === next));
    const missed = () => {
      elsewhere++;
      if (elsewhere < 2 || view.lock.locked()) return;
      elsewhere = 0;
      view.lock.run(async () => {
        board.dots.hidden = true;
        await playModel(view, board, letter);
        board.showing('trace');
        board.dots.hidden = false;
      });
    };
    const tap = (j) => {
      if (view.lock.locked()) return;
      if (j !== next) { missed(); return; }
      elsewhere = 0;
      const { i, k, n } = points[j];
      board.ink(i, n === 1 || k === n - 1 ? 1 : k / (n - 1));
      next++;
      live();
      if (next === points.length) {
        view.choosing(false);
        view.lock.run(async () => {
          await wait(INK_MS + 200);
          board.dots.replaceChildren();
          board.fullModel();
          board.showing('model');
          resolve();
        });
        return;
      }
      if (points[next].lift) view.play(['v.pencil.lift']);
    };
    board.dots.replaceChildren(...buttons);
    board.dots.addEventListener('click', missed);
    board.showing('trace');
    live();
    view.prompt(['v.pencil.trace', startLine(letter)]).then(() => view.choosing(true));
  });
}

function findStart(view, board, letter, hooks) {
  return new Promise((resolve) => {
    const { w, h: tall } = letter.box;
    const choices = startChoices(letter);
    let begun = now();
    const pick = (j) => view.lock.run(async () => {
      board.dots.replaceChildren();
      view.choosing(false);
      hooks.record(`lf:${letter.id}`, 'start', { correct: j === 0, helped: false, ms: Math.round(now() - begun) }, { monitor: false });
      resolve();
    });
    const order = choices.map((at, j) => ({ at, j })).sort((a, b) => a.at[1] - b.at[1] || a.at[0] - b.at[0]);
    board.dots.replaceChildren(...order.map(({ at, j }) => h('button', {
      type: 'button', class: 'pencil-dot choice live', 'aria-label': 'Start here',
      style: { left: `${(100 * at[0]) / w}%`, top: `${(100 * at[1]) / tall}%` },
      onClick: ( event) => { event?.stopPropagation?.(); if (!view.lock.locked()) pick(j); },
    })));
    board.showing('ghost');
    view.prompt(['v.pencil.where']).then(() => { begun = now(); view.choosing(true); });
  });
}


function grownUpsTurn(view, kind, paper, toPaper) {
  return new Promise((resolve) => {
    if (!view.live()) return;
    const end = (answer) => view.lock.run(async () => { banner.remove(); view.root.classList.remove('pencil-writing'); resolve(answer); });
    const onPaper = paper && !paper.on && toPaper ? () => { paper.on = true; toPaper(); } : undefined;
    const banner = pencilBanner({ kind, onYes: () => end('yes'), onAgain: () => end('again'), onSkip: () => end('skip'), onPaper, hero: heroOf(view.ctx?.profile) });
    view.root.classList.add('pencil-writing');
    view.root.append(banner);
    if (kind === 'letter') offerTips(view.ctx, banner, PENCIL_TIPS);
  });
}

async function writeLetter(view, board, letter, clips, paper, trace) {
  const toPaper = () => view.show(board.el);
  if (!paper.on) showPad(view, writingPad(letter, { trace }).el);
  await view.prompt(clips);
  return grownUpsTurn(view, 'letter', paper, toPaper);
}

async function practiceLetter(view, letter, stage, hooks, paper) {
  const board = letterBoard(letter);
  view.show(board.el);
  if (stage === 'new') {
    await playModel(view, board, letter);
    await clickTrace(view, board, letter);
  } else if (stage === 'next') {
    await findStart(view, board, letter, hooks);
    await playModel(view, board, letter);
  } else {
    board.showing('rules');
  }
  const begun = now();
  let again = 0;
  for (;;) {
    if (!view.live()) return 'skip';
    const fromMemory = stage === 'secure' && again === 0;
    const writing = fromMemory ? ['v.pencil.memory'] : ['v.pencil.your-turn', 'v.pencil.say'];
    const answer = await writeLetter(view, board, letter, [...writing, ...letter.sounds], paper, stage !== 'secure');
    if (answer === 'skip') return 'skip';
    const ms = Math.round(now() - begun);
    if (answer === 'yes') {
      hooks.record(`lf:${letter.id}`, 'paper', { correct: again === 0, helped: false, ms }, { monitor: false });
      if (fromMemory) {
        view.show(board.el);
        await playModel(view, board, letter);
      }
      return 'done';
    }
    again++;
    if (again >= 2) {
      hooks.record(`lf:${letter.id}`, 'paper', { correct: false, helped: true, ms }, { monitor: false });
      return 'stuck';
    }
    view.show(board.el);
    await view.say(['v.pencil.watch']);
    await playModel(view, board, letter);
  }
}

export function secureLetter(ctx, not) {
  const marks = ctx.profile?.letters ?? {};
  return (ctx.content?.letters ?? []).find(( l) => l.id !== not
    && (marks[l.id] === 'fine' || (ctx.states?.get(`lf:${l.id}#paper`)?.box ?? 0) >= LETTER_SECURE_BOX)) ?? null;
}

async function endOnSecure(view, letter, paper) {
  if (!letter || !view.live()) return;
  const board = letterBoard(letter);
  view.show(board.el);
  await playModel(view, board, letter);
  await writeLetter(view, board, letter, ['v.pencil.your-turn', 'v.pencil.say', ...letter.sounds], paper, false);
}

export function dictationClips(item) {
  if (item.id.startsWith('g:')) return cardSoundClips(item.id.slice(2));
  if (item.id.startsWith('w:')) return [`w.${item.id.slice(2)}`];
  return [];
}

async function dictate(view, item, paper) {
  const clips = dictationClips(item);
  if (clips.length === 0) return 'done';
  const onPaper = () => h('div', { class: 'pencil-dictate' }, listenDisc(view, clips), letterBoard(null).el);
  const toPaper = () => view.show(onPaper());
  if (paper.on) view.show(onPaper());
  else showPad(view, h('div', { class: 'pencil-dictate' }, listenDisc(view, clips), writingPad(null).el));
  await view.prompt(['v.pencil.write', ...clips]);
  for (;;) {
    const answer = await grownUpsTurn(view, 'write', paper, toPaper);
    if (answer === 'yes') return 'done';
    if (answer === 'skip') return 'skip';
    if (!paper.on) view.root.classList.add('pencil-writing');
    await view.say(clips);
  }
}

export async function run(el, ctx, round, hooks) {
  const copilot = hooks.copilot ?? ctx.settings?.copilot !== false;
  if (!copilot) return;
  const view = createActivityView(el, ctx, { name: 'pencil' });
  const letters = new Map((ctx.content?.letters ?? []).map(( l) => [l.id, l]));
  const paper = { on: false };
  try {
    for (const [n, item] of round.items.entries()) {
      if (!view.live()) return;
      if (item.id.startsWith('lf:')) {
        const letter = letters.get(item.id.slice(3));
        if (!letter) continue;
        const end = await practiceLetter(view, letter, stageOf(ctx.states, letter.id), hooks, paper);
        if (end === 'skip') break;
        if (end === 'stuck') {
          await endOnSecure(view, secureLetter(ctx, letter.id), paper);
          break;
        }
      } else if (item.mode === 'write' && await dictate(view, item, paper) === 'skip') break;
      hooks.progress?.((n + 1) / round.items.length);
    }
  } finally {
    view.destroy();
  }
}

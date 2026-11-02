import { h } from '../core/dom.js';
import { phonemeCodes } from '../curriculum/phonemes.js';
import { eligibleWords } from '../engine/session-builder.js';
import { artUrl, bigButton, pawButton, soundBoxes, takeBackButton, tile } from '../ui/components.js';
import { addUnlocked, bounce, countPraiseLines, createActivityView, createOnce, judgeAloud, listenDisc, now, offerPass, runRound, showNext, sparkle, typeToPick, wait } from './cards.js';
import { buildTray, createSpellController, scaffoldFor } from './spell-controller.js';


const PHRASE_GAP_MS = 80;
const SAY_PAUSE_MS = 900;
const MAX_SHOWN = 8;
const BOX_LIGHT_MS = 450;
const PLACE_MS = 250;
const SLOW_PLACE_MS = 800;
const TILE_SIZE = 110;


export const segClips = ([, p]) => phonemeCodes(p).map(code => `p.${code}`);

export function phraseClips(word) {
  const words = typeof word.phrase === 'string' ? word.phrase.toLowerCase().match(/[a-z']+/g) ?? [] : [];
  return words.map(w => `w.${w}`);
}

const buildPraise = (word) => (word.segs.some(([g, p]) => g.length > 1 && phonemeCodes(p).length === 1) ? [1, 2, 3] : [1, 2]);


const pawPrint = () => h('img', { class: 'paw-print', src: artUrl('ui/paw'), alt: '', draggable: 'false' });

function drawBoxes(board, c, glow) {
  const { boxes, cursor } = c.state();
  const el = soundBoxes({ count: boxes.length, filled: boxes, glow });
  el.children[cursor]?.classList.add('current');
  const back = board.querySelector('.take-back');
  board.replaceChildren(el, ...(back ? [back] : []));
  return el;
}



async function countSounds({ view, c, word, board, bottom, answered, once }, scaffold) {
  const draw = () => {
    const shown = Math.min(c.state().taps, MAX_SHOWN);
    board.replaceChildren(scaffold === 'partial'
      ? soundBoxes({ count: shown, filled: [] })
      : h('div', { class: 'paw-row' }, Array.from({ length: shown }, pawPrint)));
  };
  draw();
  await view.prompt(['v.spell.count', `w.${word.w}`], { play: once('v.spell.count') });
  const passed = await new Promise((resolve) => {
    let stopPass = () => {};
    const finish = () => {
      c.finishCount();
      if (c.state().phase === 'count') return;
      stopPass();
      view.choosing(false);
      bottom.replaceChildren();
      resolve(false);
    };
    const done = bigButton({ label: '✓', onClick: finish });
    done.classList.add('done-button', 'waiting');
    done.setAttribute('aria-label', 'Done');
    const paw = pawButton({ onTap: () => {
      if (c.state().phase !== 'count') return;
      c.tapPaw();
      answered();
      draw();
      done.classList.remove('waiting');
    } });
    bottom.replaceChildren(h('div', { class: 'paw-controls' }, paw, done));
    stopPass = offerPass(view, () => {
      view.choosing(false);
      bottom.replaceChildren();
      resolve(true);
    });
    view.choosing(true);
  });
  if (passed) return true;
  await view.lock.run(async () => {
    c.setLocked(true);
    try {
      if (c.state().feedback?.kind === 'count-model') {
        await view.say(['v.error.count'], 300);
        const boxes = soundBoxes({ count: word.segs.length, filled: [] });
        board.replaceChildren(boxes);
        for (const [i, seg] of word.segs.entries()) {
          boxes.children[i].classList.add('glow');
          await Promise.all([view.play(segClips(seg)), wait(BOX_LIGHT_MS)]);
          boxes.children[i].classList.remove('glow');
        }
      } else {
        drawBoxes(board, c);
        view.cheer();
        await view.say(view.praise('count', countPraiseLines(scaffold === 'partial')), 300);
      }
    } finally {
      c.setLocked(false);
    }
  });
  return false;
}

export function buildWord({ view, c, word, board, bottom, answered }, slow) {
  return new Promise((resolve) => {
    const tiles = new Map();
    let stopKeys = () => {};
    let stopPass = () => {};
    const sync = () => {
      const { phase, cursor } = c.state();
      back.disabled = c.locked || phase !== 'build' || cursor === 0;
    };
    const pick = (g) => view.lock.run(async () => {
      const before = c.state();
      c.pick(g);
      const after = c.state();
      if (after.cursor === before.cursor && after.misses === before.misses) return;
      answered();
      c.setLocked(true);
      sync();
      view.choosing(false);
      let left = [];
      try {
        left = await showPick({ view, c, word, board, tiles, picked: (tiles.get(g)), before, after, slow });
      } finally {
        c.setLocked(false);
      }
      if (after.phase !== 'build') {
        stopPass();
        stopKeys();
        back.remove();
        resolve(left);
      } else {
        sync();
        view.choosing(true);
      }
    });
    const takeBack = () => view.lock.run(async () => {
      const { cursor } = c.state();
      c.takeBack();
      if (c.state().cursor === cursor) return;
      for (const t of tiles.values()) t.classList.remove('glow', 'dim');
      drawBoxes(board, c);
      sync();
    });
    const back = takeBackButton({ onBack: takeBack });
    for (const g of c.state().tray) tiles.set(g, tile({ label: g, onPick: pick, size: TILE_SIZE }));
    bottom.replaceChildren(h('div', { class: 'spell-tray' }, [...tiles.values()]));
    drawBoxes(board, c);
    board.append(back);
    sync();
    stopKeys = typeToPick([...tiles.keys()], pick, view.root, view.lock.locked, takeBack);
    stopPass = offerPass(view, () => {
      c.setLocked(true);
      stopKeys();
      back.remove();
      view.choosing(false);
      resolve(null);
    });
    view.choosing(true);
  });
}

async function showPick({ view, c, word, board, tiles, picked, before, after, slow }) {
  const box = before.cursor;
  const sound = segClips(word.segs[box]);
  if (after.cursor > box) {
    const revealed = before.feedback?.kind === 'reveal';
    if (revealed) for (const t of tiles.values()) t.classList.remove('glow', 'dim');
    drawBoxes(board, c).children[box].classList.add('placed');
    if (after.phase !== 'build') return revealed || slow ? sound : [];
    if (revealed || slow) await view.say(sound, slow ? SLOW_PLACE_MS : 600);
    else await wait(PLACE_MS);
    return [];
  }
  bounce(picked);
  drawBoxes(board, c, box);
  if (after.feedback?.kind === 'reveal') {
    const right = word.segs[box][0];
    for (const [g, t] of tiles) t.classList.add(g === right ? 'glow' : 'dim');
    await view.say(['v.error.tricky', 'v.error.reveal'], 900);
    return [];
  }
  await view.say(['v.error.listen', ...sound], 1300);
  drawBoxes(board, c);
  return [];
}

async function readBuilt(view, word, copilot) {
  const clip = `w.${word.w}`;
  let ready = false;
  let clickedAt = null;
  let heard = () => {};
  const clicked = new Promise((resolve) => { heard = resolve; });
  let stopPass = () => {};
  const card = (h('button', { type: 'button', class: 'word-card spell-word', lang: 'en', 'aria-label': 'Hear your word', onClick: () => {
    if (!ready) return;
    const at = now();
    view.lock.run(async () => {
      clickedAt ??= at;
      stopPass();
      view.choosing(false);
      await view.say([clip], 600);
      heard(false);
      if (ready) view.choosing(true);
    });
  } }, word.w, h('img', { class: 'word-card-speaker', src: artUrl('ui/speaker'), alt: '', draggable: 'false' })));
  const setReady = (on) => { ready = on; card.disabled = !on; };
  setReady(false);
  view.show(card);
  await view.prompt(['v.spell.read']);
  setReady(true);
  const start = now();
  view.choosing(true);
  if (!copilot) {
    stopPass = offerPass(view, () => { view.choosing(false); heard(true); });
    if (await clicked) {
      setReady(false);
      return { passed: true, card };
    }
  }
  const judged = await judgeAloud(view, { copilot, kind: 'read', model: [clip], target: card, praise: 'read' });
  setReady(false);
  if ('pass' in judged) return { passed: true, card };
  const first = Math.min(clickedAt ?? Infinity, copilot ? start + judged.ms : Infinity);
  return { answer: { ...judged, ms: Math.round(Math.max(0, first - start)) }, card };
}

export const becomesSparkleCharm = (word) => !word.trick && !word.pic;

function popTrick(view, word, { card, bag, once, popped }) {
  view.cheer();
  if (word.trick && popped.has(word.trick)) {
    sparkle(card);
    return showNext(view).pressed;
  }
  if (word.trick) popped.add(word.trick);
  if (!word.trick) {
    sparkle(card);
    const charm = becomesSparkleCharm(word);
    if (charm) addUnlocked(view.ctx.profile, 'sparkles', word.w);
    return showNext(view, charm ? once('v.spell.charm') : []).pressed;
  }
  addUnlocked(view.ctx.profile, 'tricks', word.trick);
  const item = h('img', { class: 'trick-pop', src: artUrl(`tricks/${word.trick}`), alt: '', draggable: 'false' });
  view.root.append(item);
  bag.classList.remove('got');
  void bag.offsetWidth;
  bag.classList.add('got');
  return showNext(view, ['v.spell.trick']).pressed.then(() => item.remove());
}

async function spellWord(view, word, { copilot, scaffold, slow, bag, once, popped, keep }) {
  const { ctx } = view;
  const c = createSpellController({ word, scaffold, tray: buildTray(word, ctx.settings, ctx.rng) });
  const clip = `w.${word.w}`;
  const phrase = phraseClips(word);
  const board = h('div', { class: 'spell-board' });
  const bottom = h('div', { class: 'spell-bottom' });
  view.show(h('div', { class: 'spell-top' }, listenDisc(view, [clip, ...phrase]), board), bottom);

  await view.prompt(['v.spell.hear', clip, ...phrase, 'v.spell.say', clip], { play: [...once('v.spell.hear'), clip] });
  await wait(250);
  await view.play(phrase, PHRASE_GAP_MS);
  if (phrase.length > 0) await wait(250);
  await view.play(['v.spell.say', clip]);
  await wait(SAY_PAUSE_MS);

  const start = now();
  let ms = null;
  const parts = { view, c, word, board, bottom, once, answered: () => { ms ??= Math.round(now() - start); } };

  if (c.state().phase === 'count') {
    if (await countSounds(parts, scaffold)) return { pass: true };
    await view.prompt(['v.spell.build', clip], { play: once('v.spell.build') });
  } else {
    drawBoxes(board, c);
    await view.prompt(['v.spell.boxes', 'v.spell.build', clip], { play: [...once('v.spell.boxes'), ...once('v.spell.build')] });
  }
  const lastSound = await buildWord(parts, slow);
  if (lastSound === null) return { pass: true };
  const spelled = { ...c.result(), ms: ms ?? Math.round(now() - start) };
  keep(spelled);
  view.cheer();
  await showNext(view, [...lastSound, ...(spelled.correct ? view.praise('build', buildPraise(word)) : spelled.helped ? ['v.error.later'] : [])]).pressed;

  const built = await readBuilt(view, word, copilot);
  c.finishRead();
  const { card } = built;
  const after = popTrick(view, word, { card, bag, once, popped });
  if ('passed' in built) return { ...spelled, kept: true, also: [], passed: ['read'], after };
  return { ...spelled, kept: true, also: [{ mode: 'read', answer: built.answer }], after };
}

function easyWord(ctx, used) {
  const mastered = eligibleWords(ctx.content, ctx.settings, ctx.profile, 'spell')
    .filter(w => ctx.states.get(`w:${w.w}#spell`)?.mastered);
  const fresh = mastered.filter(w => !used.has(`w:${w.w}`));
  const w = ctx.rng.pick(fresh.length > 0 ? fresh : mastered);
  return w ? { id: `w:${w.w}`, mode: 'spell', isNew: false, isReview: false } : null;
}

export async function run(el, ctx, round, hooks) {
  const view = createActivityView(el, ctx, { name: 'spell', bg: 'bg/workshop' });
  const copilot = hooks.copilot ?? ctx.settings.copilot;
  const words = new Map((ctx.content.words ?? []).map(( w) => [w.w, w]));
  const bag = h('img', { class: 'trick-bag', src: artUrl('ui/bag'), alt: '', draggable: 'false' });
  view.root.append(bag);
  const once = createOnce();
  const popped = new Set();
  try {
    if (!hooks.review) await view.prompt(['v.spell.start']);
    await runRound(view, round, hooks, {
      play: (item) => {
        const word = item.id.startsWith('w:') && item.mode === 'spell' ? words.get(item.id.slice(2)) : undefined;
        if (!word) {
          console.warn(`The Spell Workshop cannot build ${item.id} in mode ${item.mode}; skipping it.`);
          return Promise.resolve(null);
        }
        return spellWord(view, word, {
          copilot,
          scaffold: scaffoldFor(ctx.states.get(`${item.id}#spell`)),
          slow: hooks.monitor?.fast?.() === true,
          bag,
          once,
          popped,
          keep: ( spelled) => hooks.record(item.id, item.mode, spelled),
        });
      },
      easy: (used) => easyWord(ctx, used),
    });
    if (view.live()) hooks.answersIn?.();
  } finally {
    view.destroy();
  }
}

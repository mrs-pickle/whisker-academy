import { h } from '../core/dom.js';
import { isDecodable } from '../curriculum/decodable.js';
import { tierOf } from '../curriculum/tiers.js';
import { eligibleChains, eligibleWords, rWordAllowed } from '../engine/session-builder.js';
import { artUrl, kittenBubble, soundBoxes, tile } from '../ui/components.js';
import { bounce, createActivityView, createOnce, isKnown, knownInstant, listenDisc, now, runRound, showNext, sparkle, typeToPick } from './cards.js';
import { chainTray, createChainController, diffStep, protegeError } from './chain-controller.js';
import { segClips } from './spell.js';


const LEAVE_MS = 400;
const PICTURE_OUT_MS = 450;
const TILE_SIZE = 110;

export function playable(steps) {
  return steps.length >= 2 && steps.slice(1).every((s, i) => diffStep(steps[i].segs, s.segs) !== null);
}


function wordBoxes(labels, { onBox, onGap, mark, glow } = {}) {
  const el = soundBoxes({ count: labels.length, filled: labels, glow });
  el.classList.add('chain-boxes');
  const boxes = ([...el.children]);
  boxes.forEach((box, i) => {
    if (i === mark) box.classList.add('selected');
    if (!onBox) return;
    box.classList.add('pickable');
    box.setAttribute('role', 'button');
    box.setAttribute('aria-label', `Sound box ${i + 1}`);
    box.addEventListener('click', () => onBox(i));
  });
  if (onGap) {
    el.classList.add('with-gaps');
    for (let i = 0; i <= boxes.length; i++) {
      const gap = h('button', { type: 'button', class: 'chain-gap', 'data-gap': i, 'aria-label': 'A new sound goes here', onClick: () => onGap(i) });
      el.insertBefore(gap, boxes[i] ?? null);
    }
  }
  return el;
}

const labelsOf = (word) => word.segs.map(([g]) => g);

function showMade(board, boxes, sparkles) {
  const show = () => {
    board.replaceChildren(boxes);
    if (sparkles) sparkle(boxes);
  };
  const shrinking = board.querySelector('.leaving');
  if (shrinking) setTimeout(() => { if (shrinking.isConnected) show(); }, LEAVE_MS);
  else show();
}

function pictureFrame() {
  const el = h('div', { class: 'chain-picture' });
  let shown = null;
  return {
    el,
    show(word) {
      const id = word.pic ? `tricks/${word.w}` : null;
      if (id === shown) return id !== null;
      for (const old of ([...el.children])) {
        old.classList.add('leaving');
        setTimeout(() => old.remove(), PICTURE_OUT_MS);
      }
      shown = id;
      if (id === null) return false;
      const img = h('img', { class: 'arriving', src: artUrl(id), alt: '', draggable: 'false' });
      img.addEventListener('error', () => img.remove(), { once: true });
      el.append(img);
      return true;
    },
  };
}



async function makeChange(parts) {
  const before = parts.c.state().stepIndex;
  await chooseBox(parts);
  return parts.c.state().stepIndex === before ? chooseTile(parts) : [];
}

function chooseBox({ view, c, board, hint, answered }) {
  return new Promise((resolve) => {
    const { change, current } = c.state();
    const target = (change);
    const gaps = target.op === 'ins';
    let targets = [];
    let made = false;
    const pick = (kind, i) => view.lock.run(async () => {
      if (made) return;
      const before = c.state();
      if (kind === 'gap') c.pickGap(i); else c.pickBox(i);
      const after = c.state();
      if (after.phase === before.phase && after.stepIndex === before.stepIndex && after.misses === before.misses) return;
      answered();
      view.choosing(false);
      c.setLocked(true);
      try {
        if (after.misses === before.misses) {
          made = true;
          if (after.stepIndex > before.stepIndex) targets[i].classList.add('leaving');
          resolve();
          return;
        }
        bounce(targets[i]);
        if (after.feedback?.kind === 'reveal') {
          targets.forEach((t, j) => t.classList.add(j === target.index ? 'glow' : 'dim'));
          await view.say(['v.error.tricky', 'v.error.reveal'], 900);
        } else {
          await view.say(hint, 1300);
        }
      } finally {
        c.setLocked(false);
      }
      view.choosing(true);
    });
    const el = wordBoxes(current.map(([g]) => g), gaps ? { onGap: (i) => pick('gap', i) } : { onBox: (i) => pick('box', i) });
    targets = ([...el.querySelectorAll(gaps ? '.chain-gap' : '.sound-box')]);
    board.replaceChildren(el);
    view.choosing(true);
  });
}

async function chooseTile({ view, c, board, bottom, prompt, once }) {
  const { ctx } = view;
  const { change, current, nextSeg } = c.state();
  const target = (change);
  const seg = (nextSeg);
  const labels = current.map(([g]) => g);
  if (target.op === 'ins') labels.splice(target.index, 0, null);
  const draw = (options = {}) => {
    const el = wordBoxes(labels, options);
    board.replaceChildren(el);
    return ([...el.children]);
  };
  draw({ mark: target.index });
  await view.prompt([...prompt, 'v.chain.tile'], { play: once('v.chain.tile') });
  const after = current[target.op === 'sub' ? target.index + 1 : target.index];
  const tray = chainTray(seg, target.op === 'sub' ? current[target.index] : undefined, ctx.settings, ctx.rng, after);
  return new Promise((resolve) => {
    const tiles = new Map();
    let stopKeys = () => {};
    const pick = (g) => view.lock.run(async () => {
      const before = c.state();
      c.pickTile(g);
      const after = c.state();
      if (after.stepIndex === before.stepIndex && after.misses === before.misses) return;
      const picked = (tiles.get(g));
      view.choosing(false);
      c.setLocked(true);
      try {
        if (after.stepIndex > before.stepIndex) {
          stopKeys();
          bottom.replaceChildren();
          resolve(before.feedback?.kind === 'reveal' ? segClips(seg) : []);
          return;
        }
        bounce(picked);
        if (after.feedback?.kind === 'reveal') {
          for (const [x, t] of tiles) t.classList.add(x === target.to ? 'glow' : 'dim');
          draw({ mark: target.index });
          await view.say(['v.error.tricky', 'v.error.reveal'], 900);
        } else {
          draw({ mark: target.index, glow: target.index });
          await view.say(['v.error.listen', ...segClips(seg)], 1300);
          draw({ mark: target.index });
        }
      } finally {
        c.setLocked(false);
      }
      view.choosing(true);
    });
    for (const g of tray) tiles.set(g, tile({ label: g, onPick: pick, size: TILE_SIZE }));
    bottom.replaceChildren(h('div', { class: 'chain-tray' }, [...tiles.values()]));
    stopKeys = typeToPick([...tiles.keys()], pick, view.root, view.lock.locked);
    view.choosing(true);
  });
}


async function playChain(view, steps, once) {
  const c = createChainController({ steps });
  const discClips = [`w.${steps[0].w}`];
  const picture = pictureFrame();
  const board = h('div', { class: 'chain-board' });
  const bottom = h('div', { class: 'chain-bottom' });
  view.show(h('div', { class: 'chain-top' }, listenDisc(view, discClips), picture.el), board, bottom);
  board.replaceChildren(wordBoxes(labelsOf(steps[0])));
  picture.show(steps[0]);
  await view.prompt(['v.chain.start', `w.${steps[0].w}`], { play: [...once('v.chain.start'), `w.${steps[0].w}`] });

  let start = now();
  let ms = null;
  const answered = () => { ms ??= Math.round(now() - start); };
  let after;
  while (c.state().phase !== 'done' && view.live()) {
    const { next, change, misses } = c.state();
    const op = (change).op;
    const how = op === 'ins' ? 'v.chain.add' : op === 'del' ? 'v.chain.drop' : 'v.chain.box';
    const word = `w.${next}`;
    discClips.splice(0, discClips.length, word);
    const prompt = ['v.chain.next', word, how];
    await view.prompt(prompt, { play: ['v.chain.next', word, ...(op === 'sub' ? once(how) : [how])] });
    if (c.state().stepIndex === 0) start = now();
    const lastSound = await makeChange({ view, c, board, bottom, prompt, hint: ['v.error.listen', `ws.${next}`, word], answered, once });

    const made = steps[c.state().stepIndex];
    const boxes = wordBoxes(labelsOf(made));
    if (op !== 'del') boxes.children[ (change).index].classList.add('placed');
    showMade(board, boxes, !picture.show(made));
    view.cheer();
    const last = c.state().phase === 'done';
    const later = last && c.state().helped ? ['v.error.later'] : [];
    after = showNext(view, [...lastSound, word, ...(c.state().misses === misses ? view.praise('chain') : []), ...later]).pressed;
    if (!last) await after;
  }
  if (c.state().phase !== 'done') return null;
  const { misses, helped } = c.state();
  return { correct: misses === 0, helped, ms: ms ?? Math.round(now() - start), after };
}


async function kittenTries(view, word, mixup, once) {
  const c = createChainController({ steps: [{ w: mixup.shown, segs: mixup.segs }, word] });
  const clip = `w.${word.w}`;
  const board = h('div', { class: 'chain-board protege-board' });
  const bottom = h('div', { class: 'chain-bottom' });
  view.show(h('div', { class: 'chain-top' }, listenDisc(view, [clip])), board, bottom);
  board.replaceChildren(wordBoxes(labelsOf(mixup)));
  const bubble = kittenBubble({ lineId: 'kitten.protege.try' });
  bubble.classList.add('protege-bubble');
  view.root.append(bubble);
  view.think(true);
  const fix = mixup.op === 'ins' ? 'v.kitten.protege.gap' : 'v.kitten.protege.fix';
  const prompt = ['v.kitten.protege.try', 'v.kitten.protege.is', clip, 'v.kitten.protege.ask', fix];
  try {
    await view.prompt(prompt);
  } finally {
    bubble.remove();
  }
  const lastSound = await makeChange({
    view, c, board, bottom, prompt, once,
    hint: ['v.kitten.protege.again', ...word.segs.flatMap(segClips)],
    answered: () => {},
  });
  showMade(board, wordBoxes(labelsOf(word)), true);
  view.think(false);
  view.cheer();
  await showNext(view, [...lastSound, clip, 'v.kitten.protege.thanks', ...(c.state().misses === 0 ? ['v.praise.kitten.1'] : [])]).pressed;
}

export function pickProtege(ctx, preferred) {
  const { content, settings, profile } = ctx;
  const spellable = (word) => {
    const tier = word.tier ?? tierOf(word.segs);
    return tier <= profile.spellTier && rWordAllowed(profile, tier);
  };
  const candidates = [
    ...ctx.rng.shuffle(preferred.filter(spellable)),
    ...ctx.rng.shuffle(knownInstant(content, profile).filter(spellable)),
    ...ctx.rng.shuffle(eligibleWords(content, settings, profile, 'spell').filter(spellable)),
  ];
  const readable = (segs, w) => {
    if (isKnown(profile, w)) return true;
    const rec = content.byWord?.get(w);
    const taught = typeof rec?.lesson !== 'number' || rec.lesson <= settings.taughtUpTo;
    return taught && isDecodable(segs, settings.taughtUpTo) && rWordAllowed(profile, rec?.tier ?? tierOf(segs));
  };
  for (const word of candidates) {
    const mixup = protegeError(word, content, ctx.rng, readable);
    if (mixup) return { word, mixup };
  }
  return null;
}

export async function protegeMoment(view, preferred, once) {
  const picked = pickProtege(view.ctx, preferred);
  if (!picked) return false;
  await kittenTries(view, picked.word, picked.mixup, once);
  return true;
}


export function easyChain(ctx, words, used) {
  const open = eligibleChains(ctx.content, ctx.settings, ctx.profile).filter(( ch) =>
    ctx.states.get(`ch:${ch.id}#spell`)?.mastered && playable(ch.steps.map(w => (words.get(w)))));
  const fresh = open.filter(( ch) => !used.has(`ch:${ch.id}`));
  const ch = ctx.rng.pick(fresh.length > 0 ? fresh : open);
  return ch ? { id: `ch:${ch.id}`, mode: 'spell', isNew: false, isReview: false } : null;
}

export async function run(el, ctx, round, hooks) {
  const view = createActivityView(el, ctx, { name: 'chain', bg: 'bg/workshop' });
  const words = new Map((ctx.content.words ?? []).map(( w) => [w.w, w]));
  const chains = new Map((ctx.content.chains ?? []).map(( ch) => [ch.id, ch]));
  const once = createOnce();
  const played = [];
  try {
    const result = await runRound(view, round, hooks, {
      play: (item) => {
        const chain = item.id.startsWith('ch:') && item.mode === 'spell' ? chains.get(item.id.slice(3)) : undefined;
        const steps = chain?.steps.map(w => words.get(w));
        if (!steps || !steps.every(Boolean) || !playable( (steps))) {
          console.warn(`The chain round cannot play ${item.id} in mode ${item.mode}; skipping it.`);
          return Promise.resolve(null);
        }
        played.push(... (steps));
        return playChain(view, (steps), once);
      },
      easy: (used) => easyChain(ctx, words, used),
    });
    if (result === 'done' && hooks.protege && view.live()) await protegeMoment(view, played, once);
  } finally {
    view.destroy();
  }
}

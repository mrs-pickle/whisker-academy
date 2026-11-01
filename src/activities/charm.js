import { h } from '../core/dom.js';
import { heartIndexes } from '../curriculum/decodable.js';
import { artUrl } from '../ui/components.js';
import { addUnlocked, createActivityView, createOnce, isKnown, judgeAloud, knownInstant, listenDisc, runRound, showNext, wait } from './cards.js';
import { protegeMoment } from './chain.js';
import { buildWord, segClips } from './spell.js';
import { buildTray, createSpellController } from './spell-controller.js';


const HEART_MS = 900;
const LETTER_MS = 550;


export const shownWord = (w) => (w === 'i' ? 'I' : w);

export const letterClips = (g) => [...g.toLowerCase()].filter(ch => ch >= 'a' && ch <= 'z').map(ch => `ln.${ch}`);

export function heartLine(seg) {
  const sound = segClips(seg);
  return sound.length > 0 ? ['v.charm.heart.says', ...sound] : ['v.charm.heart.silent'];
}


async function nameHearts(view, iw, boxes, staying) {
  const hearts = heartIndexes(iw.segs, view.ctx.settings.taughtUpTo);
  if (hearts.length === 0) return;
  for (const i of hearts) {
    boxes[i].classList.add('heart');
    boxes[i].append(h('img', { class: 'heart-paw', src: artUrl('ui/heart-paw'), alt: '', draggable: 'false' }));
  }
  if (!staying()) return;
  const lines = hearts.map(i => heartLine(iw.segs[i]));
  await view.prompt(['v.charm.heart', ...lines.flat()], { play: ['v.charm.heart'] });
  for (const [n, i] of hearts.entries()) {
    if (!staying()) return;
    boxes[i].classList.add('glow');
    await Promise.all([view.play(lines[n]), wait(HEART_MS)]);
    boxes[i].classList.remove('glow');
  }
}

async function sayLetters(view, iw, boxes, staying) {
  if (!staying()) return;
  await view.prompt(['v.charm.letters']);
  for (const [i, [g]] of iw.segs.entries()) {
    if (!staying()) return;
    const names = letterClips(g);
    boxes[i].classList.add('lit');
    await Promise.all([view.play(names), wait(LETTER_MS * Math.max(1, names.length))]);
    boxes[i].classList.remove('lit');
  }
}

async function teachWord(view, iw, boxes, lastSound) {
  const next = showNext(view, lastSound);
  let stayed = true;
  const staying = () => stayed && view.live();
  const leave = next.pressed.then(() => {
    stayed = false;
    for (const box of boxes) box.classList.remove('glow', 'lit');
  });
  const teach = async () => {
    await next.said;
    await nameHearts(view, iw, boxes, staying);
    await sayLetters(view, iw, boxes, staying);
  };
  teach().catch((err) => console.error("The charm word's heart and letter steps stopped", err));
  await leave;
}

function joinBracelet(view, iw, bracelet) {
  const added = addUnlocked(view.ctx.profile, 'charms', iw.w);
  const charm = h('div', { class: 'charm-pop', 'aria-hidden': 'true' },
    h('img', { src: artUrl('ui/heart-paw'), alt: '', draggable: 'false' }),
    h('span', { class: 'charm-pop-word', lang: 'en' }, shownWord(iw.w)));
  view.root.append(charm);
  bracelet.classList.remove('got');
  void bracelet.offsetWidth;
  bracelet.classList.add('got');
  view.cheer();
  return showNext(view, added ? ['v.charm.done'] : []).pressed.then(() => charm.remove());
}

async function charmWord(view, iw, { copilot, known, slow, bracelet, once }) {
  const { ctx } = view;
  const clip = `w.${iw.w}`;
  const card = h('div', { class: 'word-card charm-word', lang: 'en' }, shownWord(iw.w));
  const board = h('div', { class: 'spell-board charm-board' });
  const bottom = h('div', { class: 'spell-bottom' });
  view.root.classList.toggle('charm-pronoun', iw.w === 'i');
  view.show(h('div', { class: 'charm-top' }, listenDisc(view, [clip]), card), board, bottom);

  await view.prompt(['v.charm.start', clip], { play: [...once('v.charm.start'), clip] });

  const c = createSpellController({ word: iw, scaffold: 'full', tray: buildTray(iw, ctx.settings, ctx.rng) });
  card.classList.toggle('veiled', known);
  await view.prompt(['v.charm.build', clip]);
  const lastSound = await buildWord({ view, c, word: (iw), board, bottom, answered: () => {}, once }, slow);
  bottom.replaceChildren();
  card.classList.remove('veiled');
  view.cheer();
  const boxes = ([...board.querySelectorAll('.sound-box')]);
  for (const box of boxes) box.classList.remove('current', 'placed');

  await teachWord(view, iw, boxes, lastSound);

  await view.prompt(['v.charm.read', clip]);
  const answer = await judgeAloud(view, { copilot, kind: 'read', model: [clip], target: card, praise: 'charm' });

  const after = joinBracelet(view, iw, bracelet).then(() => { view.root.classList.remove('charm-pronoun'); });
  return { ...answer, after };
}

function easyCharm(ctx, used) {
  const known = knownInstant(ctx.content, ctx.profile);
  const mastered = known.filter(( iw) => ctx.states.get(`iw:${iw.w}#read`)?.mastered);
  const pool = mastered.length > 0 ? mastered : known;
  const fresh = pool.filter(( iw) => !used.has(`iw:${iw.w}`));
  const iw = ctx.rng.pick(fresh.length > 0 ? fresh : pool);
  return iw ? { id: `iw:${iw.w}`, mode: 'read', isNew: false, isReview: false } : null;
}

export async function run(el, ctx, round, hooks) {
  const view = createActivityView(el, ctx, { name: 'charm', bg: 'bg/hall' });
  const copilot = hooks.copilot ?? ctx.settings.copilot;
  const instant = new Map((ctx.content.instant ?? []).map(( iw) => [iw.w, iw]));
  const bracelet = h('img', { class: 'charm-bracelet', src: artUrl('ui/bracelet'), alt: '', draggable: 'false' });
  view.root.append(bracelet);
  const once = createOnce();
  const played = [];
  try {
    const result = await runRound(view, round, hooks, {
      play: (item) => {
        const iw = item.id.startsWith('iw:') && item.mode === 'read' ? instant.get(item.id.slice(3)) : undefined;
        if (!iw) {
          console.warn(`The charm round cannot show ${item.id} in mode ${item.mode}; skipping it.`);
          return Promise.resolve(null);
        }
        played.push(iw);
        return charmWord(view, iw, {
          copilot,
          known: isKnown(ctx.profile, iw.w),
          slow: hooks.monitor?.fast?.() === true,
          bracelet,
          once,
        });
      },
      easy: (used) => easyCharm(ctx, used),
    });
    if (result === 'done' && hooks.protege && view.live()) await protegeMoment(view, played, once);
  } finally {
    view.destroy();
  }
}

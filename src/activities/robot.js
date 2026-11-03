import { h } from '../core/dom.js';
import { heartIndexes } from '../curriculum/decodable.js';
import { artUrl } from '../ui/components.js';
import { isKnown, showNext, untilHerTurn, herTurn, notYet } from './cards.js';
import { heartLine, shownWord } from './charm.js';


export const ROBOT_REST_DAYS = 5;

export const robotToday = (hooks) => hooks.pencilDay !== true && hooks.extra !== true && hooks.review !== true;

export function robotWord(content, profile, states, day) {
  const instant = new Set((content.instant ?? []).map(iw => iw.w));
  const free = (content.robot ?? [])
    .filter(rec => instant.has(rec.w) && isKnown(profile, rec.w))
    .map(rec => ({ rec, last: states.get(`rr:${rec.w}#fix`)?.last }))
    .filter(({ last }) => !(typeof last === 'number' && day - last < ROBOT_REST_DAYS));
  const age = ( last) => (typeof last === 'number' ? last : Number.NEGATIVE_INFINITY);
  free.sort((a, b) => (age(a.last) === age(b.last) ? 0 : age(a.last) < age(b.last) ? -1 : 1));
  return free[0]?.rec ?? null;
}

async function glowing(view, el, clips) {
  el.classList.add('glow');
  await view.play(clips);
  el.classList.remove('glow');
}

export async function robotMoment(view, rec, hooks) {
  const { ctx } = view;
  const iw = (ctx.content.instant ?? []).find(( x) => x.w === rec.w);
  if (!iw || !view.live()) return;
  const real = `w.${rec.w}`;
  const silly = `rr.${rec.w}`;

  const parts = iw.segs.map(( [g]) => h('span', { class: 'robot-part' }, shownWord(g)));
  const card = h('div', { class: 'word-card robot-word', lang: 'en' }, ...parts);
  const gus = h('img', { class: 'robot-gus', src: artUrl('cast/gus-idle'), alt: '', draggable: 'false' });
  view.show(h('div', { class: 'robot-top' }, gus, card));
  view.root.classList.add('robot-on');
  await view.prompt(['v.robot.start']);
  gus.classList.add('reading');
  await view.play([silly]);
  gus.classList.remove('reading');

  view.think(true);
  await view.play(['v.robot.notright']);
  view.think(false);

  const order = ctx.rng.shuffle([silly, real]);
  const discs = order.map(( clip) => h('button', { type: 'button', class: 'listen-disc robot-disc', 'aria-label': 'Hear this one',
    onClick: () => { if (!view.lock.locked()) view.play([clip]); } }, h('img', { src: artUrl('ui/speaker'), alt: '', draggable: 'false' })));
  let picked = () => {};
  const chosen = new Promise((resolve) => { picked = resolve; });
  const picks = untilHerTurn(order.map(( clip) => {
    const el = h('button', { type: 'button', class: 'robot-pick', 'aria-label': 'This one', onClick: () => {
      if (!notYet(el) && !view.lock.locked()) picked(clip);
    } }, h('img', { src: artUrl('ui/heart-paw'), alt: '', draggable: 'false' }));
    return { clip, el };
  }));
  view.show(h('div', { class: 'robot-top' }, gus, card),
    h('div', { class: 'choice-row robot-choices' }, order.map(( _, i) => h('div', { class: 'robot-choice' }, discs[i], picks[i].el))));
  await view.prompt(['v.robot.pick', ...order], { play: ['v.robot.pick'] });
  for (const [i, clip] of order.entries()) {
    if (!view.live()) return;
    await glowing(view, discs[i], [clip]);
  }
  if (!view.live()) return;
  herTurn(picks);
  view.choosing(true);
  const start = performance.now();
  const clip = (await chosen);
  const ms = Math.round(performance.now() - start);
  view.choosing(false);
  for (const p of picks) p.el.classList.add('not-yet');
  const correct = clip === real;
  hooks.record(`rr:${rec.w}`, 'fix', { correct, helped: false, ms }, { monitor: false });

  if (!correct) {
    for (const [i, c] of order.entries()) if (c === silly) await glowing(view, discs[i], [silly]);
    for (const [i, c] of order.entries()) if (c === real) await glowing(view, discs[i], [real]);
  }

  if (!view.live()) return;
  await glowing(view, card, [real]);
  const hearts = heartIndexes(iw.segs, ctx.settings.taughtUpTo);
  if (hearts.length > 0) {
    for (const i of hearts) parts[i].classList.add('heart');
    await view.play(['v.charm.heart', ...hearts.flatMap(i => heartLine(iw.segs[i]))]);
  }
  for (const part of parts) part.classList.remove('heart');
  card.classList.add('glow');
  const next = showNext(view, []);
  let gone = false;
  next.pressed.then(() => { gone = true; });
  await Promise.race([next.said, next.pressed]);
  if (!gone) await view.play([real]);
  await next.pressed;
  view.root.classList.remove('robot-on');
}

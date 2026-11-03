import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { isExtraPractice } from '../profile/profile.js';
import { artUrl, bigButton, kittenBubble, layeredArt } from '../ui/components.js';
import { pagesWon } from '../engine/story-place.js';
import { castArt } from '../ui/story-stage.js';
import { dressUpButton } from './dressup.js';
import { pendingGifts } from './reward.js';

const NAME_CLIP = 'name.princess';
const KITTEN_NAME_CLIP = 'name.kitten';

export const doneToday = (profile, day) => Number.isFinite(day) && (isExtraPractice(profile, (day)) || profile?.baseline?.day === day);

export function greetingLines(profile, audio, day) {
  return [
    'v.hub.hello',
    ...(audio.has(NAME_CLIP) ? [NAME_CLIP] : []),
    ...(audio.has(KITTEN_NAME_CLIP) ? [KITTEN_NAME_CLIP] : []),
    doneToday(profile, day) ? 'v.hub.dressup' : adventureScene(profile) !== 'session' ? 'v.hub.entrance' : 'v.hub.adventure',
  ];
}

export const adventureScene = (profile) => (profile?.baseline != null ? 'session' : profile?.assessFirst === true ? 'assessment' : 'entrance');

export function mount(el, ctx, params = {}) {
  const lock = createLock();
  const arrival = createArrivalGuard();
  let cold = !ctx.audio.unlocked();
  const go = (name, sceneParams) => {
    lock.run(() => ctx.router.go(name, sceneParams)).catch((err) => console.warn(`The menu could not open "${name}"`, err));
  };
  const waiting = pendingGifts(ctx.profile);
  if (params.home === true) ctx.giftWaits = true;
  const stays = params.from === 'reward' || (!cold && ctx.giftWaits === true);
  const offerGift = () => {
    if (!lock.locked()) ctx.giftWaits = false;
    go('reward', { gifts: pendingGifts(ctx.profile), late: true });
  };
  const spent = (event) => {
    const first = cold;
    if (!first && !arrival.allows(event)) return true;
    if (first) {
      cold = false;
      ctx.audio.unlock();
    }
    if (!ctx.profile.princessName) {
      go('grownup/setup');
      return true;
    }
    if (first && !stays && waiting.length > 0) {
      offerGift();
      return true;
    }
    return false;
  };
  const opens = (name) => (event) => { if (!spent(event)) go(name); };
  const frontDoor = (event) => {
    event?.stopPropagation();
    if (!cold && !arrival.allows(event)) return;
    if (cold) {
      cold = false;
      ctx.audio.unlock();
    }
    go('start');
  };
  const play = (event) => {
    if (spent(event)) return;
    const onward = () => {
      if (pendingGifts(ctx.profile).length > 0) offerGift();
      else go(adventureScene(ctx.profile));
    };
    if (ctx.dayEnding) lock.run(() => ctx.dayEnding).then(onward).catch((err) => console.warn('The menu could not go on to the adventure', err));
    else onward();
  };
  if (!cold && !stays && waiting.length > 0) {
    offerGift();
    return () => {};
  }
  const day = ctx.day;
  const bubble = cold || params.from === 'reward' ? null : kittenBubble({ lineId: 'hub.hello' });
  const name = typeof ctx.profile.princessName === 'string' ? ctx.profile.princessName.trim() : '';

  const chaptersButton = bigButton({ label: 'Chapters', icon: 'ui/book', onClick: opens('chapters') });
  chaptersButton.classList.add('hub-chapters');

  const pages = pagesWon(ctx.content?.story ?? [], ctx.profile);
  const spellBook = pages.length === 0 ? null : h('button', {
    type: 'button', class: 'hub-spellbook', 'aria-label': 'Spell Book',
    onClick: ( event) => { if (!spent(event) && !lock.locked()) ctx.audio.play('v.hub.spellbook'); },
  }, h('img', { class: 'hub-spellbook-art', src: artUrl('tricks/book'), alt: '', draggable: 'false' }),
  h('span', { class: 'hub-spellbook-pages' }, pages.map(({ page }) => h('img', { class: 'hub-spellbook-page', src: artUrl(page), alt: '', draggable: 'false' }))));

  const adventure = h('div', { class: ['hub-adventure', doneToday(ctx.profile, day) && 'done-today'] },
    bigButton({ label: 'Play', icon: 'ui/stone-on', onClick: play }));
  ctx.dayEnding?.then(() => { adventure.classList.toggle('done-today', doneToday(ctx.profile, day)); });

  el.append(h('div', { class: 'hub', onClick: ( event) => { spent(event); } },
    h('img', { class: 'scene-bg', src: artUrl('bg/hub'), alt: '' }),
    h('h1', { class: 'hub-title' }, "Meadowlark's World", h('span', { class: 'hub-subtitle' }, 'Whisker Academy')),
    h('div', { class: 'hub-kitten' }, layeredArt(castArt('kitten', ctx.profile.look, 'sit')), bubble ? h('div', { class: 'hub-bubble' }, bubble) : null),
    name ? h('div', { class: 'hub-name' }, name) : null,
    h('button', { type: 'button', class: 'hub-path', tabindex: '-1', 'aria-hidden': 'true', onClick: play }),
    h('div', { class: 'hub-menu' },
      adventure,
      h('div', { class: 'hub-rooms' },
        bigButton({ label: 'Color', icon: 'ui/crayon-e63946', onClick: opens('colorin') }),
        dressUpButton(ctx.profile.look, opens('dressup')),
        chaptersButton)),
    spellBook,
    h('button', { type: 'button', class: 'hub-frontdoor', onClick: frontDoor }, 'Front door'),
    h('button', { type: 'button', class: 'hub-grownup', onClick: opens('grownup/gate') }, 'Grown-ups')));

  if (bubble) {
    const lines = greetingLines(ctx.profile, ctx.audio, day);
    ctx.setReplay(lines);
    ctx.audio.playSeq(lines).then(() => bubble.remove());
  }
  return () => {};
}

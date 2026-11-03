import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { nextStoryScene, scenesRead, visibleScenes } from '../engine/story-place.js';
import { artUrl } from '../ui/components.js';
import { sceneArt } from '../ui/story-stage.js';


const badge = (id, className) => h('img', { class: className, src: artUrl(id), alt: '', draggable: 'false' });

export function mount(el, ctx) {
  const lock = createLock();
  const arrival = createArrivalGuard();
  const story = ctx.content?.story ?? [];
  const here = nextStoryScene(ctx.content, ctx.profile, ctx.settings)?.scene.id;
  const read = scenesRead(story, ctx.profile, ctx.states);
  const pages = visibleScenes(story, ctx.profile, ctx.settings);

  const opens = (id) => (event) => {
    if (!arrival.allows(event)) return;
    lock.run(() => ctx.router.go('visit', { scene: id })).catch((err) => console.error(`The scene "${id}" could not open`, err));
  };
  const heading = (ch) => h('h2', { class: 'chapter-title' },
    h('button', { type: 'button', class: 'chapter-title-sound', 'aria-label': ch.title, onClick: ( event) => {
      if (arrival.allows(event) && !lock.locked()) ctx.audio.play(`v.story.${ch.id}.title`);
    } }, badge('ui/speaker', 'chapter-title-speaker')));
  const tile = ({ scene, kind }, i, tiles) => {
    const side = kind === 'side';
    const seen = read.has(scene.id);
    const now = scene.id === here;
    const label = [`Page ${i + 1}`, side && 'a side quest', seen && 'read', now && 'you are here'].filter(Boolean).join(', ');
    const firstSide = side && tiles[i - 1]?.kind !== 'side';
    return h('button', { type: 'button', class: ['chapter-tile', firstSide && 'first-side', seen && 'read', now && 'here'], 'data-scene-id': scene.id, 'aria-label': label, onClick: opens(scene.id) },
      h('img', { class: 'chapter-tile-art', src: artUrl(sceneArt(scene.bg)), alt: '', draggable: 'false' }),
      h('span', { class: 'chapter-tile-number' }, String(i + 1)),
      side ? badge('ui/sparkle', 'chapter-tile-star') : null,
      seen ? badge('ui/paw', 'chapter-tile-read') : null,
      now ? h('span', { class: 'chapter-here' }, 'You are here') : null);
  };

  const bookTwo = () => h('h2', { class: 'book-title' },
    h('button', { type: 'button', class: 'chapter-title-sound', 'aria-label': 'Book Two', onClick: ( event) => {
      if (arrival.allows(event) && !lock.locked()) ctx.audio.play('v.story.book2.title');
    } }, badge('ui/speaker', 'chapter-title-speaker')), badge('tricks/book', 'book-title-art'));
  let shelved = false;

  el.append(h('div', { class: 'chapters' },
    h('img', { class: 'scene-bg', src: artUrl('bg/hall'), alt: '' }),
    h('h1', { class: 'chapters-title' }, 'Chapters'),
    h('div', { class: 'chapters-list' }, story.flatMap((ch) => {
      const tiles = pages.filter((page) => page.chapterId === ch.id);
      if (tiles.length === 0) return [];
      const section = h('section', { class: 'chapter' }, heading(ch), h('div', { class: 'chapter-tiles' }, tiles.map(tile)));
      if ( (ch).book !== 2 || shelved) return [section];
      shelved = true;
      return [bookTwo(), section];
    }))));

  ctx.say('chapters.pick');
  return () => {};
}

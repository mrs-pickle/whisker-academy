import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { nextStoryScene, readingOrder, scenesRead } from '../engine/story-place.js';
import { artUrl } from '../ui/components.js';
import { sceneArt } from '../ui/story-stage.js';


const badge = (id, className) => h('img', { class: className, src: artUrl(id), alt: '', draggable: 'false' });

export function mount(el, ctx) {
  const lock = createLock();
  const arrival = createArrivalGuard();
  const story = ctx.content?.story ?? [];
  const here = nextStoryScene(ctx.content, ctx.profile, ctx.settings)?.scene.id;
  const read = scenesRead(story, ctx.profile, ctx.states);

  const opens = (id) => (event) => {
    if (!arrival.allows(event)) return;
    lock.run(() => ctx.router.go('visit', { scene: id })).catch((err) => console.error(`The scene "${id}" could not open`, err));
  };
  const tile = ({ scene, kind, index }, i) => {
    const side = kind === 'side';
    const seen = read.has(scene.id);
    const now = scene.id === here;
    const label = [`Page ${i + 1}`, side && 'a side quest', seen && 'read', now && 'you are here'].filter(Boolean).join(', ');
    return h('button', { type: 'button', class: ['chapter-tile', side && index === 0 && 'first-side', seen && 'read', now && 'here'], 'data-scene-id': scene.id, 'aria-label': label, onClick: opens(scene.id) },
      h('img', { class: 'chapter-tile-art', src: artUrl(sceneArt(scene.bg)), alt: '', draggable: 'false' }),
      h('span', { class: 'chapter-tile-number' }, String(i + 1)),
      side ? badge('ui/sparkle', 'chapter-tile-star') : null,
      seen ? badge('ui/paw', 'chapter-tile-read') : null,
      now ? h('span', { class: 'chapter-here' }, 'You are here') : null);
  };

  el.append(h('div', { class: 'chapters' },
    h('img', { class: 'scene-bg', src: artUrl('bg/hall'), alt: '' }),
    h('h1', { class: 'chapters-title' }, 'Chapters'),
    h('div', { class: 'chapters-list' }, story.map((ch) => h('section', { class: 'chapter' },
      h('h2', { class: 'chapter-title' }, ch.title),
      h('div', { class: 'chapter-tiles' }, readingOrder([ch]).map(tile)))))));

  ctx.say('chapters.pick');
  return () => {};
}

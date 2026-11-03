import { secondClick } from '../activities/cards.js';
import { readAloud } from '../activities/story.js';
import { h } from '../core/dom.js';
import { createLock } from '../core/lock.js';
import { visibleScenes } from '../engine/story-place.js';
import { bigButton } from '../ui/components.js';

export function mount(el, ctx, params = {}) {
  const pages = visibleScenes(ctx.content?.story ?? [], ctx.profile);
  let at = pages.findIndex((p) => p.scene.id === params.scene);
  if (at < 0) {
    ctx.router.go('chapters').catch(( err) => console.error('Chapters could not open', err));
    return () => {};
  }
  const lock = createLock();
  let endScene = () => {};
  const host = h('div', { class: 'visit-scene' });

  const show = () => {
    endScene();
    back.disabled = at === 0;
    forward.disabled = at === pages.length - 1;
    endScene = readAloud(host, ctx, pages[at].scene);
  };
  const step = (className, label, by) => {
    const button = (h('button', { type: 'button', class: ['visit-step', className], 'aria-label': label,
      onClick: ( event) => {
        if (button.disabled || secondClick(event)) return;
        at += by;
        show();
      } }, h('span', { class: 'visit-arrow', 'aria-hidden': 'true' })));
    return button;
  };
  const back = step('visit-back', 'The page before', -1);
  const forward = step('visit-next', 'The next page', 1);
  const list = bigButton({ label: 'Chapters', icon: 'ui/book', onClick: (event) => {
    if (secondClick(event)) return;
    ctx.audio.stop();
    lock.run(() => ctx.router.go('chapters')).catch((err) => console.error('Chapters could not open', err));
  } });
  list.classList.add('visit-chapters');

  el.append(h('div', { class: 'visit' }, host, back, forward, list));
  show();
  return () => endScene();
}

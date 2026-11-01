import { h } from '../../core/dom.js';
import { createArrivalGuard, createLock } from '../../core/lock.js';
import { startOver } from '../../profile/start-over.js';

export const START_OVER_WARNING = "This erases her Entrance Quest, every word's practice history, her place in the story, her dress-up gifts and crayons, her tricks and charms, and the coloring pages she has earned. It cannot be undone.";
export const START_OVER_KEEPS = "These stay: her princess's and her kitten's names, the PIN and the other settings, your voice recordings, the sound cards, the coloring pages you added (she earns them again), the instant words you added and the words marked Known. The grown-up tips show again, once each.";
export const STARTED_OVER = 'Her progress is erased. Her next adventure is the Entrance Quest.';

export function startOverSection(ctx) {
  const lock = createLock();
  let arrival = createArrivalGuard();
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });

  const showWarning = (open) => {
    warning.hidden = !open;
    start.hidden = open;
    (open ? keep : start).focus();
    if (!open) return;
    arrival = createArrivalGuard();
    message.textContent = '';
    warning.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  };

  const erase = () => lock.run(async () => {
    showWarning(false);
    try {
      message.textContent = (await startOver(ctx)) ? STARTED_OVER : 'Another window of the game is playing, so nothing was erased.';
    } catch (err) {
      console.error('Her progress could not be erased', err);
      message.textContent = "Erasing didn't work in this browser window, so nothing was erased.";
    }
    message.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });

  const start = h('button', { type: 'button', class: 'gu-button', onClick: () => showWarning(true) }, 'Start over…');
  const keep = h('button', { type: 'button', class: 'gu-button', onClick: () => showWarning(false) }, 'Keep her progress');
  const warning = h('div', { class: 'gu-confirm gu-start-over', hidden: true },
    h('p', {}, h('strong', {}, START_OVER_WARNING)),
    h('p', {}, START_OVER_KEEPS),
    h('div', { class: 'gu-row' },
      h('button', { type: 'button', class: 'gu-button', onClick: () => {
        lock.run(() => ctx.router.go('grownup/backup', { unlocked: true })).catch((err) => console.error('The Backup screen could not open', err));
      } }, 'Make a backup first'),
      keep),
    h('div', { class: 'gu-start-over-yes' },
      h('button', { type: 'button', class: 'gu-button gu-danger', onClick: ( event) => {
        if (arrival.allows(event)) erase();
      } }, 'Yes, erase her progress')));

  return h('section', { class: 'gu-setting', 'data-setting': 'start-over' },
    h('h2', { class: 'gu-setting-label' }, 'Start over'),
    h('p', { class: 'gu-help' }, 'Erases her progress so she begins again with the Entrance Quest. The button below only opens a warning; nothing is erased until you say yes there.'),
    start,
    warning,
    message);
}

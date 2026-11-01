import { h } from '../core/dom.js';

export const MAX_PLAUSIBLE_WCPM = 250;
export const MIN_TIMED_MS = 2000;
export const FINISH_DELAY_MS = 800;
export const TOO_FAST_NOTE = 'That timing looks too fast. Time it again?';

export function wordsCorrectPerMinute(wordCount, errors, ms) {
  if (!Number.isFinite(ms) || ms < MIN_TIMED_MS) return null;
  const right = wordCount - Math.min(wordCount, Math.max(0, errors));
  return Math.round(right / (ms / 60000));
}

export const isTooFast = (wcpm) => typeof wcpm === 'number' && Number.isFinite(wcpm) && wcpm > MAX_PLAUSIBLE_WCPM;

const clock = () => globalThis.performance?.now?.() ?? Date.now();

export function passageLines(text) {
  return String(text ?? '').trim().split(/(?<=[.!?]["”’']?)\s+(?=["“‘']?[A-Z])/).filter(line => line !== '');
}

export function passageTimer({ wordCount, onFinish, title = "Grown-up's turn: time her reading", finishLabel = 'Finish' }) {
  let started = 0;
  let took = 0;
  let missed = 0;
  let wait;
  const count = h('span', { class: 'entrance-count', 'aria-live': 'polite' }, '0');
  const note = h('p', { class: 'passage-timer-note', role: 'status', hidden: true }, TOO_FAST_NOTE);
  const button = (label, kind, onClick, hidden = false) => h('button', { type: 'button', class: ['copilot-choice', kind], hidden, onClick }, label);

  const judge = () => {
    const flagged = !finish.hidden && isTooFast(wordsCorrectPerMinute(wordCount, missed, took));
    note.hidden = !flagged;
    again.hidden = !flagged;
  };
  const setMissed = (n) => { missed = Math.max(0, Math.min(wordCount, n)); count.textContent = String(missed); judge(); };

  const start = button('▶ Start', 'yes', () => {
    started = clock();
    start.hidden = true;
    done.hidden = false;
    done.disabled = true;
    clearTimeout(wait);
    wait = setTimeout(() => { done.disabled = false; }, MIN_TIMED_MS);
  });
  const done = button('■ Done', 'yes', () => {
    took = clock() - started;
    done.hidden = true;
    finish.hidden = false;
    missedGroup.hidden = false;
    finish.disabled = true;
    clearTimeout(wait);
    wait = setTimeout(() => { finish.disabled = false; }, FINISH_DELAY_MS);
    judge();
  }, true);
  const finish = button(finishLabel, 'again', () => onFinish({ ms: took, errors: missed, wcpm: wordsCorrectPerMinute(wordCount, missed, took) }), true);
  const again = button('↻ Time it again', 'help', () => {
    clearTimeout(wait);
    started = 0;
    took = 0;
    finish.hidden = true;
    missedGroup.hidden = true;
    done.hidden = true;
    start.hidden = false;
    judge();
  }, true);
  const missedGroup = h('div', { class: 'entrance-missed', role: 'group', 'aria-label': 'Missed words', hidden: true },
    h('span', {}, 'How many words did she miss?'),
    h('button', { type: 'button', class: 'entrance-step', 'aria-label': 'One fewer missed word', onClick: () => setMissed(missed - 1) }, '−'),
    count,
    h('button', { type: 'button', class: 'entrance-step', 'aria-label': 'One more missed word', onClick: () => setMissed(missed + 1) }, '+'));

  return h('div', { class: 'passage-timer', role: 'group', 'aria-label': 'Time her reading' },
    h('p', { class: 'copilot-title' }, title),
    h('div', { class: 'copilot-tips' }),
    h('div', { class: 'copilot-choices' }, start, done, missedGroup, finish, again),
    note);
}

import { h } from '../core/dom.js';
import { LAST_LESSON, LESSONS } from '../curriculum/lessons.js';
import { questDetail } from '../engine/quest-results.js';
import { ASSESSMENT_DEADLINES, assessmentPlan, atLesson, confirmNew, confirmRetake, ladderLines, ladderStart, nextLadderLine, suggestLesson } from '../engine/placement.js';
import { createActivityView, wait } from '../activities/cards.js';
import { heroWords } from '../profile/hero.js';
import { clampTaughtUpTo } from '../profile/settings.js';
import { COPILOT_HELP, layeredArt } from '../ui/components.js';
import { castArt } from '../ui/story-stage.js';
import { checkPage } from './check.js';
import { buildBaseline, questEndLines, questPage, seedWeakItems, spellTierFromDictation } from './entrance.js';
import { dictateWords, readLines, readPassage } from './reading-check.js';
import { isTooFast } from './passage-timer.js';
import { createActiveClock, libraryForTheDay, partsForTheDay } from './session.js';


export const LEAVE_ASSESSMENT = 'Leave the Assessment? Nothing is saved until you confirm her lesson at the end.';
const HELP = `${COPILOT_HELP} Today: one mark per word (Try again means not yet). A line stops after 3 misses; Help counts as a miss.`;
const STORY_NOTE = "Say \"your best story voice\", never \"fast\". She reads to the end; Stop ends it without a timing.";
export const ASSESSMENT_VOICE = Object.freeze({
  first: { welcome: 'v.entrance.welcome', thanks: 'v.entrance.thanks', passage: 'v.entrance.passage' },
  again: { welcome: 'v.check.welcome', thanks: 'v.check.thanks', passage: 'v.check.passage', done: 'v.check.done' },
  lines: { real: 'v.entrance.real', nonsense: 'v.entrance.nonsense', next: 'v.entrance.next' },
  dictation: 'v.entrance.dictation',
});
export const ladderGuess = (profile, settings) => (Number.isInteger(profile?.assessFrom) ? (profile.assessFrom) : settings.taughtUpTo);

const CLOSE_MS = 1800;
const FIRST_WORDS_LESSON = 4;

export function suggestionNote(suggested, hx) {
  if (suggested === null) return hx(`No line was read with at most 1 miss, so there is no suggestion. Lesson ${FIRST_WORDS_LESSON} is the first with practice words; her tutor's lesson is better if you know it.`);
  const concept = LESSONS.find((l) => l.n === suggested)?.concept ?? '';
  return hx(`Suggested: lesson ${suggested}${concept ? ` (${concept})` : ''}, the highest set of words she read with at most 1 miss in a line. It is a suggestion: her tutor's number wins.`);
}

export function ladderSummary(ladder, log) {
  return log.flatMap((line) => {
    const band = ladder.find((l) => l.words.map((w) => w.w).join(' ') === line.words.join(' '));
    if (!band) return [];
    const right = line.marks.filter(Boolean).length;
    return [`Lesson ${band.lesson}: ${line.stopped ? `stopped, ${right} read` : `${right} of ${line.size}`}`];
  });
}

export function mount(el, ctx) {
  const first = ctx.profile?.baseline == null;
  const voice = first ? ASSESSMENT_VOICE.first : ASSESSMENT_VOICE.again;
  const hx = heroWords(ctx);
  const doc = el.ownerDocument;
  const clock = createActiveClock();
  const onInput = () => clock.input();
  const stopClock = () => {
    doc.removeEventListener('pointerdown', onInput, true);
    doc.removeEventListener('keydown', onInput, true);
  };
  const view = createActivityView(el, ctx, { name: first ? 'entrance' : 'check', bg: 'bg/hall' });
  view.root.classList.add('activity-assessment');
  let box = null;
  const closeBox = () => {
    box?.remove();
    box = null;
    if (!card) view.root.removeAttribute('data-keys-held');
  };
  const stopAsking = ctx.onHome?.(( leave) => {
    if (box) return;
    const stay = h('button', { type: 'button', class: 'gu-button gu-primary', onClick: closeBox }, 'Stay');
    box = h('div', { class: 'quest-leave-cover assess-leave' },
      h('div', { class: 'quest-leave', role: 'group', 'aria-label': 'Leave the Assessment' },
        h('p', { class: 'quest-leave-text' }, hx(LEAVE_ASSESSMENT)),
        h('div', { class: 'gu-row' }, stay, h('button', { type: 'button', class: 'gu-button', onClick: leave }, 'Leave'))));
    view.root.setAttribute('data-keys-held', '');
    view.root.append(box);
    stay.focus();
  });
  let card = null;
  const hall = (pose) => h('div', { class: 'entrance-hall' },
    layeredArt(castArt('princess', ctx.profile.look), 'entrance-princess'),
    pose ? layeredArt(castArt('kitten', ctx.profile.look, pose), 'entrance-kitten') : null);
  const open = (part) => clock.ms() < ASSESSMENT_DEADLINES[part];

  const run = async () => {
    clock.input();
    doc.addEventListener('pointerdown', onInput, true);
    doc.addEventListener('keydown', onInput, true);
    view.show(hall(first ? '' : 'sit'));
    await view.prompt([voice.welcome]);

    const ladder = ladderLines(ctx.content);
    const start = ladderStart(ladder, ladderGuess(ctx.profile, ctx.settings));
    const climbed = await readLines(view, ladder, { open: () => open('ladder'), voice: ASSESSMENT_VOICE.lines, helpText: HELP,
      pick: (at, log) => nextLadderLine(start, ladder.length, at.map((i, k) => ({ at: i, line: log[k] }))) });
    const suggested = suggestLesson(ladder, climbed.lines);
    const plan = assessmentPlan(ctx.content, suggested, ctx.profile);
    if (climbed.lines.length > 0 && view.live()) await view.say([voice.thanks], 700);
    const madeUp = await readLines(view, plan.lines, { open: () => open('nonsense'), voice: ASSESSMENT_VOICE.lines, helpText: HELP });
    if (madeUp.lines.length > 0 && view.live()) await view.say([voice.thanks], 700);
    const dictation = await dictateWords(view, plan.dictation, { open: () => open('dictation'), voice: { intro: ASSESSMENT_VOICE.dictation, thanks: voice.thanks } });
    const passage = plan.passage && view.live()
      ? await readPassage(view, plan.passage, { prompt: voice.passage, thanks: voice.thanks }, first ? {} : { stop: true, note: STORY_NOTE }) : null;
    if (!view.live()) return;
    stopClock();

    view.show(hall('cheer'));
    await Promise.all([view.prompt(first ? questEndLines(ctx.audio) : [ASSESSMENT_VOICE.again.done]), wait(CLOSE_MS)]);
    if (!view.live()) return;

    const day = ctx.day;
    const lines = [...climbed.lines, ...madeUp.lines];
    const before = ctx.settings.taughtUpTo;
    const chosen = await askGrownUp({ suggested, before, summary: ladderSummary(ladder, climbed.lines), dictation, passage });
    if (!view.live()) return;
    const lesson = chosen.lesson ?? before;
    const detail = questDetail({ day, taughtUpTo: lesson, lines, dictation,
      passage: passage && plan.passage ? { id: plan.passage.id, wcpm: passage.wcpm, errors: (passage.errors) } : null });
    const record = { day, suggested, before, lesson: chosen.lesson, first, detail };
    const placements = [...(Array.isArray(ctx.profile.placements) ? ctx.profile.placements : []), record];
    if (first) {
      const baseline = buildBaseline({ day, lines, dictation, passage: passage ? { wcpm: passage.wcpm, errors: passage.errors ?? 0 } : null });
      const set = confirmNew(ctx.profile, ctx.settings, lesson);
      ctx.settings = set.settings;
      ctx.profile = { ...set.profile, baseline, baselineDetail: detail, spellTier: baseline.dictation.tier, placements };
      for (const [key, state] of seedWeakItems(atLesson([...climbed.results, ...madeUp.results, ...dictation], lesson), ctx.states, day)) ctx.states.set(key, state);
      const earned = questPage(ctx.profile, { pages: await libraryForTheDay(ctx), content: ctx.content, day, dictation });
      ctx.profile = earned.profile;
      if (earned.pages) ctx.pages = earned.pages;
    } else {
      const set = confirmRetake(ctx.profile, ctx.settings, chosen.lesson);
      ctx.settings = set.settings;
      ctx.profile = { ...set.profile, placements, ...(chosen.spellTier ? { spellTier: chosen.spellTier } : {}) };
      const [library, parts] = await Promise.all([libraryForTheDay(ctx), partsForTheDay(ctx)]);
      const earned = checkPage(ctx.profile, { pages: library, parts, content: ctx.content, states: ctx.states, day });
      ctx.profile = earned.profile;
      if (earned.pages) ctx.pages = earned.pages;
    }
    stopAsking?.();
    closeBox();
    await ctx.save().catch(( err) => console.error('The Assessment could not be saved', err));
    leaving = true;
    await ctx.router.go('hub');
  };

  function askGrownUp({ suggested, before, summary, dictation, passage }) {
    return new Promise((resolve) => {
      const start = suggested ?? (first ? FIRST_WORDS_LESSON : before);
      const input = (h('input', { class: 'gu-input assess-lesson', id: 'assess-lesson', type: 'number', min: '1', max: String(LAST_LESSON), step: '1', value: String(start), inputmode: 'numeric' }));
      const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
      const tier = spellTierFromDictation(dictation);
      const offerTier = !first && dictation.length > 0 && tier !== ctx.profile.spellTier;
      const tierBox = (h('input', { type: 'checkbox', id: 'assess-tier' }));
      const use = () => {
        const n = Number(input.value);
        if (!Number.isInteger(n) || n < 1 || n > LAST_LESSON) { message.textContent = `Type a lesson from 1 to ${LAST_LESSON}.`; input.focus(); return; }
        resolve({ lesson: clampTaughtUpTo(n), ...(offerTier && tierBox.checked ? { spellTier: tier } : {}) });
      };
      const keep = () => resolve({ lesson: null, ...(offerTier && tierBox.checked ? { spellTier: tier } : {}) });
      card = h('div', { class: 'assess-result-cover' },
        h('div', { class: 'gu-card assess-result', role: 'group', 'aria-label': 'For the grown-up' },
          h('h2', { class: 'gu-title' }, 'For the grown-up'),
          h('p', { class: 'assess-suggestion' }, suggestionNote(suggested, hx)),
          summary.length > 0 ? h('ul', { class: 'assess-summary' }, summary.map((line) => h('li', {}, line))) : null,
          passage && Number.isFinite(passage.wcpm) ? h('p', { class: 'gu-hint' }, isTooFast(passage.wcpm)
            ? 'The timing of the story looked too fast to be right.'
            : `The story: ${passage.wcpm} words correct per minute.`) : null,
          first ? null : h('p', { class: 'gu-hint' }, hx(`Her lesson now: ${before}. Keeping it changes nothing; a new lesson moves her words on or back, and keeps everything she has earned.`)),
          h('div', { class: 'gu-field' }, h('label', { class: 'gu-label', for: 'assess-lesson' }, 'Taught up to lesson'), input),
          offerTier ? h('label', { class: 'gu-check' }, tierBox, ` ${hx(`Also start her spelling at tier ${tier} (now tier ${ctx.profile.spellTier})`)}`) : null,
          message,
          h('div', { class: 'gu-row' },
            h('button', { type: 'button', class: 'gu-button gu-primary', 'data-choice': 'use', onClick: use }, first ? 'Start at this lesson' : 'Use this lesson'),
            first ? null : h('button', { type: 'button', class: 'gu-button', 'data-choice': 'keep', onClick: keep }, `Keep lesson ${before}`))));
      view.root.setAttribute('data-keys-held', '');
      view.root.append(card);
      input.focus();
    });
  }

  let leaving = false;
  run().catch((err) => {
    console.error('The Assessment stopped', err);
    if (view.live() && !leaving) {
      leaving = true;
      ctx.router.go('hub').catch(( e) => console.error('The Assessment could not go back to the castle', e));
    }
  }).finally(stopClock);
  return () => { stopClock(); };
}

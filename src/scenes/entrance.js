import { h } from '../core/dom.js';
import { sentenceBlockers } from '../curriculum/decodable.js';
import { soundKind } from '../curriculum/phonemes.js';
import { applyResult, newItemState } from '../engine/itemstate.js';
import { itemKey, partScore, questDetail, questSelection } from '../engine/quest-results.js';
import { createActivityView, wait } from '../activities/cards.js';
import { COPILOT_HELP, layeredArt } from '../ui/components.js';
import { castArt } from '../ui/story-stage.js';
import { earnPage } from '../profile/pages.js';
import { dictateWords, readLines, readPassage, sectionOpen } from './reading-check.js';
import { wordsForStrip } from '../ui/print-pages.js';
import { createActiveClock, libraryForTheDay } from './session.js';

export { isTooFast, MAX_PLAUSIBLE_WCPM, passageLines, wordsCorrectPerMinute } from './passage-timer.js';
export { QUEST_DEADLINES, sectionOpen } from './reading-check.js';
export { scoreLine, undoMark } from '../engine/quest-results.js';




const SECURE = 0.8;
const MAX_START_TIER = 3;


export function spellTierFromDictation(results) {
  const byTier = new Map();
  for (const { word, correct } of results) {
    const t = byTier.get(word.tier) ?? { right: 0, total: 0 };
    t.total++;
    if (correct) t.right++;
    byTier.set(word.tier, t);
  }
  let highestSecure = 0;
  for (const t of [1, 2, 3, 4]) {
    const score = byTier.get(t);
    if (!score) continue;
    if (score.right / score.total < SECURE) break;
    highestSecure = t;
  }
  return (Math.min(MAX_START_TIER, highestSecure + 1));
}

const vowelGraphemes = (word) => [...new Set(word.segs.filter(([, p]) => soundKind(p) === 'vowel').map(([g]) => g))];

export function seedWeakItems(results, states, day) {
  const out = new Map(states);
  const applied = new Set();
  const seed = (key, helped, ms) => {
    if (applied.has(key)) return;
    applied.add(key);
    out.set(key, applyResult(states.get(key) ?? newItemState(key), { day, correct: false, helped, ms }));
  };
  for (const { word, mode, correct, helped = false, ms = 0 } of results) {
    if (correct) continue;
    seed(itemKey(word, mode), helped, ms);
    for (const g of vowelGraphemes(word)) seed(`g:${g}#${mode === 'spell' ? 'hear' : 'see'}`, false, ms);
  }
  return out;
}

export function buildBaseline({ day, lines, dictation, passage }) {
  return {
    day,
    real: partScore(lines, 'real'),
    nonsense: partScore(lines, 'nonsense'),
    dictation: { correct: dictation.filter(r => r.correct).length, total: dictation.length, tier: spellTierFromDictation(dictation) },
    passage: passage ? { wcpm: passage.wcpm, errors: passage.errors } : { wcpm: null, errors: null },
  };
}

export function questPlan(content, settings, profile) {
  const n = settings.taughtUpTo;
  const { lines, dictation } = questSelection(content, n);
  const words = new Map((content.words ?? []).map(w => [w.w, w]));
  const entrance = content.entrance ?? {};
  const known = new Set(Object.keys(profile.instant ?? {}).filter(w => profile.instant[w] === 'known'));
  const passage = entrance.passage && sentenceBlockers(entrance.passage.text,
    { lookup: (w) => words.get(w)?.segs ?? null, knownInstant: known, names: new Set(), taughtUpTo: n }).length === 0
    ? entrance.passage : null;
  return { lines, dictation, passage };
}


export const questEndLines = (audio) => ['v.entrance.done', ...(audio.has('name.kitten') ? ['name.kitten'] : [])];

const JOIN_MS = 1800;
const CLOSE_PAUSE_MS = 800;

const LEAVE_QUESTION = 'Leave the Entrance Quest? It starts again next time.';

const ENTRANCE_HELP = `${COPILOT_HELP} Today: one mark per word (Try again means not yet). A line stops after 3 misses; Help counts as a miss.`;

export function questPage(profile, { pages, content, day, dictation }) {
  const none = { profile, pages: null, page: null };
  if (!Array.isArray(pages)) return none;
  const earned = earnPage(pages, content?.colorin, profile, day);
  if (!earned.earned) return none;
  const ids = ( results) => results.filter((r) => r?.mode === 'spell' && typeof r.word?.w === 'string').map((r) => `w:${r.word.w}`);
  const built = Array.isArray(dictation) ? dictation : [];
  const page = { ...earned.earned, words: wordsForStrip({ spelled: ids(built.filter((r) => r?.correct === true)), answered: ids(built) }, content) };
  return { profile: earned.profile, pages: earned.pages.map((p) => (p === earned.earned ? page : p)), page };
}

export function mount(el, ctx) {
  const doc = el.ownerDocument;
  const clock = createActiveClock();
  const onInput = () => clock.input();
  const stopClock = () => {
    doc.removeEventListener('pointerdown', onInput, true);
    doc.removeEventListener('keydown', onInput, true);
  };
  const view = createActivityView(el, ctx, { name: 'entrance', bg: 'bg/hall' });
  let box = null;
  const closeBox = () => {
    box?.remove();
    box = null;
    view.root.removeAttribute('data-keys-held');
  };
  const stopAsking = ctx.onHome?.(( leave) => {
    if (box) return;
    const stay = h('button', { type: 'button', class: 'gu-button gu-primary', onClick: closeBox }, 'Stay');
    box = h('div', { class: 'quest-leave-cover' },
      h('div', { class: 'quest-leave', role: 'group', 'aria-label': 'Leave the Entrance Quest' },
        h('p', { class: 'quest-leave-text' }, LEAVE_QUESTION),
        h('div', { class: 'gu-row' }, stay,
          h('button', { type: 'button', class: 'gu-button', onClick: leave }, 'Leave'))));
    view.root.setAttribute('data-keys-held', '');
    view.root.append(box);
    stay.focus();
  });

  const quest = async () => {
    const plan = questPlan(ctx.content, ctx.settings, ctx.profile);
    clock.input();
    doc.addEventListener('pointerdown', onInput, true);
    doc.addEventListener('keydown', onInput, true);

    view.show(h('div', { class: 'entrance-hall' }, layeredArt(castArt('princess', ctx.profile.look), 'entrance-princess')));
    await view.prompt(['v.entrance.welcome']);

    const read = await readLines(view, [...plan.lines.filter(l => l.kind === 'real'), ...plan.lines.filter(l => l.kind === 'nonsense')],
      { open: (kind) => sectionOpen(kind, clock.ms()), helpText: ENTRANCE_HELP,
        voice: { real: 'v.entrance.real', nonsense: 'v.entrance.nonsense', next: 'v.entrance.next' } });

    const dictation = await dictateWords(view, plan.dictation,
      { open: () => sectionOpen('dictation', clock.ms()), voice: { intro: 'v.entrance.dictation', thanks: 'v.entrance.thanks' } });

    const passage = plan.passage && view.live() ? await readPassage(view, plan.passage, { prompt: 'v.entrance.passage', thanks: 'v.entrance.thanks' }) : null;
    if (!view.live()) return;
    stopClock();

    const day = ctx.day;
    const { lines } = read;
    const baseline = buildBaseline({ day, lines, dictation, passage });
    const baselineDetail = questDetail({ day, taughtUpTo: ctx.settings.taughtUpTo, lines, dictation,
      passage: passage && plan.passage ? { id: plan.passage.id, ...passage } : null });
    ctx.profile = { ...ctx.profile, baseline, baselineDetail, spellTier: baseline.dictation.tier };
    stopAsking?.();
    closeBox();
    for (const [key, state] of seedWeakItems([...read.results, ...dictation], ctx.states, day)) ctx.states.set(key, state);
    const library = await libraryForTheDay(ctx);
    const earned = questPage(ctx.profile, { pages: library, content: ctx.content, day, dictation });
    ctx.profile = earned.profile;
    if (earned.pages) ctx.pages = earned.pages;
    await ctx.save().catch(( err) => console.error('The Entrance Quest could not be saved', err));
    if (!view.live()) return;

    view.show(h('div', { class: 'entrance-hall' },
      layeredArt(castArt('princess', ctx.profile.look), 'entrance-princess'),
      layeredArt(castArt('kitten', ctx.profile.look, 'cheer'), 'entrance-kitten')));
    await Promise.all([view.prompt(questEndLines(ctx.audio)), wait(JOIN_MS)]);
    await wait(CLOSE_PAUSE_MS);
    if (!view.live()) return;
    leaving = true;
    await ctx.router.go('hub');
  };
  let leaving = false;
  quest().catch((err) => {
    console.error('The Entrance Quest stopped', err);
    if (view.live() && !leaving) {
      leaving = true;
      ctx.router.go('hub').catch(( e) => console.error('The Entrance Quest could not go back to the castle', e));
    }
  }).finally(stopClock);

  return () => {
    stopClock();
  };
}

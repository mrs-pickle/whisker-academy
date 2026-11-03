import { h } from '../core/dom.js';
import { checkForm } from '../engine/check-form.js';
import { questDetail } from '../engine/quest-results.js';
import { dayOptions } from '../engine/page-recipe.js';
import { rWordsOpen } from '../engine/session-builder.js';
import { createActivityView, wait } from '../activities/cards.js';
import { earnMadePage, earnPage } from '../profile/pages.js';
import { COPILOT_HELP, layeredArt } from '../ui/components.js';
import { castArt } from '../ui/story-stage.js';
import { TH_TIPS } from '../ui/tips.js';
import { dictateWords, readLines, readPassage, sectionOpen } from './reading-check.js';
import { createActiveClock, libraryForTheDay, partsForTheDay } from './session.js';


export const LEAVE_CHECK = 'Leave? It starts again next time.';
const CHECK_HELP = `${COPILOT_HELP} Today: one mark per word (Try again means not yet). A line stops after 3 misses; Help counts as a miss.`;
export const STORY_VOICE_NOTE = "Say \"your best story voice\", never \"fast\". She reads to the end; Stop ends it without a timing.";
const VOICE = Object.freeze({
  welcome: 'v.check.welcome',
  lines: { real: 'v.entrance.real', nonsense: 'v.entrance.nonsense', next: 'v.entrance.next' },
  dictation: { intro: 'v.entrance.dictation', thanks: 'v.check.thanks' },
  passage: { prompt: 'v.check.passage', thanks: 'v.check.thanks' },
  thanks: 'v.check.thanks',
  done: 'v.check.done',
});
const CHEER_MS = 1800;

export const formFor = (content, settings, profile) => checkForm(content?.checks ?? {}, {
  taughtUpTo: settings.taughtUpTo,
  past: Array.isArray(profile?.checks) ? profile.checks : [],
  sShContrast: settings.sShContrast === true,
  rWords: rWordsOpen(profile),
  baselineTaughtUpTo: profile?.baselineDetail?.taughtUpTo,
});

export function checkRecord({ day, form, lines, dictation, passage }) {
  const detail = questDetail({ day, taughtUpTo: form.taughtUpTo, lines,
    dictation: dictation.map(d => ({ word: d.word, built: d.built ?? [], correct: d.correct })),
    passage: passage ? { id: form.passage.id, wcpm: passage.wcpm, errors: (passage.errors) } : null });
  return {
    ...detail,
    passage: detail.passage && passage?.stopped ? { ...detail.passage, wcpm: null, errors: null, stopped: true } : detail.passage,
    form: form.form,
    sets: [...form.sets],
  };
}

export function checkPage(profile, { pages, parts, content, states, day }) {
  const none = { profile, pages: null, page: null };
  if (!Array.isArray(pages)) return none;
  const offer = parts ? dayOptions({ content, parts, profile, states, scene: null, practice: [], day }) : null;
  if (offer) {
    const made = earnMadePage(pages, offer.options[0], day, []);
    return made.earned ? { profile, pages: made.pages, page: made.earned } : none;
  }
  const built = earnPage(pages, content?.colorin, (profile), day);
  return built.earned ? { profile: built.profile, pages: built.pages, page: built.earned } : none;
}

export function mount(el, ctx) {
  const form = ctx.settings?.copilot ? formFor(ctx.content, ctx.settings, ctx.profile) : null;
  if (!form) {
    ctx.router.go('grownup/progress', { unlocked: true }).catch(( err) => console.error('Progress could not open', err));
    return () => {};
  }
  const records = new Map((ctx.content.checks?.items ?? []).map(( r) => [r.w, r]));
  const doc = el.ownerDocument;
  const clock = createActiveClock();
  const onInput = () => clock.input();
  const stopClock = () => {
    doc.removeEventListener('pointerdown', onInput, true);
    doc.removeEventListener('keydown', onInput, true);
  };
  const view = createActivityView(el, ctx, { name: 'check', bg: 'bg/hall' });
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
      h('div', { class: 'quest-leave', role: 'group', 'aria-label': 'Leave Read to Kitty' },
        h('p', { class: 'quest-leave-text' }, LEAVE_CHECK),
        h('div', { class: 'gu-row' }, stay,
          h('button', { type: 'button', class: 'gu-button', onClick: leave }, 'Leave'))));
    view.root.setAttribute('data-keys-held', '');
    view.root.append(box);
    stay.focus();
  });
  const hall = ( pose) => h('div', { class: 'entrance-hall' },
    layeredArt(castArt('princess', ctx.profile.look), 'entrance-princess'),
    layeredArt(castArt('kitten', ctx.profile.look, pose), 'entrance-kitten'));
  const linesOf = (kind) => form.lines.filter(l => l.kind === kind)
    .map((l, i) => ({ id: `${kind}-${i}`, kind, words: l.words.map(w => (records.get(w))) }));
  const open = ( kind) => sectionOpen(kind, clock.ms());
  const thTips = ( line) => (line.words.some(w => w.real === false && w.segs.some(([g]) => g === 'th')) ? TH_TIPS : []);

  const run = async () => {
    clock.input();
    doc.addEventListener('pointerdown', onInput, true);
    doc.addEventListener('keydown', onInput, true);
    view.show(hall('sit'));
    await view.prompt([VOICE.welcome]);

    const real = await readLines(view, linesOf('real'), { open, voice: VOICE.lines, helpText: CHECK_HELP });
    if (real.lines.length > 0 && view.live()) await view.say([VOICE.thanks], 700);
    const madeUp = await readLines(view, linesOf('nonsense'), { open, voice: VOICE.lines, helpText: CHECK_HELP, tipsFor: thTips });
    if (madeUp.lines.length > 0 && view.live()) await view.say([VOICE.thanks], 700);
    const words = form.dictation.map(d => (records.get(d.w)));
    const dictation = await dictateWords(view, words, { open: () => sectionOpen('dictation', clock.ms()), voice: VOICE.dictation });
    const passage = view.live() ? await readPassage(view, form.passage, VOICE.passage, { stop: true, note: STORY_VOICE_NOTE }) : null;
    if (!view.live()) return;
    stopClock();

    const day = ctx.day;
    const record = checkRecord({ day, form, lines: [...real.lines, ...madeUp.lines], dictation, passage });
    ctx.profile = { ...ctx.profile, checks: [...(Array.isArray(ctx.profile.checks) ? ctx.profile.checks : []), record] };
    stopAsking?.();
    closeBox();
    const [library, parts] = await Promise.all([libraryForTheDay(ctx), partsForTheDay(ctx)]);
    const earned = checkPage(ctx.profile, { pages: library, parts, content: ctx.content, states: ctx.states, day });
    ctx.profile = earned.profile;
    if (earned.pages) ctx.pages = earned.pages;
    await ctx.save().catch(( err) => console.error('Read to Kitty could not be saved', err));
    if (!view.live()) return;

    view.show(hall('cheer'));
    await Promise.all([view.prompt([VOICE.done]), wait(CHEER_MS)]);
    if (!view.live()) return;
    leaving = true;
    await ctx.router.go('hub');
  };
  let leaving = false;
  run().catch((err) => {
    console.error('Read to Kitty stopped', err);
    if (view.live() && !leaving) {
      leaving = true;
      ctx.router.go('hub').catch(( e) => console.error('Read to Kitty could not go back to the castle', e));
    }
  }).finally(stopClock);
  return () => { stopClock(); };
}

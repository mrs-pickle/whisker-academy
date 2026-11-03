import { h } from '../../core/dom.js';
import { checkReady, formsLeft } from '../../engine/check-form.js';
import { checkColumns, practiceLine, practiceVsNew } from '../../engine/check-table.js';
import { familyLine, letterFamilies } from '../../engine/letters.js';
import { summarize } from '../../engine/progress.js';
import { heroOf, heroWords } from '../../profile/hero.js';
import { isComplete } from '../../profile/profile.js';
import { isTooFast, passageLines, passageTimer, TOO_FAST_NOTE } from '../passage-timer.js';
import { cornerFrame } from './gate.js';
import { storyNoteBox } from './instant.js';


const MS_PER_DAY = 86400000;


export function progressReport(states, profile) {
  const summary = summarize(states, profile);
  const sessions = profile.sessions.filter((s) => Number.isFinite(s.day));
  return {
    weeks: summary.minutesByWeek.map(({ week, minutes }) => {
      const inWeek = sessions.filter((s) => s.day >= week && s.day < week + 7);
      return {
        week,
        sessions: inWeek.length,
        partPlayed: inWeek.filter((s) => !isComplete(s)).length,
        rounds: inWeek.reduce((n, s) => n + (Number.isFinite(s.rounds) ? s.rounds : 0), 0),
        minutes: Math.round(minutes),
      };
    }),
    totalSessions: sessions.length,
    mastered: summary.mastered,
    learning: summary.learning,
    instantKnown: Object.values(profile.instant).filter((status) => status === 'known').length,
    accuracy: summary.accuracyTrend.map((a) => Math.round(a * 100)),
    accuracyDays: summary.accuracyDays,
    baseline: profile.baseline ?? null,
  };
}

export const weekLabel = (day) => new Date(day * MS_PER_DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const shortDate = (day) => new Date(day * MS_PER_DAY).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

const TIER_NOTES = Object.freeze({
  1: 'short words, like cat or mop',
  2: 'words with a blend, like lamp or stop',
  3: 'longer blends, like stamp or strip',
  4: 'the trickiest words, like drag or trip',
});

export const CHECK_NOTES = Object.freeze([
  "Only the anchor rows trend: anchor words are the same kind as the Entrance Quest's, fresh each month. New-pattern words change with each lesson taught.",
  'School test scores can take a long time to move.',
  'About 1 to 1.5 words per minute per week is good growth at best, and those norms are old.',
  "One month's wobble means little. Forms are similar, not equal.",
]);
export const GAP_NOTE = 'A gap between practice and new words means she may be remembering words rather than sounding them out. It is worth raising with her tutor.';
export const PH_NOTE = 'ph is checked with made-up words: no fresh real words exist at this level.';
export const TH_NOTE = 'Either th sound counts on a made-up word.';
export const NO_FORM_NOTE = 'Every monthly check form has been used. A later release adds more.';

const cell = (part) => (part.total > 0 ? `${part.correct} of ${part.total}` : '—');
const passageCellText = (p) => (p.stopped ? 'not timed' : p.wcpm == null ? 'not read' : `${p.wcpm} wcpm, ${p.errors ?? 0} missed`);

function checksSection(ctx, hx) {
  const columns = checkColumns(ctx.profile, ctx.content?.checks);
  if (columns.length === 0) return [];
  const checks = columns.filter((c) => c.kind === 'check');
  const head = h('tr', {}, h('th', {}, ''), columns.map((c) => h('th', {}, c.kind === 'baseline' ? 'Baseline' : `Check ${ (c.index) + 1}`, h('br', {}), h('span', { class: 'gu-check-date' }, shortDate(c.day)))));
  const row = (label, value) => h('tr', {}, h('th', {}, label), columns.map((c) => h('td', {}, value(c))));
  const reached47 = checks.some((c) => (c.taughtUpTo ?? 0) >= 47);
  const reached50 = checks.some((c) => (c.taughtUpTo ?? 0) >= 50);
  const practice = practiceVsNew(ctx.profile, ctx.content ?? {}, ctx.states);
  const none = formsLeft(ctx.content?.checks, ctx.profile.checks ?? []).length === 0 && (ctx.content?.checks?.forms ?? []).length > 0;
  return [
    h('h2', { class: 'gu-subtitle' }, 'Monthly checks'),
    checks.length === 0 ? h('p', { class: 'gu-empty' }, 'No monthly check yet. One is ready 28 days after the Entrance Quest.') : null,
    h('table', { class: 'gu-table gu-check-table' },
      h('thead', {}, head),
      h('tbody', {},
        row('Real words, anchor', (c) => cell(c.real.anchor)),
        row('Real words, new', (c) => (c.kind === 'baseline' ? '—' : cell(c.real.new))),
        row('Made-up words, anchor', (c) => cell(c.nonsense.anchor)),
        row('Made-up words, new', (c) => (c.kind === 'baseline' ? '—' : cell(c.nonsense.new))),
        reached47 ? h('tr', { class: 'gu-check-note-row' }, h('td', { colspan: String(columns.length + 1) }, h('span', { class: 'gu-hint' }, TH_NOTE))) : null,
        row('Spelled, anchor', (c) => cell(c.spelled.anchor)),
        row('Spelled, new', (c) => (c.kind === 'baseline' ? '—' : cell(c.spelled.new))),
        row('Passage', (c) => passageCellText(c.passage)),
        checks.length === 0 ? null : h('tr', {}, h('th', {}, ''), columns.map((c) => h('td', {}, c.kind === 'baseline' ? '' : h('button', { type: 'button', class: 'gu-button gu-small gu-check-answers', onClick: () => {
          ctx.router.go('grownup/quest-results', { unlocked: true, check: String(c.index) }).catch(( err) => console.error("The check's answers could not open", err));
        } }, 'See every answer')))))),
    h('p', { class: 'gu-hint' }, 'A passage marked "not timed" was stopped before the end. That is not a low score.'),
    ...practice.map((p) => h('p', { class: 'gu-check-practice' }, practiceLine(p))),
    practice.length > 0 ? h('p', { class: 'gu-hint' }, hx(GAP_NOTE)) : null,
    reached50 ? h('p', { class: 'gu-hint' }, PH_NOTE) : null,
    ...CHECK_NOTES.map((text) => h('p', { class: 'gu-hint' }, text)),
    none ? h('p', { class: 'gu-note' }, NO_FORM_NOTE) : null,
  ].filter((node) => node !== null);
}

const outOf = (part) => (part && part.total > 0 ? `${part.correct} of ${part.total}` : 'not checked');

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'progress');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  const r = progressReport(ctx.states, ctx.profile);
  const b = r.baseline;

  const passage = ctx.content?.entrance?.passage;
  const passageCell = h('td', { class: 'gu-passage-cell' });
  const retime = h('div', { class: 'gu-retime', role: 'group', 'aria-label': hx('Time her reading again'), hidden: true });
  const retimeMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const retimeNote = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const drawPassage = () => {
    const timing = ctx.profile.baseline?.passage;
    const flagged = isTooFast(timing?.wcpm);
    passageCell.replaceChildren(
      timing?.wcpm == null ? 'not read' : `${timing.wcpm} words correct per minute, ${timing.errors ?? 0} missed`,
      ...(flagged ? [h('p', { class: 'gu-hint' }, TOO_FAST_NOTE)] : []),
      ...(flagged && passage?.text ? [h('button', { type: 'button', class: 'gu-button', onClick: () => startRetime() }, 'Time it again')] : []));
  };
  const startRetime = () => {
    retimeMessage.textContent = '';
    retimeNote.textContent = '';
    retime.replaceChildren(
      h('div', { class: 'gu-retime-head' },
        h('button', { type: 'button', class: 'gu-button gu-small', onClick: () => { retime.hidden = true; } }, 'Cancel'),
        h('p', { class: 'gu-hint' }, hx('Have her read the story aloud again, and time it here. Her new timing replaces the old one.'))),
      h('div', { class: 'gu-retime-page passage-page', lang: 'en' }, passageLines(passage.text).map((line) => h('p', { class: 'story-line' }, line))),
      passageTimer({ wordCount: passage.wordCount, title: hx('Time her reading'), finishLabel: 'Save this timing', hero: heroOf(ctx.profile), onFinish: ({ wcpm, errors }) => {
        if (wcpm === null) { retimeNote.textContent = 'That was too short to time.'; return; }
        const detail = ctx.profile.baselineDetail;
        ctx.profile = { ...ctx.profile, baseline: { ...ctx.profile.baseline, passage: { wcpm, errors } },
          ...(detail?.passage ? { baselineDetail: { ...detail, passage: { ...detail.passage, wcpm, errors } } } : {}) };
        retime.hidden = true;
        drawPassage();
        ctx.save().then(
          () => { retimeMessage.textContent = `Saved: ${wcpm} words correct per minute.`; },
          ( err) => { console.error('The new timing could not be saved', err); retimeMessage.textContent = "Saving didn't work in this browser window."; });
      } }),
      retimeNote);
    retime.hidden = false;
  };
  drawPassage();

  const checkMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const checkLine = checkReady(ctx.profile, ctx.content?.checks, ctx.day) ? h('div', { class: 'gu-check-ready' },
    h('p', { class: 'gu-note' }, 'Monthly check is ready'),
    h('p', { class: 'gu-hint' }, hx('She hears it as "Read to Kitty": about 10 minutes, with you beside her to mark each word. Nothing is lost by waiting.')),
    h('button', { type: 'button', class: 'gu-button gu-primary gu-check-start', onClick: () => {
      if (!ctx.settings?.copilot) {
        checkMessage.textContent = hx('Turn on the co-pilot in Settings first: you mark each word as she reads.');
        return;
      }
      ctx.router.go('check').catch(( err) => console.error('Read to Kitty could not open', err));
    } }, 'Start'),
    checkMessage) : null;

  const assessments = Array.isArray(ctx.profile.placements) ? ctx.profile.placements : [];
  const lastPlacement = assessments.at(-1);
  const assessLine = h('div', { class: 'gu-assess-again' },
    h('p', { class: 'gu-hint' }, hx(`The Assessment: about 10 minutes of reading with you beside her, as on her first day. It suggests a UFLI lesson; you keep her lesson or change it. It never takes away anything she earned.${
      lastPlacement ? ` Last done ${shortDate(lastPlacement.day)}${lastPlacement.suggested === null ? '' : `, suggesting lesson ${lastPlacement.suggested}`}.` : ''}`)),
    h('button', { type: 'button', class: 'gu-button gu-assess-start', onClick: () => {
      ctx.router.go('assessment').catch(( err) => console.error('The Assessment could not open', err));
    } }, hx('Find her lesson again: the Assessment')));

  const stat = (label, value) => h('div', { class: 'gu-stat' }, h('span', { class: 'gu-stat-value' }, String(value)), h('span', { class: 'gu-stat-label' }, label));

  body.append(...[
    storyNoteBox(ctx).el,
    checkLine,
    assessLine,
    h('p', { class: 'gu-note' }, hx("What to watch here is steady practice, more words and sounds mastered, and her baseline compared with later checks.")),

    h('h2', { class: 'gu-subtitle' }, 'Practice'),
    r.weeks.length === 0 ? h('p', { class: 'gu-empty' }, 'No sessions yet.') : h('table', { class: 'gu-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Week of'), h('th', {}, 'Sessions'), h('th', {}, 'Rounds'), h('th', {}, 'Active minutes'))),
      h('tbody', {}, r.weeks.map((w) => h('tr', {}, h('td', {}, weekLabel(w.week)),
        h('td', {}, w.partPlayed > 0 ? `${w.sessions} (${w.partPlayed} part-played)` : w.sessions), h('td', {}, w.rounds), h('td', {}, w.minutes))))),
    !r.weeks.some((w) => w.partPlayed > 0) ? null : h('p', { class: 'gu-hint' }, hx('A part-played session is one she left before the end of the path. Its rounds and minutes count, and coming back the same day carries on from the first round she had not finished.')),

    h('h2', { class: 'gu-subtitle' }, 'Mastered'),
    h('div', { class: 'gu-stats' },
      stat('words', r.mastered.words),
      stat('sound cards', r.mastered.cards),
      stat('instant words mastered in play', r.mastered.instant),
      stat('still learning', r.learning),
      stat(hx('instant words marked Known (her list)'), r.instantKnown)),
    h('p', { class: 'gu-hint' }, hx('Mastered means right without help on 2 different days, after several reviews. A later slip sends an item back for more practice; its history is kept. "Marked Known" is different: those are the words you marked Known in Instant words, whether or not she has practiced them yet.')),
    h('p', { class: 'gu-hint' }, hx('"Sound cards" here counts the cards she has mastered in play. The Sound cards screen\'s Mastered is different: it is your mark of how her tutor sees each card, and it only changes which cards the drill shows more often.')),

    ...((ctx.content?.letters ?? []).length === 0 ? [] : [
      h('h2', { class: 'gu-subtitle' }, 'Letter writing'),
      h('ul', { class: 'gu-list gu-letter-families' }, letterFamilies(ctx.content, ctx.profile, ctx.states ?? new Map()).map((f) => h('li', {}, familyLine(f)))),
      h('p', { class: 'gu-hint' }, hx('Secure: marked fine in Letter writing, or written right on several days. Practicing: met in the pencil round.')),
    ]),

    h('h2', { class: 'gu-subtitle' }, 'Accuracy, latest sessions'),
    r.accuracy.length === 0 ? h('p', { class: 'gu-empty' }, r.totalSessions === 0 ? 'No sessions yet.' : 'No answers to score yet.') : h('div', { class: 'gu-trend', role: 'img', 'aria-label': `Accuracy, oldest first: ${r.accuracy.map((a, i) => `${shortDate(r.accuracyDays[i])}: ${a}%`).join(', ')}` },
      r.accuracy.map((a, i) => h('div', { class: 'gu-trend-bar' },
        h('span', { class: 'gu-trend-track' }, h('span', { class: 'gu-trend-fill', style: { height: `${a}%` } })),
        h('span', { class: 'gu-trend-value' }, `${a}%`),
        h('span', { class: 'gu-trend-date' }, shortDate(r.accuracyDays[i]))))),
    h('p', { class: 'gu-hint' }, 'Sessions aim for about 85–90% right: easy enough to feel good, hard enough to learn. Unscored self-check moments and passes are not counted, and a day with nothing to score has no bar.'),

    h('h2', { class: 'gu-subtitle' }, 'Baseline (Entrance Quest)'),
    b ? h('table', { class: 'gu-table' }, h('tbody', {},
      h('tr', {}, h('th', {}, 'Played on'), h('td', {}, Number.isFinite(b.day) ? weekLabel(b.day) : '')),
      h('tr', {}, h('th', {}, 'Real words read'), h('td', {}, outOf(b.real))),
      h('tr', {}, h('th', {}, 'Made-up words read'), h('td', {}, outOf(b.nonsense))),
      h('tr', {}, h('th', {}, 'Dictated words spelled'), h('td', {}, `${outOf(b.dictation)}${b.dictation?.tier ? ` (spelling starts at tier ${b.dictation.tier}: ${TIER_NOTES[ (b.dictation.tier)] ?? 'the easiest words first'})` : ''}`)),
      h('tr', {}, h('th', {}, 'Passage'), passageCell)))
      : h('p', { class: 'gu-empty' }, hx("The Entrance Quest hasn't been played yet. It starts the first time she presses Play.")),
    b ? h('button', { type: 'button', class: 'gu-button', onClick: () => {
      ctx.router.go('grownup/quest-results', { unlocked: true }).catch(( err) => console.error('Quest results could not open', err));
    } }, 'See every answer') : null,
    b ? retimeMessage : null,
    ...checksSection(ctx, hx),

    h('p', { class: 'gu-hint' }, hx('To erase her progress and begin again with the Entrance Quest, use Start over at the end of Settings.'))].filter((node) => node !== null));
  if (b) (body.closest('.grownup') ?? el).append(retime);
  return () => {};
}

import { h } from '../../core/dom.js';
import { summarize } from '../../engine/progress.js';
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

const outOf = (part) => (part && part.total > 0 ? `${part.correct} of ${part.total}` : 'not checked');

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'progress');
  if (!body) return () => {};
  const r = progressReport(ctx.states, ctx.profile);
  const b = r.baseline;

  const passage = ctx.content?.entrance?.passage;
  const passageCell = h('td', { class: 'gu-passage-cell' });
  const retime = h('div', { class: 'gu-retime', role: 'group', 'aria-label': 'Time her reading again', hidden: true });
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
        h('p', { class: 'gu-hint' }, 'Have her read the story aloud again, and time it here. Her new timing replaces the old one.')),
      h('div', { class: 'gu-retime-page passage-page', lang: 'en' }, passageLines(passage.text).map((line) => h('p', { class: 'story-line' }, line))),
      passageTimer({ wordCount: passage.wordCount, title: 'Time her reading', finishLabel: 'Save this timing', onFinish: ({ wcpm, errors }) => {
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

  const stat = (label, value) => h('div', { class: 'gu-stat' }, h('span', { class: 'gu-stat-value' }, String(value)), h('span', { class: 'gu-stat-label' }, label));

  body.append(...[
    storyNoteBox(ctx).el,
    h('p', { class: 'gu-note' }, "What to watch here is steady practice, more words and sounds mastered, and her baseline compared with later checks."),

    h('h2', { class: 'gu-subtitle' }, 'Practice'),
    r.weeks.length === 0 ? h('p', { class: 'gu-empty' }, 'No sessions yet.') : h('table', { class: 'gu-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Week of'), h('th', {}, 'Sessions'), h('th', {}, 'Rounds'), h('th', {}, 'Active minutes'))),
      h('tbody', {}, r.weeks.map((w) => h('tr', {}, h('td', {}, weekLabel(w.week)),
        h('td', {}, w.partPlayed > 0 ? `${w.sessions} (${w.partPlayed} part-played)` : w.sessions), h('td', {}, w.rounds), h('td', {}, w.minutes))))),
    !r.weeks.some((w) => w.partPlayed > 0) ? null : h('p', { class: 'gu-hint' }, 'A part-played session is one she left before the end of the path. Its rounds and minutes count, and coming back the same day carries on from the first round she had not finished.'),

    h('h2', { class: 'gu-subtitle' }, 'Mastered'),
    h('div', { class: 'gu-stats' },
      stat('words', r.mastered.words),
      stat('sound cards', r.mastered.cards),
      stat('instant words mastered in play', r.mastered.instant),
      stat('still learning', r.learning),
      stat('instant words marked Known (her list)', r.instantKnown)),
    h('p', { class: 'gu-hint' }, 'Mastered means right without help on 2 different days, after several reviews. A later slip sends an item back for more practice; its history is kept. "Marked Known" is different: those are the words you marked Known in Instant words, whether or not she has practiced them yet.'),
    h('p', { class: 'gu-hint' }, '"Sound cards" here counts the cards she has mastered in play. The Sound cards screen\'s Mastered is different: it is your mark of how her tutor sees each card, and it only changes which cards the drill shows more often.'),

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
      : h('p', { class: 'gu-empty' }, "The Entrance Quest hasn't been played yet. It starts the first time she presses Play."),
    b ? h('button', { type: 'button', class: 'gu-button', onClick: () => {
      ctx.router.go('grownup/quest-results', { unlocked: true }).catch(( err) => console.error('Quest results could not open', err));
    } }, 'See every answer') : null,
    b ? retimeMessage : null,

    h('p', { class: 'gu-hint' }, 'To erase her progress and begin again with the Entrance Quest, use Start over at the end of Settings.')].filter((node) => node !== null));
  if (b) (body.closest('.grownup') ?? el).append(retime);
  return () => {};
}

import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { accuracyBySession, masteredByUnit, minutesByWeek, newWordsRead, pointerOverTime, rereadSpeeds } from '../../engine/dashboard.js';
import { heroWords } from '../../profile/hero.js';
import { readSaved } from '../../profile/saved.js';
import { barGraph, lineGraph } from '../../ui/graphs.js';
import { cornerFrame } from './gate.js';

const MS_PER_DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const shortDate = (day) => {
  const d = new Date(day * MS_PER_DAY);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
};

const pct = (v) => `${Math.round(v * 100)}%`;

export const DASHBOARD_LINKS = Object.freeze([
  ['progress', 'Progress'],
  ['quest-results', 'Quest results'],
  ['report', 'Tutor report'],
  ['settings', 'Settings'],
  ['soundcheck', 'Sound check'],
  ['instant', 'Words'],
  ['letters', 'Letters'],
  ['passes', 'Passes'],
  ['pages', 'Pages'],
  ['backup', 'Backup'],
  ['settings', 'Start over'],
  ['about', 'About'],
].map((entry) => Object.freeze(entry)));

export function dashboardGraphs({ profile, states, content, day, hx = (text) => text }) {
  const weeks = minutesByWeek(profile, day);
  const accuracy = accuracyBySession(profile);
  const units = masteredByUnit(states, content);
  const fresh = newWordsRead(profile, content?.checks ?? {});
  const rereads = rereadSpeeds(profile);
  const pointer = pointerOverTime(profile);
  const anyMinutes = weeks.some((w) => w.full + w.part > 0);
  const graphs = [
    {
      id: 'minutes', title: 'Minutes per week',
      note: hx('Active minutes in each of the last 8 weeks, by the week\'s Sunday. A day she left part-way is the lighter part of its bar.'),
      legend: ([['graph-a', 'Played to the end'], ['graph-a-light', 'Part-played']]),
      svg: anyMinutes ? barGraph(weeks.map((w) => ({
        label: shortDate(w.week),
        parts: [
          { value: w.full, cls: 'graph-a', tip: `Week of ${shortDate(w.week)}: ${w.full} minutes played to the end` },
          { value: w.part, cls: 'graph-a-light', tip: `Week of ${shortDate(w.week)}: ${w.part} minutes part-played` },
        ],
      })), { title: 'Minutes per week, last 8 weeks' }) : null,
    },
    {
      id: 'accuracy', title: 'Accuracy per session',
      note: hx('The share of answers right in each of her latest sessions. A day with no answers (only passes or self-checks) has no reading: it is a gap, not 0.'),
      svg: accuracy.some((a) => a.accuracy !== null) ? lineGraph(accuracy.map((a) => ({
        label: shortDate(a.day), value: a.accuracy, tip: `${shortDate(a.day)}: ${a.accuracy === null ? 'no answers that day' : `${pct(a.accuracy)} right`}`,
      })), { max: 1, fmt: pct, title: 'Accuracy per session' }) : null,
    },
    {
      id: 'mastered', title: 'Words mastered, by unit',
      note: hx('Of the words in each unit, how many she has mastered in practice (the dark part of the bar). Each bar is labelled with its lessons; point at it for the name of its unit.'),
      legend: ([['graph-a', 'Mastered'], ['graph-a-light', 'Not yet']]),
      svg: units.some((u) => u.mastered > 0) ? barGraph(units.map((u) => ({
        label: u.from === u.to ? String(u.from) : `${u.from}–${u.to}`,
        parts: [
          { value: u.mastered, cls: 'graph-a', tip: `${u.name} (lessons ${u.from} to ${u.to}): ${u.mastered} of ${u.words} words mastered` },
          { value: u.words - u.mastered, cls: 'graph-a-light', tip: `${u.name} (lessons ${u.from} to ${u.to}): ${u.words - u.mastered} not yet` },
        ],
      })), { title: 'Words mastered, by unit' }) : null,
    },
    {
      id: 'new-words', title: 'New words read',
      note: hx('Real words read right in the Entrance Quest (the baseline) and each monthly check. Anchor words are the baseline\'s kind of word; new words are ones she has not practiced.'),
      legend: ([['graph-a', 'Anchor words'], ['graph-b', 'New words']]),
      svg: fresh.length > 0 ? barGraph(fresh.map((c) => ({
        label: c.label,
        parts: [
          { value: c.anchor, cls: 'graph-a', tip: `${c.label} (${shortDate(c.day)}): anchor words ${c.anchor === null ? 'none' : `${pct(c.anchor)} right`}` },
          { value: c.fresh, cls: 'graph-b', tip: `${c.label} (${shortDate(c.day)}): new words ${c.fresh === null ? 'none' : `${pct(c.fresh)} right`}` },
        ],
      })), { max: 1, fmt: pct, grouped: true, title: 'New words read: the baseline and each monthly check' }) : null,
    },
    {
      id: 'rereads', title: 'Reread speed (practiced text)',
      note: hx('Words per minute when she rereads a story page she has read before, timed by the co-pilot. Practiced text reads faster than new text; this is not the check\'s speed.'),
      svg: rereads.length > 0 ? lineGraph(rereads.map((r) => ({ label: shortDate(r.day), value: r.wpm, tip: `${shortDate(r.day)}: ${Math.round(r.wpm)} words a minute, practiced text` })),
        { title: 'Reread speed, practiced text, words per minute' }) : null,
    },
  ];
  if (pointer) {
    const low = Math.max(0, Math.min(...pointer.map((p) => p.lesson)) - 2);
    let high = Math.max(...pointer.map((p) => p.lesson)) + 2;
    if ((high - low) % 2 === 1) high += 1;
    graphs.push({
      id: 'pointer', title: 'Lesson pointer over time',
      note: hx('The lesson she was taught up to, from the day each change was saved.'),
      svg: lineGraph(pointer.map((p) => ({ label: shortDate(p.day), value: p.lesson, tip: `${shortDate(p.day)}: lesson ${p.lesson}` })),
        { min: low, max: high, step: true, title: 'Lesson pointer over time' }),
    });
  }
  return graphs;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'dashboard');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  const lock = createLock();
  const go = (name, p) => { lock.run(() => ctx.router.go(name, p)).catch((err) => console.warn(`The corner could not open "${name}"`, err)); };
  const students = typeof ctx.store?.students === 'function' ? ctx.store.students() : [];

  const switcher = h('div', { class: 'gu-row gu-switch', role: 'group', 'aria-label': 'Whose dashboard' });
  if (students.length > 1 && typeof ctx.useStudent === 'function') {
    Promise.all(students.map(async ( { id }) => {
      const name = (await readSaved(ctx.store.base, id)).profile.princessName.trim() || 'Student';
      const current = id === ctx.store.student;
      return h('button', { type: 'button', class: ['gu-button', current && 'gu-primary'], 'aria-pressed': current ? 'true' : 'false', 'data-student': id,
        onClick: () => {
          if (current) return;
          lock.run(async () => { await ctx.useStudent(id); await ctx.router.go('grownup/dashboard', { unlocked: true }); })
            .catch((err) => console.warn('The other student could not be opened', err));
        } }, name);
    })).then((buttons) => { switcher.replaceChildren(h('span', { class: 'gu-switch-label' }, 'Showing:'), ...buttons); })
      .catch((err) => console.error('The students could not be read', err));
  }

  const name = typeof ctx.profile?.princessName === 'string' ? ctx.profile.princessName.trim() : '';
  const graphs = dashboardGraphs({ profile: ctx.profile, states: ctx.states, content: ctx.content, day: ctx.day, hx });
  body.append(
    switcher,
    h('p', {}, hx(`${name ? `${name}'s` : 'Her'} practice at a glance, from what the game has saved. Only grown-ups see this page; nothing on it reaches her screen or her pages.`)),
    ...graphs.map((g) => h('section', { class: 'gu-setting gu-graph', 'data-graph': g.id },
      h('h2', { class: 'gu-setting-label' }, g.title),
      h('p', { class: 'gu-help' }, g.note),
      g.svg ? [
        g.legend ? h('p', { class: 'gu-legend' }, g.legend.map(([cls, words]) => h('span', { class: 'gu-legend-item' }, h('span', { class: `gu-legend-swatch ${cls}`, 'aria-hidden': 'true' }), words))) : null,
        svgNode(g.svg),
      ] : h('p', { class: 'gu-empty' }, 'Nothing to show yet.'))),
    h('section', { class: 'gu-setting', 'data-setting': 'links' },
      h('h2', { class: 'gu-setting-label' }, 'More for grown-ups'),
      h('div', { class: 'gu-row gu-links' }, DASHBOARD_LINKS.map(([screen, words]) => h('button', { type: 'button', class: 'gu-button', 'data-link': screen,
        onClick: () => go(`grownup/${screen}`, { unlocked: true }) }, words)))));
  return () => {};
}

function svgNode(markup) {
  const parsed = new globalThis.DOMParser().parseFromString(markup, 'image/svg+xml');
  return globalThis.document.importNode(parsed.documentElement, true);
}

import { hasShortIE } from '../curriculum/ie-nasal.js';
import { heartWordsKnownByUnit, unitOf } from '../curriculum/units.js';
import { checkColumns, practiceLine, practiceVsNew } from './check-table.js';
import { reportLetterLines } from './letters.js';

export const REPORT_DAYS = 28;
export const MIN_TRIES = 5;
export const PATTERNS_FROM = 35;
const TOP = 6;
const REREADS_SHOWN = 8;
const CHECKS_SHOWN = 3;

export const TUTOR_QUESTIONS = Object.freeze([
  'What does she say for each sound card, and which sounds does each card carry?',
  'Can she hear s and sh apart?',
  'Which sound cards are not yet mastered?',
  'What cue helps with short i and short e?',
  'Which heart words does she know?',
  'About how many lessons a week?',
]);
export const REPORT_FOOTER = Object.freeze([
  'Home practice, not a standardized test.',
  "Created to align with UFLI Foundations' scope and sequence; not endorsed by UFLI.",
]);


const of = (n, total) => `${n} of ${total}`;
const cell = (s) => (s.total > 0 ? of(s.correct, s.total) : '—');

export function tutorReport({ profile, states, content, settings, day }) {
  const from = day - REPORT_DAYS + 1;
  const inWindow = ( d) => Number.isFinite(d) && d >= from && d <= day;
  const sessions = (Array.isArray(profile?.sessions) ? profile.sessions : []).filter((s) => inWindow(s?.day));
  const taughtUpTo = settings.taughtUpTo;

  const words = (content?.words ?? []).filter((w) => w.real !== false);
  const mastered = ( key) => states.get(key)?.mastered === true;
  const counts = (list) => ({
    read: list.filter((w) => mastered(`w:${w.w}#read`)).length,
    spell: list.filter((w) => mastered(`w:${w.w}#spell`)).length,
    total: list.length,
  });
  const patterns = [];
  for (let lesson = PATTERNS_FROM; lesson <= taughtUpTo; lesson++) {
    const list = words.filter((w) => w.lesson === lesson);
    if (list.length > 0) patterns.push({ lesson, ...counts(list) });
  }
  const ie = counts(words.filter((w) => w.lesson >= PATTERNS_FROM && w.lesson <= taughtUpTo && hasShortIE(w.segs)));

  const segsOf = new Map([...(content?.words ?? []), ...(content?.nonsense ?? [])].map((w) => [w.w, w.segs]));
  const byWord = new Map();
  const byGrapheme = new Map();
  const tally = (map, key, miss) => {
    const t = map.get(key) ?? { tries: 0, misses: 0 };
    t.tries++;
    if (miss) t.misses++;
    map.set(key, t);
  };
  for (const [key, state] of states) {
    const m = /^[wn]:(.+)#(read|spell)$/.exec(key);
    if (!m) continue;
    const segs = segsOf.get(m[1]);
    for (const answer of state.hist ?? []) {
      if (!inWindow(answer.day)) continue;
      const miss = answer.correct !== true || answer.helped === true;
      tally(byWord, m[1], miss);
      for (const g of new Set((segs ?? []).map(([gr]) => gr))) tally(byGrapheme, g, miss);
    }
  }
  const worst = (list) => list.filter(([, t]) => t.misses > 0)
    .sort(([a, x], [b, y]) => y.misses / y.tries - x.misses / x.tries || y.misses - x.misses || a.localeCompare(b))
    .slice(0, TOP).map(([item, t]) => ({ item, ...t }));

  const instant = profile?.instant ?? {};
  const iwMastered = new Set([...states].filter(([key, s]) => key.startsWith('iw:') && s.mastered).map(([key]) => key.slice(3, key.lastIndexOf('#'))));

  const columns = checkColumns(profile ?? {}, content?.checks);
  const baseline = columns.filter((c) => c.kind === 'baseline');
  const checks = columns.filter((c) => c.kind === 'check');
  const rereads = (Array.isArray(profile?.rereads) ? profile.rereads : []).slice(-REREADS_SHOWN);
  const blinks = (Array.isArray(profile?.flash) ? profile.flash : []).filter((f) => f.day >= from && f.day <= day);
  const flash = blinks.length > 0 ? { first: blinks.reduce((n, f) => n + f.first, 0), shown: blinks.reduce((n, f) => n + f.shown, 0) } : null;
  return {
    from, to: day,
    glance: {
      taughtUpTo,
      unit: unitOf(taughtUpTo)?.name ?? null,
      spellTier: profile?.spellTier ?? 1,
      sessions: sessions.length,
      minutes: Math.round(sessions.reduce((n, s) => n + (Number.isFinite(s.minutes) ? s.minutes : 0), 0)),
      withGrownUp: sessions.filter((s) => s.copilot === true).length,
      partPlayed: sessions.filter((s) => s.complete === false).length,
    },
    checks: { columns: [...baseline, ...checks.slice(-CHECKS_SHOWN)], any: checks.length > 0, practice: practiceVsNew(profile ?? {}, content ?? {}, states) },
    patterns, ie,
    look: {
      graphemes: worst([...byGrapheme].filter(([, t]) => t.tries >= MIN_TRIES)),
      words: worst([...byWord]),
    },
    heart: {
      known: Object.values(instant).filter((s) => s === 'known').length,
      byUnit: heartWordsKnownByUnit(instant),
      mastered: iwMastered.size,
      learning: Object.keys(instant).filter((w) => instant[w] === 'learning').sort(),
    },
    cards: { learning: (profile?.deck ?? []).filter((c) => c?.status === 'learning').map((c) => c.g), sSh: settings.sShContrast === true },
    letters: reportLetterLines(content ?? {}, profile ?? {}, states, day),
    rereads,
    flash,
  };
}


const dateOf = (day) => new Date(day * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
const shortOf = (day) => new Date(day * 86400000).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function reportSections(r) {
  const g = r.glance;
  const sections = [
    { title: 'At a glance', lines: [
      `Taught up to lesson ${g.taughtUpTo}${g.unit ? ` (${g.unit})` : ''}. Spelling tier ${g.spellTier}.`,
      `Last 4 weeks: ${g.sessions} sessions, ${g.minutes} active minutes, ${g.withGrownUp} with a grown-up beside her, ${g.partPlayed} part-played.`,
    ] },
  ];
  const cols = r.checks.columns;
  sections.push(r.checks.any ? {
    title: 'New words (monthly check)',
    table: {
      head: ['', ...cols.map((c) => (c.kind === 'baseline' ? `Baseline ${shortOf(c.day)}` : `Check ${ (c.index) + 1} ${shortOf(c.day)}`))],
      rows: [
        ['Real, anchor', ...cols.map((c) => cell(c.real.anchor))],
        ['Real, new', ...cols.map((c) => (c.kind === 'baseline' ? '—' : cell(c.real.new)))],
        ['Made-up, anchor', ...cols.map((c) => cell(c.nonsense.anchor))],
        ['Made-up, new', ...cols.map((c) => (c.kind === 'baseline' ? '—' : cell(c.nonsense.new)))],
        ['Spelled, anchor', ...cols.map((c) => cell(c.spelled.anchor))],
        ['Spelled, new', ...cols.map((c) => (c.kind === 'baseline' ? '—' : cell(c.spelled.new)))],
        ['Passage', ...cols.map((c) => (c.passage.stopped ? 'not timed' : c.passage.wcpm == null ? 'not read' : `${c.passage.wcpm} wcpm, ${c.passage.errors ?? 0} missed`))],
      ],
    },
    lines: [...r.checks.practice.map(practiceLine), 'Only anchor rows trend. Words never practiced: a gap means remembering, not decoding.'],
  } : { title: 'New words (monthly check)', lines: ['Not yet: the first monthly check comes 28 days after the Entrance Quest.'] });
  sections.push({
    title: `Patterns, lessons ${PATTERNS_FROM} to ${g.taughtUpTo}`,
    table: { head: ['Lesson', 'Read', 'Spelled'], rows: [
      ...r.patterns.map((p) => [String(p.lesson), `${p.read}/${p.total}`, `${p.spell}/${p.total}`]),
      ['i and e', `${r.ie.read}/${r.ie.total}`, `${r.ie.spell}/${r.ie.total}`],
    ] },
    lines: ["Words mastered, read and spelled, of each lesson's words. \"i and e\": the words with short i or e."],
  });
  sections.push({ title: 'What to look at, last 4 weeks', lines: [
    r.look.graphemes.length > 0 ? `Sounds: ${r.look.graphemes.map((x) => `${x.item} (${x.misses} of ${x.tries} missed)`).join(', ')}.` : `Sounds: none missed in ${MIN_TRIES} or more tries.`,
    r.look.words.length > 0 ? `Words: ${r.look.words.map((x) => `${x.item} (${x.misses} of ${x.tries})`).join(', ')}.` : 'Words: none missed.',
  ] });
  sections.push({ title: 'Heart and instant words', lines: [
    `Known on her list: ${r.heart.known}. Mastered in play: ${r.heart.mastered}.`,
    ...(r.heart.byUnit.length > 0 ? [`Known by unit: ${r.heart.byUnit.map((u) => `${u.name} ${u.known}`).join('; ')}.`] : []),
    `Still learning: ${r.heart.learning.length > 0 ? r.heart.learning.join(', ') : 'none'}.`,
  ] });
  sections.push({ title: 'Sound cards', lines: [
    `Still learning: ${r.cards.learning.length > 0 ? r.cards.learning.join(', ') : 'none'}.`,
    `s and sh listening: ${r.cards.sSh ? 'on' : 'off'}.`,
  ] });
  if (r.letters.length > 0) sections.push({ title: 'Letter writing', lines: r.letters });
  sections.push({ title: 'Reread speed (practiced text)', lines: [
    r.rereads.length > 0 ? r.rereads.map((x) => `${shortOf(x.day)}: ${x.wpm}`).join(', ') + ' words per minute.' : 'No timed rereads yet.',
    'A story she has read before, so this is not the check.',
    ...(r.flash ? [`Kitty's blink game: read at first look, ${r.flash.first} of ${r.flash.shown}.`] : []),
  ] });
  sections.push({ title: 'For the tutor', lines: [...TUTOR_QUESTIONS], blank: ['Taught up to: ____', 'Notes: ____', '____', '____'] });
  return sections;
}

export function reportCsv(r, hx = (text) => text) {
  const rows = [['section', 'item', 'value'], ['Report', 'From', dateOf(r.from)], ['Report', 'To', dateOf(r.to)]];
  for (const s of reportSections(r)) {
    if (s.table) {
      for (const row of s.table.rows) row.slice(1).forEach((value, i) => rows.push([s.title, `${row[0]}${s.table && s.table.head[i + 1] ? `, ${s.table.head[i + 1]}` : ''}`, value]));
    }
    (s.lines ?? []).forEach((line, i) => rows.push([s.title, String(i + 1), hx(line)]));
  }
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return `${rows.map((row) => row.map(q).join(',')).join('\r\n')}\r\n`;
}

export const reportDates = (r) => `${dateOf(r.from)} to ${dateOf(r.to)}`;

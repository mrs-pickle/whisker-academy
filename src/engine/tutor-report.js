import { hasShortIE } from '../curriculum/ie-nasal.js';
import { heartWordsKnownByUnit, unitOf } from '../curriculum/units.js';
import { checkColumns, practiceLine, practiceVsNew } from './check-table.js';
import { reportLetterLines } from './letters.js';
import { assessmentReport, ITEM_KINDS } from './assessment-report.js';
import { missedPatterns, slipSummary } from './slips.js';

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
  const weeks = [];
  for (let start = from; start <= day; start += 7) {
    const end = Math.min(start + 6, day);
    const these = sessions.filter((s) => s.day >= start && s.day <= end);
    const scored = these.filter((s) => Number.isFinite(s.accuracy));
    weeks.push({
      from: start, to: end, sessions: these.length,
      minutes: Math.round(these.reduce((n, s) => n + (Number.isFinite(s.minutes) ? s.minutes : 0), 0)),
      accuracy: scored.length > 0 ? scored.reduce((n, s) => n + s.accuracy, 0) / scored.length : null,
    });
  }
  return {
    from, to: day,
    days: new Set(sessions.map((s) => s.day)).size,
    weeks,
    taught: counts(words.filter((w) => Number.isFinite(w.lesson) && w.lesson <= taughtUpTo)),
    deckSize: (profile?.deck ?? []).length,
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
    slips: slipSummary(profile?.slips, from, day),
    assessment: assessmentReport(profile, content),
    missed: missedPatterns(states, content, from, day),
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
  sections.push({ title: 'Where she slips, last 4 weeks', lines: r.slips.length > 0 ? [
    ...r.slips.map((s) => `${s.label}: ${s.count}${s.examples.length > 0 ? ` (${s.examples.join('; ')})` : ''}.`),
    'Counted where she picked a letter or a word. A word read aloud and missed is not counted here.',
  ] : ['None recorded yet. Slips are counted where she picks a letter or a word, from this version of the game on.'] });
  sections.push({ title: 'Words missed that contain…, last 4 weeks', lines: [
    ...r.missed.map((m) => `With ${m.label}: ${m.missed} of ${m.practiced} words${m.examples.length > 0 ? ` (${m.examples.join(', ')})` : ''}.`),
    'From her practice history, reading and spelling: what the missed words have in them, not why she missed them.',
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
    const title = hx(s.title);
    if (s.table) {
      for (const row of s.table.rows) row.slice(1).forEach((value, i) => rows.push([title, `${row[0]}${s.table && s.table.head[i + 1] ? `, ${s.table.head[i + 1]}` : ''}`, value]));
    }
    (s.lines ?? []).forEach((line, i) => rows.push([title, String(i + 1), hx(line)]));
  }
  const q = (v) => (/[",\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v);
  return `${rows.map((row) => row.map(q).join(',')).join('\r\n')}\r\n`;
}

export const reportDates = (r) => `${dateOf(r.from)} to ${dateOf(r.to)}`;


export const PRINT_TITLE = 'Reading Progress Report';
export const PRINT_SUBTITLE = 'Home practice summary — reading game';
export const DEFAULT_REASON = "Summary of home reading practice in the reading game, for the student's reading tutor.";
export const CLOSING_LINE = "This report summarizes home practice in a reading game. It describes the practice record and the game's own short assessment; it is not a standardized test.";
export const KEEP_TOGETHER_ROWS = 18;
const LESSON_ROWS = 12;
export const FEW_MASTERED = 5;
const RECOMMENDATIONS = 6;
const NOTE_LINES = 6;

export const SLIP_FOCUS = Object.freeze({
  bd: 'b and d: a short warm-up sorting b and d words, with the cue the tutor already uses, then b and d words mixed in reading and spelling.',
  cs: 'c, ck and s: hard c and ck words beside s words, saying the sound each spelling makes before reading the word.',
  ending: 'The last sound: touching each letter through to the end of the word before answering, and word chains that change only the final sound.',
  blend: 'Blends: tapping each sound of a blend (b-l in black) when building and reading words, and word chains that add or drop one blend letter.',
  lookalike: 'Look-alike words (from and for, the and they, his and this, went and what): reading them in pairs and in short phrases.',
});


const pct = (x) => `${Math.round(x * 100)}%`;
const andList = (list) => (list.length <= 1 ? list.join('') : `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const longDate = (text) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return text;
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
};
const fullOf = (day) => new Date(day * 86400000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export const statusOf = (n, total) => (total <= 0 ? 'Not yet practiced' : n / total >= 0.8 ? 'Secure' : n / total >= 0.5 ? 'Developing' : 'Learning');

export function accuracyTrend(r) {
  const scored = r.weeks.filter((w) => w.accuracy !== null);
  if (scored.length === 0) return null;
  const first = (scored[0].accuracy), last = (scored.at(-1)?.accuracy);
  const weighted = scored.reduce((n, w) => n + (w.accuracy) * w.sessions, 0) / scored.reduce((n, w) => n + w.sessions, 0);
  const way = scored.length === 1 ? 'one' : last - first >= 0.05 ? 'up' : first - last >= 0.05 ? 'down' : 'steady';
  return { first, last, average: weighted, way };
}

export function recommendations(r) {
  const out = [];
  const slips = [...r.slips].filter((s) => s.kind !== 'other' && Object.hasOwn(SLIP_FOCUS, s.kind)).sort((a, b) => b.count - a.count);
  for (const s of slips.slice(0, 2)) out.push( (SLIP_FOCUS)[s.kind]);
  if (r.look.graphemes.length > 0) {
    const top = r.look.graphemes.slice(0, 3).map((g) => g.item);
    out.push(`Sounds most often missed in practice (${andList(top)}): a quick daily review of these sound cards, then words that contain them.`);
  }
  const lag = r.patterns.filter((p) => p.total > 0 && p.read - p.spell >= Math.max(2, p.total * 0.25)).map((p) => String(p.lesson));
  if (lag.length > 0) out.push(`Spelling is behind reading for ${lag.length === 1 ? 'lesson' : 'lessons'} ${andList(lag.slice(0, 4))}: a few dictated words from ${lag.length === 1 ? 'that lesson' : 'those lessons'} each session.`);
  const started = r.taught.read + r.taught.spell >= FEW_MASTERED;
  if (started && r.ie.total >= 4 && r.ie.read / r.ie.total < 0.6) out.push(`Short i and short e: ${r.ie.read} of ${r.ie.total} such words mastered for reading. Listening for the middle vowel, with the cue the tutor prefers.`);
  const swaps = r.assessment.records.flatMap((x) => x.vowelSwaps);
  if (swaps.length > 0) out.push(`Vowels in spelling (the assessment's dictation: ${swaps.slice(0, 2).map((x) => `${x.word} → ${x.built.join(' ')}`).join('; ')}): saying the word slowly and listening for the vowel before choosing its letter.`);
  if (r.cards.learning.length > 0) out.push(`Sound cards still learning (${andList(r.cards.learning.slice(0, 6))}): keep them in the daily card drill.`);
  if (r.heart.learning.length > 0) out.push(`Heart words still learning (${andList(r.heart.learning.slice(0, 6))}): read them in short phrases.`);
  if (r.glance.sessions < 12) out.push('Practice: about four short sessions a week keeps the review schedule on track.');
  const confirm = `Tutor to confirm the lesson the game should be set to (now lesson ${r.glance.taughtUpTo}).`;
  return [...out.slice(0, RECOMMENDATIONS - 1), confirm];
}

export function printReport(r, meta = {}) {
  const g = r.glance;
  const trend = accuracyTrend(r);
  const lesson = `Lesson ${g.taughtUpTo}${g.unit ? ` (${g.unit})` : ''}`;
  const ident = [
    { label: 'Name', value: meta.name || null },
    { label: 'Date of Birth', value: meta.dob ? longDate(meta.dob) : null },
    { label: 'Report Period', value: reportDates(r) },
    { label: 'Date of Report', value: fullOf(r.to) },
    { label: 'Current Lesson', value: lesson },
  ];
  const sections = [];
  let n = 1;

  sections.push({ heading: 'Reason for Report', blocks: [{ kind: 'p', text: meta.reason || DEFAULT_REASON }] });

  const avgMinutes = g.sessions > 0 ? Math.round(g.minutes / g.sessions) : 15;
  sections.push({ heading: 'Background', blocks: [{ kind: 'p', text: [
    "The reading game follows the tutor's lesson sequence one lesson at a time, practicing only what has been taught; the grown-up sets the lesson the tutor has reached.",
    `Sessions are short, about ${avgMinutes} active minutes, and mix sound cards, reading and spelling words, heart words and short stories.`,
    'A grown-up sits nearby as co-pilot to listen to reading aloud and mark it. Words come back on a review schedule until they are mastered.',
    g.sessions > 0
      ? `In the four weeks of this report she practiced in ${plural(g.sessions, 'session')} on ${plural(r.days, 'day')}, ${g.withGrownUp} of them with a grown-up beside her.`
      : 'No sessions were recorded in the four weeks of this report.',
  ].join(' ') }] });

  const assess = assessmentBlocks(r, () => n++);
  if (assess.length > 0) sections.push({ heading: 'Starting Assessment', blocks: assess });

  const summary = [];
  summary.push({ kind: 'table', caption: `Table ${n++}. Practice activity, last 4 weeks`, widths: [55, 45], head: ['Measure', 'Result'], rows: [
    ['Sessions', g.sessions > 0 ? `${g.sessions} on ${plural(r.days, 'day')}` : 'None recorded'],
    ['Active minutes', g.sessions > 0 ? `${g.minutes} (about ${avgMinutes} per session)` : '0'],
    ['With a grown-up beside her', `${g.withGrownUp} of ${g.sessions}`],
    ['Sessions left part-way', String(g.partPlayed)],
    ['Current lesson', lesson],
    ['Spelling tier', `${g.spellTier} of 4`],
    ...(trend ? [['Accuracy in practice (average)', pct(trend.average)]] : []),
  ] });
  const weekly = r.weeks.filter((w) => w.accuracy !== null).length >= 2;
  if (weekly) {
    summary.push({ kind: 'table', caption: `Table ${n++}. Accuracy by week`, widths: [40, 20, 20, 20], head: ['Week', 'Sessions', 'Minutes', 'Accuracy'],
      rows: r.weeks.map((w) => [`${shortOf(w.from)} – ${shortOf(w.to)}`, String(w.sessions), String(w.minutes), w.accuracy === null ? '—' : pct(w.accuracy)]),
      note: 'Accuracy is the share of answers right without help in each session, averaged over the week.' });
  }
  const words = r.patterns.length <= LESSON_ROWS
    ? r.patterns.map((p) => [`Lesson ${p.lesson}`, `${p.read} of ${p.total}`, `${p.spell} of ${p.total}`])
    : unitRows(r.patterns);
  if (r.taught.read + r.taught.spell < FEW_MASTERED) {
    summary.push({ kind: 'p', label: 'Words mastered', text: `of ${plural(r.taught.total, 'taught word')}, ${r.taught.read} ${r.taught.read === 1 ? 'is' : 'are'} mastered yet for reading and ${r.taught.spell} for spelling; mastery needs correct answers on separate days.` });
  } else summary.push({ kind: 'table', caption: `Table ${n++}. Words mastered`, widths: [50, 25, 25], head: ['Words', 'Reading', 'Spelling'], rows: [
    ...words,
    ...(r.ie.total > 0 ? [['Words with short i or e', `${r.ie.read} of ${r.ie.total}`, `${r.ie.spell} of ${r.ie.total}`]] : []),
    ['All taught words', `${r.taught.read} of ${r.taught.total}`, `${r.taught.spell} of ${r.taught.total}`],
  ], note: `${r.patterns.length > 0 ? `${r.patterns.length <= LESSON_ROWS ? 'One row per lesson' : 'By unit'} from lesson ${PATTERNS_FROM}; the last row counts every taught word.` : 'Every word taught so far.'} A word counts as mastered once the review schedule has seen it right on separate days.` });
  summary.push({ kind: 'table', caption: `Table ${n++}. Heart words and sound cards`, widths: [45, 55], head: ['Area', 'Result'], rows: [
    ['Heart words known (her list)', String(r.heart.known)],
    ['Heart words mastered in play', String(r.heart.mastered)],
    ['Heart words still learning', r.heart.learning.length > 0 ? r.heart.learning.join(', ') : 'None'],
    ['Sound cards', `${r.deckSize - r.cards.learning.length} of ${r.deckSize} mastered`],
    ['Sound cards still learning', r.cards.learning.length > 0 ? r.cards.learning.join(', ') : 'None'],
    ['Listening for s and sh', r.cards.sSh ? 'On' : 'Off'],
  ] });
  if (r.checks.any) {
    const cols = r.checks.columns;
    summary.push({ kind: 'table', caption: `Table ${n++}. Monthly check (new words)`, head: ['', ...cols.map((c) => (c.kind === 'baseline' ? `Baseline ${shortOf(c.day)}` : `Check ${ (c.index) + 1} ${shortOf(c.day)}`))], rows: [
      ['Real words, anchor', ...cols.map((c) => cell(c.real.anchor))],
      ['Real words, new', ...cols.map((c) => (c.kind === 'baseline' ? '—' : cell(c.real.new)))],
      ['Made-up words, anchor', ...cols.map((c) => cell(c.nonsense.anchor))],
      ['Made-up words, new', ...cols.map((c) => (c.kind === 'baseline' ? '—' : cell(c.nonsense.new)))],
      ['Spelled, anchor', ...cols.map((c) => cell(c.spelled.anchor))],
      ['Spelled, new', ...cols.map((c) => (c.kind === 'baseline' ? '—' : cell(c.spelled.new)))],
      ['Passage', ...cols.map((c) => (c.passage.stopped ? 'not timed' : c.passage.wcpm == null ? 'not read' : `${c.passage.wcpm} wcpm, ${c.passage.errors ?? 0} missed`))],
    ], note: ['Only anchor rows trend; new words have never been practiced.', ...r.checks.practice.map(practiceLine)].join(' ') });
  } else {
    summary.push({ kind: 'p', label: 'Monthly check', text: 'not yet taken. The first comes 28 days after the starting assessment.' });
  }
  if (r.rereads.length > 0) {
    summary.push({ kind: 'table', caption: `Table ${n++}. Reread speed (practiced text)`, widths: [50, 50], head: ['Date', 'Words per minute'],
      rows: r.rereads.map((x) => [shortOf(x.day), String(x.wpm)]),
      note: `A story she has read before, timed by the grown-up, so this is fluency on familiar text, not the check.${r.flash ? ` Quick-look word game: read at first look, ${r.flash.first} of ${r.flash.shown}.` : ''}` });
  } else {
    summary.push({ kind: 'p', label: 'Reread speed', text: `no timed rereads recorded yet.${r.flash ? ` Quick-look word game: read at first look, ${r.flash.first} of ${r.flash.shown}.` : ''}` });
  }
  if (r.letters.length > 0) summary.push({ kind: 'p', label: 'Letter writing', text: r.letters.join(' ') });
  sections.push({ heading: 'Practice Summary', blocks: summary });

  const errors = [];
  const slipTotal = r.slips.reduce((t, s) => t + s.count, 0);
  if (r.slips.length > 0) {
    errors.push({ kind: 'table', caption: `Table ${n++}. Where she slips, last 4 weeks`, widths: [28, 12, 60], head: ['Slip type', 'Count', 'Example words (what she picked)'],
      rows: [...r.slips].sort((a, b) => b.count - a.count).map((s) => [s.label, String(s.count), s.examples.join('; ') || '—']) });
    const ranked = [...r.slips].sort((a, b) => b.count - a.count);
    const [top, next] = ranked;
    errors.push({ kind: 'p', text: [
      `Of ${plural(slipTotal, 'recorded slip')}, the most frequent was ${top.label.toLowerCase()} (${top.count})${next ? `, followed by ${next.label.toLowerCase()} (${next.count})` : ''}.`,
      'A slip is counted only where she chose a letter or a word on screen, so the game knows what she picked; a word read aloud and missed is not counted here.',
    ].join(' ') });
  } else {
    errors.push({ kind: 'p', label: 'Where she slips', text: 'no slips recorded in these four weeks. Slips are counted where she chooses a letter or a word on screen.' });
  }
  const aSlips = r.assessment.slips;
  if (aSlips.length > 0) {
    errors.push({ kind: 'table', caption: `Table ${n++}. Slips in the starting assessment`, widths: [28, 12, 60], head: ['Slip type', 'Count', 'Example words (what she picked or built)'],
      rows: [...aSlips].sort((a, b) => b.count - a.count).map((s) => [s.label, String(s.count), s.examples.join('; ')]),
      note: 'From the assessment only, kept apart from practice: a sound card or a heard word she picked, and the letters of each dictated word she built (sorted letter by letter when she built as many letters as the word has).' });
  }
  const fromAssessment = new Map(r.assessment.missed.map((a) => [a.id, a]));
  const assessed = r.assessment.records.length > 0 && r.assessment.missed.some((a) => a.missed > 0);
  const missed = r.missed.filter((m) => m.missed > 0 || (assessed && (fromAssessment.get(m.id)?.missed ?? 0) > 0));
  const practiceMissed = missed.some((m) => m.missed > 0);
  const assessLine = () => {
    const top = r.assessment.missed.filter((a) => a.missed > 0).sort((a, b) => b.missed - a.missed || a.tried - b.tried)[0];
    if (!assessed || !top) return '';
    return `In the starting assessment, missed words most often contained ${r.missed.find((m) => m.id === top.id)?.label ?? top.id} (${top.missed} of ${top.tried}).`;
  };
  if (practiceMissed || assessed) {
    const examples = (m) => [...m.examples, ...(fromAssessment.get(m.id)?.examples ?? []).filter((w) => !m.examples.includes(w)).map((w) => `${w} (A)`)].slice(0, 7).join(', ') || '—';
    errors.push({ kind: 'table', caption: `Table ${n++}. Words missed that contain…`, widths: assessed ? [30, 12, 12, 14, 32] : [36, 14, 14, 36],
      head: ['Pattern in the word', 'Missed in practice', 'Practiced', ...(assessed ? ['Missed in assessment'] : []), 'Examples'],
      rows: missed.map((m) => { const a = fromAssessment.get(m.id); return [m.label, String(m.missed), String(m.practiced), ...(assessed ? [a && a.tried > 0 ? `${a.missed} of ${a.tried}` : '—'] : []), examples(m)]; }),
      note: `Practice: the last 4 weeks.${assessed ? ' Assessment: its real words read and spelled; (A) marks a word missed there.' : ''}` });
  }
  if (practiceMissed) {
    const share = missed.filter((m) => m.missed > 0).map((m) => ({ ...m, share: m.practiced >= MIN_TRIES ? m.missed / m.practiced : -1 }))
      .sort((a, b) => b.share - a.share || b.missed - a.missed);
    const few = Math.max(...missed.map((m) => m.practiced)) < 2 * MIN_TRIES;
    errors.push({ kind: 'p', text: [
      few ? 'Only a few words have been practiced in these four weeks, so these counts are small and show no pattern yet.'
        : `Missed words most often contained ${share[0].label} (${share[0].missed} of ${share[0].practiced} such words missed at least once).`,
      'This comes from her practice history in reading and spelling.',
      assessLine(),
      'It shows what the missed words have in them, not why they were missed; a word can sit in more than one row.',
    ].filter(Boolean).join(' ') });
  } else if (assessed) {
    errors.push({ kind: 'p', text: `No practiced word was missed in these four weeks${r.missed.some((m) => m.practiced > 0) ? '' : ' (none practiced yet)'}. ${assessLine()} This shows what the missed words have in them, not why they were missed.` });
  } else {
    errors.push({ kind: 'p', label: 'Words missed that contain…', text: missed.length > 0 ? 'no practiced word was missed in these four weeks.' : 'no words practiced in these four weeks.' });
  }
  if (r.look.graphemes.length > 0 || r.look.words.length > 0) {
    errors.push({ kind: 'table', caption: `Table ${n++}. Sounds and words most often missed, last 4 weeks`, widths: [22, 78], head: ['Area', 'Missed of tries'], rows: [
      ...(r.look.graphemes.length > 0 ? [['Sounds', r.look.graphemes.map((x) => `${x.item} (${x.misses} of ${x.tries})`).join(', ')]] : []),
      ...(r.look.words.length > 0 ? [['Words', r.look.words.map((x) => `${x.item} (${x.misses} of ${x.tries})`).join(', ')]] : []),
    ], note: `A sound shows only after ${MIN_TRIES} or more tries, so one slip is not a pattern. Help counts as a miss.` });
  }
  sections.push({ heading: 'Patterns in Errors', blocks: errors });

  const parts = [];
  if (g.sessions > 0) parts.push(`Over the four weeks from ${dateOf(r.from)} to ${dateOf(r.to)}, she practiced in ${plural(g.sessions, 'session')} (${g.minutes} active minutes), working at lesson ${g.taughtUpTo}${g.unit ? `, ${g.unit.toLowerCase()}` : ''}.`);
  else parts.push(`No practice sessions were recorded from ${dateOf(r.from)} to ${dateOf(r.to)}; the game is set to lesson ${g.taughtUpTo}.`);
  if (trend) {
    parts.push(trend.way === 'one' ? `Accuracy was ${pct(trend.average)}.`
      : `Accuracy averaged ${pct(trend.average)}, ${trend.way === 'up' ? `rising from ${pct(trend.first)} to ${pct(trend.last)}` : trend.way === 'down' ? `lower in the last week (${pct(trend.last)}) than the first (${pct(trend.first)})` : 'steady across the weeks'}.`);
  }
  const latest = r.assessment.records.at(-1);
  if (latest) parts.push(`On the ${latest.first ? 'starting assessment' : 'latest assessment'} (${dateOf(latest.day)}) she read ${latest.real.correct} of ${latest.real.total} real words and ${latest.nonsense.correct} of ${latest.nonsense.total} made-up words${latest.suggested !== null ? `, and lesson ${latest.suggested} was suggested` : ''}.`);
  if (r.taught.total > 0) parts.push(`Of ${r.taught.total} taught words, ${r.taught.read} are mastered for reading and ${r.taught.spell} for spelling.`);
  parts.push(`${plural(r.heart.known, 'heart word')} ${r.heart.known === 1 ? 'is' : 'are'} known${r.cards.learning.length > 0 ? `, and ${plural(r.cards.learning.length, 'sound card')} ${r.cards.learning.length === 1 ? 'is' : 'are'} still being learned` : ', and every sound card is mastered'}.`);
  if (r.slips.length > 0) parts.push(`Recorded slips were most often ${[...r.slips].sort((a, b) => b.count - a.count)[0].label.toLowerCase()}.`);
  const profile = [
    ['Sound cards', r.cards.learning.length > 0 ? `Learning: ${r.cards.learning.join(', ')}` : 'Secure'],
    ...(!(r.taught.read + r.taught.spell >= FEW_MASTERED) ? [['Words mastered', 'Too early to tell: practice has just begun']] : []),
    ...(r.patterns.length > 0 && r.taught.read + r.taught.spell >= FEW_MASTERED ? [
      [`Reading words, lessons ${PATTERNS_FROM}–${g.taughtUpTo}`, statusOf(sum(r.patterns, 'read'), sum(r.patterns, 'total'))],
      [`Spelling words, lessons ${PATTERNS_FROM}–${g.taughtUpTo}`, statusOf(sum(r.patterns, 'spell'), sum(r.patterns, 'total'))],
    ] : []),
    ...(r.ie.total > 0 && r.taught.read + r.taught.spell >= FEW_MASTERED ? [['Short i and short e', statusOf(r.ie.read, r.ie.total)]] : []),
    ['Heart words', r.heart.learning.length > 0 ? `Learning: ${plural(r.heart.learning.length, 'word')}` : r.heart.known > 0 ? 'Secure' : 'Not yet practiced'],
    ...(trend ? [['Accuracy in practice', statusOf(trend.average, 1)]] : []),
    ...(r.letters.length > 0 ? [['Letter writing', 'Learning print']] : []),
  ];
  sections.push({ heading: 'Summary', blocks: [
    { kind: 'p', text: parts.join(' ') },
    { kind: 'table', caption: 'Profile', widths: [55, 45], head: ['Area', 'Status'], rows: profile,
      note: 'Secure: 80% or more mastered. Developing: 50 to 79%. Learning: under 50%. Measured against her own practice only.' },
  ] });

  sections.push({ heading: 'Recommendations / Focus for Next Weeks', blocks: [{ kind: 'ol', items: recommendations(r) }] });
  sections.push({ heading: 'Notes for the Tutor', blocks: [
    { kind: 'ul', label: 'Questions from home', items: [...TUTOR_QUESTIONS] },
    { kind: 'ruled', lines: ['Taught up to lesson:'], count: NOTE_LINES },
  ] });

  return {
    title: PRINT_TITLE,
    subtitle: PRINT_SUBTITLE,
    ident,
    sections,
    closing: CLOSING_LINE,
    preparedBy: meta.preparedBy || null,
    footer: [...REPORT_FOOTER],
  };
}


const sum = (list, field) => list.reduce((t, x) => t + x[field], 0);

function unitRows(patterns) {
  const units = new Map();
  for (const p of patterns) {
    const u = unitOf(p.lesson);
    const key = u?.id ?? String(p.lesson);
    const t = units.get(key) ?? { name: u?.name ?? `Lesson ${p.lesson}`, from: p.lesson, to: p.lesson, read: 0, spell: 0, total: 0 };
    t.to = p.lesson;
    t.read += p.read; t.spell += p.spell; t.total += p.total;
    units.set(key, t);
  }
  return [...units.values()].map((u) => [`${u.name} (${u.from === u.to ? `lesson ${u.from}` : `lessons ${u.from}–${u.to}`})`, `${u.read} of ${u.total}`, `${u.spell} of ${u.total}`]);
}

const ofScore = (x) => (x.total > 0 ? `${x.correct} of ${x.total}` : 'not given');

export function assessmentBlocks(r, next) {
  const records = r.assessment.records;
  const out = [];
  records.forEach((a, i) => {
    const name = records.length > 1 ? (i === 0 ? 'First assessment' : 'Latest assessment') : 'Assessment';
    const set = a.before !== null && a.set === a.before && !a.first ? `lesson kept at ${a.set}` : `lesson set: ${a.set}`;
    out.push({ kind: 'p', label: name, text: `given ${fullOf(a.day)}. ${a.suggested !== null ? `Lesson suggested: ${a.suggested}; ${set}.` : `Lesson set: ${a.set}.`}` });
    out.push({ kind: 'table', caption: `Table ${next()}. ${name} scores`, widths: [55, 45], head: ['Measure', 'Result'], rows: [
      ['Real words read', ofScore(a.real)],
      ['Made-up words read', ofScore(a.nonsense)],
      ['Dictation (words spelled)', ofScore(a.dictationScore)],
      ['Story passage', a.passage ? `${a.passage.wcpm ?? '\u2014'} words correct per minute, ${plural(a.passage.errors ?? 0, 'error')}` : 'not read'],
    ] });
    if (a.dictation.length > 0) {
      out.push({ kind: 'table', caption: `Table ${next()}. ${name}: dictation`, widths: [30, 45, 25], head: ['Word', 'What she built', 'Result'],
        rows: a.dictation.map((x) => [x.word, x.built ? x.built.join(' ') : 'not kept', x.correct ? 'Correct' : 'Missed']) });
    }
    if (a.items.length > 0) {
      const show = (x) => `${x.text} (${ (ITEM_KINDS)[x.type] ?? x.type}${x.picked !== undefined && x.picked !== x.text ? `, picked ${x.picked}` : ''})`;
      const right = a.items.filter((x) => x.correct), wrong = a.items.filter((x) => !x.correct);
      out.push({ kind: 'table', caption: `Table ${next()}. ${name}: items by result`, widths: [22, 10, 68], head: ['Result', 'Count', 'Items'], rows: [
        ['Read correctly', String(right.length), right.map(show).join(', ') || '\u2014'],
        ['Missed', String(wrong.length), wrong.map(show).join(', ') || '\u2014'],
      ], note: 'Each item is read aloud, a word heard and picked from three, a made-up word, a phrase, or the letters picked for a sound card; a pick shows what she chose.' });
    }
    out.push({ kind: 'p', text: assessmentReading(a) });
  });
  return out;
}

export function assessmentReading(a) {
  const parts = [];
  const rate = ( x) => x.correct / x.total;
  if (a.real.total > 0 && a.nonsense.total > 0) {
    const d = rate(a.nonsense) - rate(a.real);
    parts.push(Math.abs(d) < 0.15 ? `Real and made-up words were read about equally well (${ofScore(a.real)} and ${ofScore(a.nonsense)}).`
      : d > 0 ? `Made-up words were read more accurately (${ofScore(a.nonsense)}) than real words (${ofScore(a.real)}).`
        : `Real words were read more accurately (${ofScore(a.real)}) than made-up words (${ofScore(a.nonsense)}).`);
  } else if (a.real.total > 0) parts.push(`Real words read: ${ofScore(a.real)}.`);
  if (a.dictation.length > 0) {
    const missed = a.dictation.filter((x) => !x.correct);
    parts.push(missed.length === 0 ? `Every dictated word was spelled correctly (${ofScore(a.dictationScore)}).`
      : `In dictation, ${ofScore(a.dictationScore)} ${a.dictationScore.correct === 1 ? 'word was' : 'words were'} spelled correctly${a.vowelSwaps.length > 0
        ? `; ${a.vowelSwaps.length === missed.length ? (missed.length === 1 ? 'the missed word had' : 'each missed word had') : `${a.vowelSwaps.length} of the ${missed.length} missed had`} a different vowel (${a.vowelSwaps.map((x) => `${x.word} \u2192 ${x.built.join(' ')}`).join('; ')})` : ''}.`);
  }
  if (a.passage && a.passage.wcpm !== null) parts.push(`On the story passage she read ${a.passage.wcpm} words correct per minute with ${plural(a.passage.errors ?? 0, 'error')}.`);
  parts.push('A single sitting, so one sample of her reading rather than a measure of it.');
  return parts.join(' ');
}

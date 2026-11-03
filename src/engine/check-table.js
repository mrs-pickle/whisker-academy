import { CHECK_SETS } from './check-form.js';
import { UNITS } from '../curriculum/units.js';



export const SET_NAMES = Object.freeze({ 42: 'ff, ll, ss and zz', 43: 'all, oll and ull', 44: 'ck', 45: 'sh', th: 'th', 48: 'ch', 50: 'wh',
  'digraphs-end': 'ng and nk', vce: 'silent e', 'longer-words': 'ending and two-part',
  'ending-patterns': 'tch, dge, y and -le', 'r-controlled': 'ar, or and er', 'long-teams': 'ai, ee, oa and igh', 'other-teams': 'oo, ew and aw', diphthongs: 'oi, oy, ou and ow',
  'silent-letters': 'kn, wr and mb', 'affixes-1': 'un-, re-, -ful and -ly', 'suffix-changes': 'doubling, drop the e, y to i', 'rare-spellings': 'air, ear, eigh and other rare ones',
  'affixes-2': '-tion, -ture, -ness and -able' });
const SET_LESSONS = Object.freeze({ 42: [42], 43: [43], 44: [44], 45: [45], th: [46, 47], 48: [48], 50: [50],
  ...Object.fromEntries(UNITS.filter(u => u.from > 50).map(u => [u.id, Array.from({ length: u.to - u.from + 1 }, (_, i) => u.from + i)])) });

const zero = () => ({ correct: 0, total: 0 });
const add = (a, b) => ({ correct: a.correct + b.correct, total: a.total + b.total });
const score = (part) => (Number.isFinite(part?.total) ? { correct: Number(part.correct) || 0, total: part.total } : zero());

function anchorsOf(checks, id) {
  const form = (checks?.forms ?? []).find((f) => f.id === id);
  return new Set(form ? [...form.real.flat(), ...form.nonsense.flat(), ...form.spell] : []);
}

export function checkColumn(record, index, checks) {
  const anchors = anchorsOf(checks, record.form);
  const part = (kind) => {
    const split = { anchor: zero(), new: zero() };
    for (const line of record.lines.filter(( l) => l.kind === kind)) {
      const side = line.words.every(( w) => anchors.has(w)) ? 'anchor' : 'new';
      split[side] = add(split[side], { correct: line.marks.filter(( m) => m === true).length, total: line.words.length });
    }
    return split;
  };
  const spelled = { anchor: zero(), new: zero() };
  for (const d of record.dictation) {
    const side = anchors.has(d.word) ? 'anchor' : 'new';
    spelled[side] = add(spelled[side], { correct: d.correct === true ? 1 : 0, total: 1 });
  }
  const p = record.passage;
  return {
    kind: 'check', day: record.day, index, taughtUpTo: record.taughtUpTo,
    real: part('real'), nonsense: part('nonsense'), spelled,
    passage: { wcpm: p?.wcpm ?? null, errors: p?.errors ?? null, stopped: p?.stopped === true },
  };
}

export function checkColumns(profile, checks) {
  const b = profile?.baseline;
  const columns = b && Number.isFinite(b.day) ? [{
    kind: 'baseline', day: b.day, index: null, taughtUpTo: profile.baselineDetail?.taughtUpTo ?? null,
    real: { anchor: score(b.real), new: zero() },
    nonsense: { anchor: score(b.nonsense), new: zero() },
    spelled: { anchor: score(b.dictation), new: zero() },
    passage: { wcpm: b.passage?.wcpm ?? null, errors: b.passage?.errors ?? null, stopped: false },
  }] : [];
  (Array.isArray(profile?.checks) ? profile.checks : []).forEach((record, i) => columns.push(checkColumn(record, i, checks)));
  return columns;
}

export function practiceVsNew(profile, content, states) {
  const records = Array.isArray(profile?.checks) ? profile.checks : [];
  const used = new Set(records.flatMap((r) => r.sets ?? []));
  return CHECK_SETS.filter(([set]) => used.has(set)).map(([set]) => {
    const lessons = SET_LESSONS[ (set)] ?? [];
    const practiced = (content.words ?? []).filter((w) => w.real !== false && lessons.includes(w.lesson) && states.get(`w:${w.w}#read`)?.mastered === true).length;
    const pool = new Set(content.checks?.pools?.[set]?.real ?? []);
    let newRight = 0;
    let newShown = 0;
    for (const record of records) {
      for (const line of record.lines ?? []) {
        line.words.forEach(( w, i) => {
          if (!pool.has(w)) return;
          newShown++;
          if (line.marks[i] === true) newRight++;
        });
      }
    }
    return { set, name: SET_NAMES[ (set)], practiced, newRight, newShown };
  });
}

export const practiceLine = (row) => `Practice: ${row.practiced} ${row.name} words mastered. New ${row.name} words: ${row.newShown > 0 ? `${row.newRight} of ${row.newShown}` : 'none shown yet'}.`;

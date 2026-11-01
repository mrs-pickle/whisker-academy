import { isDecodable } from '../curriculum/decodable.js';
import { HIST_LENGTH } from './itemstate.js';


export const LINE_MISSES = 3;




export const itemKey = (word, mode) => `${word.real === false ? 'n' : 'w'}:${word.w}#${mode}`;

export function questSelection(content, taughtUpTo) {
  const bank = (list) => new Map((list ?? []).map(w => [w.w, w]));
  const words = bank(content.words);
  const nonsense = bank(content.nonsense);
  const readable = (w) => w !== undefined && w.lesson <= taughtUpTo && isDecodable(w.segs, taughtUpTo);
  const entrance = content.entrance ?? {};
  const lines = (entrance.lines ?? []).flatMap(( line) => {
    const found = line.words.map(( w) => (line.kind === 'nonsense' ? nonsense : words).get(w));
    return found.every(readable) ? [{ id: line.id, kind: line.kind, words: found }] : [];
  });
  const dictation = (entrance.dictation ?? []).map(( w) => words.get(w)).filter(readable);
  return { lines, dictation };
}

export function lineMarks(marks, size) {
  const out = [];
  let misses = 0;
  for (let i = 0; i < size; i++) {
    const mark = misses >= LINE_MISSES || i >= marks.length ? null : marks[i] === true;
    if (mark === false) misses++;
    out.push(mark);
  }
  return out;
}

export function questDetail({ day, taughtUpTo, lines, dictation, passage }) {
  return {
    day,
    taughtUpTo,
    lines: lines.map(l => ({ kind: l.kind, words: [...l.words], marks: lineMarks(l.marks, l.words.length) })),
    dictation: dictation.map(r => ({ word: r.word.w, built: Array.isArray(r.built) ? [...r.built] : null, correct: r.correct === true })),
    passage: passage ? { id: passage.id, wcpm: passage.wcpm, errors: passage.errors } : null,
    rebuilt: false,
  };
}

export function rebuildQuestDetail(baseline, content, states, taughtUpTo) {
  const { day } = baseline;
  const selection = questSelection(content, taughtUpTo);
  const missed = (key) => (states.get(key)?.hist ?? []).some(r => r?.day === day && r?.correct === false);
  const mayHaveDropped = (key) => {
    const hist = states.get(key)?.hist ?? [];
    return hist.length === HIST_LENGTH && typeof hist[0]?.day === 'number' && hist[0].day >= day;
  };
  const raw = (key) => (mayHaveDropped(key) ? 'unknown' : !missed(key));
  const counted = (total) => (typeof total === 'number' && Number.isFinite(total) ? total : Infinity);
  const agrees = (got, want) => typeof want !== 'number' || got === want;
  const noMisses = (part) => typeof part?.total === 'number' && part.correct === part.total;
  const started = (kind) => {
    let left = counted(baseline[kind]?.total);
    const out = [];
    for (const line of selection.lines) {
      if (line.kind !== kind) continue;
      if (line.words.length > left) break;
      left -= line.words.length;
      out.push(line);
    }
    return out;
  };
  let adds = true;
  const linesOf = (kind) => {
    const lines = started(kind);
    const clean = noMisses(baseline[kind]);
    const marks = lines.map(l => (clean ? l.words.map(() => (true)) : unsureMarks(l.words.map(w => raw(itemKey(w, 'read'))))));
    const words = lines.reduce((n, l) => n + l.words.length, 0);
    const right = marks.flat().filter(m => m === true).length;
    if (!agrees(words, baseline[kind]?.total) || !agrees(right, baseline[kind]?.correct)) adds = false;
    return lines.map((l, i) => ({ kind: l.kind, words: l.words.map(w => w.w), marks: marks[i] }));
  };
  const lines = [...linesOf('real'), ...linesOf('nonsense')];
  const dictated = selection.dictation.slice(0, counted(baseline.dictation?.total));
  const spellClean = noMisses(baseline.dictation);
  const spelled = dictated.map(w => (spellClean ? true : raw(itemKey(w, 'spell'))));
  if (!agrees(dictated.length, baseline.dictation?.total) || !agrees(spelled.filter(c => c === true).length, baseline.dictation?.correct)) adds = false;
  const unsure = lines.some(l => l.marks.includes('unknown')) || spelled.includes('unknown');
  const checked = unsure ? 'unsure' : adds ? 'exact' : 'mismatch';
  const timing = baseline.passage;
  const read = timing && (typeof timing.wcpm === 'number' || typeof timing.errors === 'number');
  return {
    day,
    taughtUpTo,
    lines,
    dictation: dictated.map((w, i) => ({ word: w.w, built: null, correct: spelled[i] })),
    passage: read ? { id: content.entrance?.passage?.id ?? null, wcpm: timing.wcpm ?? null, errors: timing.errors ?? null } : null,
    rebuilt: true,
    checked,
    ...(checked !== 'exact' ? { uncertain: (true) } : {}),
  };
}

function unsureMarks(raw) {
  let misses = 0;
  let unsure = 0;
  return raw.map((mark) => {
    if (misses >= LINE_MISSES) return null;
    const out = mark === true && misses + unsure >= LINE_MISSES ? 'unknown' : mark;
    if (mark === false) misses++;
    if (mark === 'unknown') unsure++;
    return out;
  });
}

const REBUILD_CHECKS = Object.freeze(['exact', 'unsure', 'mismatch']);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isStrings = (v) => Array.isArray(v) && v.every(s => typeof s === 'string');
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isNumberOrNull = (v) => v === null || isNumber(v);

export function isQuestDetail(value) {
  if (!isPlainObject(value) || !isNumber(value.day) || !isNumber(value.taughtUpTo) || typeof value.rebuilt !== 'boolean') return false;
  const linesOk = Array.isArray(value.lines) && value.lines.every(l => isPlainObject(l) && (l.kind === 'real' || l.kind === 'nonsense')
    && isStrings(l.words) && Array.isArray(l.marks) && l.marks.length === l.words.length && l.marks.every(m => m === true || m === false || m === null || m === 'unknown'));
  const dictationOk = Array.isArray(value.dictation) && value.dictation.every(d => isPlainObject(d) && typeof d.word === 'string'
    && (d.built === null || isStrings(d.built)) && (typeof d.correct === 'boolean' || d.correct === 'unknown'));
  const passageOk = value.passage === null || (isPlainObject(value.passage) && isNumberOrNull(value.passage.wcpm) && isNumberOrNull(value.passage.errors));
  const uncertainOk = value.uncertain === undefined || value.uncertain === true;
  const checkedOk = value.checked === undefined || REBUILD_CHECKS.includes(value.checked);
  return linesOk && dictationOk && passageOk && uncertainOk && checkedOk;
}

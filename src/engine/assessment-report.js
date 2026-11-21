import { letterSlip, MISSED_PATTERNS, SLIP_LABELS, wordSlip } from './slips.js';
import { SLIP_KINDS } from './slip-log.js';


const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);
const DIGRAPHS = new Set(['sh', 'th', 'ch', 'wh', 'ck', 'ng', 'ph']);
export const ASSESSMENT_KINDS = Object.freeze({ vowel: 'A different vowel', digraph: 'One digraph for another' });

export function assessmentLetterSlip(target, chose, where) {
  if (VOWELS.has(target) && VOWELS.has(chose)) return 'vowel';
  if (DIGRAPHS.has(target) && DIGRAPHS.has(chose)) return 'digraph';
  return letterSlip(target, chose, where);
}
const EXAMPLES = 5;

export const ITEM_KINDS = Object.freeze({ read: 'read aloud', hear: 'heard', nonsense: 'made-up', phrase: 'phrase', sound: 'sound card' });


const lineScore = (lines, kind) => lines.filter((l) => l.kind === kind).reduce((s, l) => ({
  correct: s.correct + l.marks.filter((m) => m === true).length,
  total: s.total + l.marks.filter((m) => m === true || m === false).length,
}), { correct: 0, total: 0 });

function boxDiffs(segs, built) {
  if (!Array.isArray(segs) || !Array.isArray(built) || segs.length !== built.length) return null;
  return segs.flatMap(([g], box) => (g === built[box] ? [] : [{ box, target: g, chose: built[box] }]));
}

export function assessmentRecords(profile, content) {
  const segsOf = segsMap(content);
  const placements = Array.isArray(profile?.placements) ? profile.placements.filter((p) => p?.detail && Array.isArray(p.detail.lines)) : [];
  let raw = placements.length > 0 ? [...new Set([placements[0], placements.at(-1)])] : [];
  const bd = profile?.baselineDetail;
  if (raw.length === 0 && bd && Array.isArray(bd.lines)) raw = [{ day: bd.day, first: true, suggested: null, before: null, lesson: bd.taughtUpTo, detail: bd, items: [] }];
  return raw.map((p) => {
    const d = p.detail;
    const dictation = (Array.isArray(d.dictation) ? d.dictation : []).map(( x) => ({ word: String(x.word), built: Array.isArray(x.built) ? x.built.map(String) : null, correct: x.correct === true }));
    const vowelSwaps = dictation.filter((x) => !x.correct && x.built).flatMap((x) => {
      const diffs = boxDiffs(segsOf.get(x.word), x.built);
      return diffs && diffs.some((df) => VOWELS.has(df.target) && VOWELS.has(df.chose)) ? [{ word: x.word, built: (x.built) }] : [];
    });
    return {
      day: p.day,
      first: p.first === true,
      suggested: Number.isInteger(p.suggested) ? p.suggested : null,
      before: Number.isInteger(p.before) ? p.before : null,
      set: Number.isInteger(p.lesson) ? p.lesson : Number.isInteger(p.before) ? p.before : d.taughtUpTo,
      real: lineScore(d.lines, 'real'),
      nonsense: lineScore(d.lines, 'nonsense'),
      dictationScore: { correct: dictation.filter((x) => x.correct).length, total: dictation.length },
      dictation,
      passage: d.passage ? { wcpm: Number.isFinite(d.passage.wcpm) ? d.passage.wcpm : null, errors: Number.isFinite(d.passage.errors) ? d.passage.errors : null } : null,
      items: (Array.isArray(p.items) ? p.items : []).map(( i) => ({ type: String(i.type), text: String(i.text), ...(typeof i.picked === 'string' ? { picked: i.picked } : {}), correct: i.correct === true })),
      vowelSwaps,
    };
  });
}

const segsMap = (content) => new Map([...(content?.instant ?? []), ...(content?.nonsense ?? []), ...(content?.words ?? [])].map((w) => [w.w, w.segs]));

export function assessmentSlips(records, content) {
  const segsOf = segsMap(content);
  const found = [];
  for (const r of records) {
    for (const x of r.dictation) {
      if (x.correct || !x.built) continue;
      const segs = segsOf.get(x.word);
      const diffs = boxDiffs(segs, x.built);
      const example = `${x.word}, built ${x.built.join(' ')}`;
      if (diffs) for (const df of diffs) found.push({ kind: assessmentLetterSlip(df.target, df.chose, { box: df.box, segs }), example });
      else found.push({ kind: 'other', example });
    }
    for (const i of r.items) {
      if (i.correct || i.picked === undefined) continue;
      if (i.type === 'sound') found.push({ kind: assessmentLetterSlip(i.text, i.picked), example: `${i.text}, picked ${i.picked}` });
      else if (i.type === 'hear') found.push({ kind: wordSlip(i.text, i.picked, (w) => segsOf.get(w)), example: `${i.text}, picked ${i.picked}` });
    }
  }
  const labels = { ...SLIP_LABELS, ...ASSESSMENT_KINDS };
  return ['vowel', 'digraph', ...SLIP_KINDS].flatMap((kind) => {
    const these = found.filter((f) => f.kind === kind);
    if (these.length === 0) return [];
    return [{ kind, label: labels[kind], count: these.length, examples: [...new Set(these.map((f) => f.example))].slice(0, EXAMPLES) }];
  });
}

export function assessmentMissed(records, content, details) {
  const segsOf = segsMap(content);
  const words = new Map();
  const note = (w, miss) => { if (segsOf.has(w)) words.set(w, (words.get(w) ?? false) || miss); };
  for (const d of details) for (const l of d.lines) if (l.kind === 'real') l.words.forEach((w, i) => { if (l.marks[i] === true || l.marks[i] === false) note(w, l.marks[i] === false); });
  for (const r of records) {
    for (const x of r.dictation) note(x.word, !x.correct);
    for (const i of r.items) if (i.type === 'read' || i.type === 'hear') note(i.text, !i.correct);
  }
  return MISSED_PATTERNS.map(({ id, has }) => {
    const these = [...words].filter(([w]) => { const segs = segsOf.get(w); return Array.isArray(segs) && has(segs, w); });
    const missed = these.filter(([, m]) => m).map(([w]) => w).sort();
    return { id, missed: missed.length, tried: these.length, examples: missed.slice(0, EXAMPLES + 1) };
  });
}

export function assessmentReport(profile, content) {
  const records = assessmentRecords(profile, content);
  const placements = Array.isArray(profile?.placements) ? profile.placements.filter((p) => p?.detail && Array.isArray(p.detail.lines)) : [];
  const details = placements.length > 0 ? [...new Set([placements[0], placements.at(-1)])].map((p) => p.detail)
    : profile?.baselineDetail && Array.isArray(profile.baselineDetail.lines) ? [profile.baselineDetail] : [];
  return { records, slips: assessmentSlips(records, content), missed: assessmentMissed(records, content, details) };
}

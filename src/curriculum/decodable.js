import { consonantClusters, phonemeCodes, soundKind } from './phonemes.js';
import { END, MEDIAL, OPEN, SIGNAL, SOFT, START, UNSTRESSED, VCE, correspondencesOf } from './correspondences.js';
import { SYLLABLE_TYPE_LESSON, syllableTypes } from './syllables.js';
import { baseSegs, morphParts, ruleFits, ruleLesson } from './affixes.js';


const TWO_SYLLABLE_LESSON = 67;

const THREE_SYLLABLE_LESSON = 99;

const vowelCount = (seg) => phonemeCodes(seg[1]).filter(c => soundKind(c) === 'vowel').length;

function isUnstressed(segs, i, stress) {
  if (!Array.isArray(stress)) return false;
  const own = vowelCount(segs[i]);
  if (own === 0) return false;
  const at = segs.slice(0, i).reduce((n, seg) => n + vowelCount(seg), 0);
  const digits = stress.slice(at, at + own);
  return digits.length === own && digits.every(d => d === 0);
}

const ENDINGS = new Set(['es', 'ed', 'ing']);

const BLEND_REVIEW = new Map([['a', 35], ['i', 36], ['o', 37], ['u', 39], ['e', 40]]);

const FIRST_BLEND_REVIEW = 35;

const THREE_ONSET_LESSON = 53;

const SUFFIX_S = new Map([['s', 20], ['z', 21]]);

const isSilentE = (seg) => seg !== undefined && String(seg[0]).toLowerCase() === 'e' && soundKind(seg[1]) === 'silent';

const isVCeVowel = (segs, i) =>
  i >= 0 && soundKind(segs[i]?.[1]) === 'vowel' && soundKind(segs[i + 1]?.[1]) === 'consonant' && isSilentE(segs[i + 2]);

const isSyllableVowel = (segs, j) => {
  const seg = segs[j];
  return seg !== undefined && soundKind(seg[1]) === 'vowel' && !(j === segs.length - 1 && ENDINGS.has(String(seg[0]).toLowerCase()));
};

const isOpenVowel = (segs, i) => soundKind(segs[i]?.[1]) === 'vowel'
  && ((soundKind(segs[i + 1]?.[1]) === 'consonant' && isSyllableVowel(segs, i + 2)) || isSyllableVowel(segs, i + 1));

const isMedial = (segs, i) => {
  const after = segs[i + 1];
  return i > 0 && soundKind(segs[i - 1]?.[1]) === 'vowel' && soundKind(segs[i]?.[1]) === 'consonant' && after !== undefined
    && soundKind(after[1]) === 'vowel' && !(i + 1 === segs.length - 1 && ENDINGS.has(String(after[0]).toLowerCase()));
};

function contexts(segs, i, stress, openEnd = false) {
  const unstressed = isUnstressed(segs, i, stress) ? [UNSTRESSED] : [];
  const next = segs[i + 1];
  if (!next) return [END, ...(openEnd && String(segs[i][0]).length === 1 && soundKind(segs[i][1]) === 'vowel' ? [OPEN] : []), ...unstressed];
  const g = String(next[0]).toLowerCase();
  const out = [g, `${g}=${phonemeCodes(next[1]).join(' ')}`];
  const second = segs[i + 2];
  if (second) out.push(`${g}+${String(second[0]).toLowerCase()}`);
  if (isVCeVowel(segs, i)) out.push(VCE);
  if (isOpenVowel(segs, i)) out.push(OPEN);
  if (isMedial(segs, i)) out.push(MEDIAL);
  if ('eiy'.includes(g[0] ?? '_')) out.push(SIGNAL);
  return [...out, ...unstressed];
}

export function segLesson(segs, i, stress, openEnd = false) {
  return segCorrespondence(segs, i, stress, openEnd)?.lesson ?? Infinity;
}

const isSoft = (segs, i) => {
  const seg = segs[i];
  if (!seg) return false;
  const g = String(seg[0]).toLowerCase();
  const codes = phonemeCodes(seg[1]).join(' ');
  return (g === 'c' && codes === 's') || (g === 'g' && codes === 'j');
};

export function segCorrespondence(segs, i, stress, openEnd = false) {
  const [g, p] = segs[i];
  if (isSilentE(segs[i]) && !isVCeVowel(segs, i - 2)) {
    return isSoft(segs, i - 1) ? correspondencesOf(g, p).find(c => c.after === SOFT) ?? null : null;
  }
  const ctx = contexts(segs, i, stress, openEnd);
  const prev = i > 0 ? String(segs[i - 1][0]).toLowerCase() : START;
  const fits = correspondencesOf(g, p).filter(c => c.after === undefined || c.after === prev);
  const inContext = fits.filter(c => (c.before !== undefined ? ctx.includes(c.before) : c.after !== undefined));
  if (inContext.length > 0) return inContext.reduce((a, b) => (b.lesson < a.lesson ? b : a));
  if (ctx.includes(VCE) && String(g).length === 1) return null;
  return fits.find(c => c.before === undefined && c.after === undefined) ?? null;
}

function syllableVowels(segs) {
  const last = segs.length - 1;
  return segs.flatMap(([g, p], i) =>
    i === last && ENDINGS.has(String(g).toLowerCase()) ? [] : phonemeCodes(p).filter(c => soundKind(c) === 'vowel'));
}

function syllableLesson(segs) {
  const n = syllableVowels(segs).length;
  const count = n <= 1 ? 0 : n === 2 ? TWO_SYLLABLE_LESSON : THREE_SYLLABLE_LESSON;
  return Math.max(count, ...syllableTypes(segs).map(t => SYLLABLE_TYPE_LESSON[t]));
}

function suffixSLesson(segs, run) {
  const i = run[run.length - 1];
  if (i !== segs.length - 1 || String(segs[i][0]).toLowerCase() !== 's') return 0;
  return SUFFIX_S.get(phonemeCodes(segs[i][1]).join(' ')) ?? 0;
}

function clusterLesson(segs) {
  const blend = Math.max(FIRST_BLEND_REVIEW, ...syllableVowels(segs).map(v => BLEND_REVIEW.get(v) ?? FIRST_BLEND_REVIEW));
  let lesson = 0;
  const first = segs.findIndex(([, p]) => soundKind(p) !== 'silent');
  for (const run of consonantClusters(segs)) {
    if (run[0] === first && (run.length >= 3 || (['sh', 'th'].includes(String(segs[run[0]][0]).toLowerCase()) && phonemeCodes(segs[run[1]][1]).join(' ') === 'r'))) lesson = Math.max(lesson, THREE_ONSET_LESSON);
    const suffix = suffixSLesson(segs, run);
    const blendLength = suffix ? run.length - 1 : run.length;
    lesson = Math.max(lesson, suffix, blendLength >= 2 ? blend : 0);
  }
  return lesson;
}

function plainLesson(segs, stress, openEnd = false) {
  if (segs.length === 0) return Infinity;
  return Math.max(syllableLesson(segs), clusterLesson(segs), ...segs.map((_, i) => segLesson(segs, i, stress, openEnd)));
}

function stressOf(segs, stress, from, to) {
  if (!Array.isArray(stress)) return undefined;
  const count = ( part) => part.reduce((n, seg) => n + vowelCount(seg), 0);
  const at = count(segs.slice(0, from));
  return stress.slice(at, at + count(segs.slice(from, to)));
}

function readParts(segs, shape) {
  if (shape?.morph === undefined || shape.morph === null) return shape?.base ? false : null;
  const parts = morphParts(segs, shape.morph);
  if (!parts) return false;
  const base = baseSegs(segs, parts, shape.base);
  if (!base) return false;
  const next = parts.affixes.find((a) => a.from === parts.to);
  const suffix = next ? segs.slice(next.from, next.to).map(([g]) => g).join('') : '';
  const openEnd = suffix !== '' && !'aeiouy'.includes(suffix[0].toLowerCase());
  if (!shape.base) return { parts, base, rule: 0, openEnd };
  if (!next || !ruleFits(base, shape.base.rule, suffix)) return false;
  return { parts, base, rule: ruleLesson(shape.base.rule, next.id), openEnd };
}

export function wordLesson(segs, shape) {
  if (segs.length === 0) return Infinity;
  const read = readParts(segs, shape);
  if (read === false) return Infinity;
  if (read === null) return plainLesson(segs, shape?.stress ?? undefined);
  const stress = stressOf(segs, shape?.stress ?? undefined, read.parts.from, read.parts.to);
  return Math.max(plainLesson(read.base, stress, read.openEnd), read.rule, ...read.parts.affixes.map((a) => a.affix.lesson));
}

export function isDecodable(segs, taughtUpTo, shape) {
  return wordLesson(segs, shape) <= taughtUpTo;
}

export function heartIndexes(segs, taughtUpTo, shape) {
  const read = readParts(segs, shape);
  if (read === false) return segs.map((_, i) => i);
  if (read === null) return segs.flatMap((_, i) => (segLesson(segs, i, shape?.stress ?? undefined) > taughtUpTo ? [i] : []));
  const { parts, base, rule, openEnd } = read;
  const stress = stressOf(segs, shape?.stress ?? undefined, parts.from, parts.to);
  const hearts = new Set(base.flatMap((_, j) => (segLesson(base, j, stress, openEnd) > taughtUpTo && parts.from + j < parts.to ? [parts.from + j] : [])));
  if (rule > taughtUpTo) hearts.add(parts.to - 1);
  for (const a of parts.affixes) if (a.affix.lesson > taughtUpTo) for (let i = a.from; i < a.to; i++) hearts.add(i);
  return [...hearts].sort((x, y) => x - y);
}

export function tokenize(text) {
  const words = String(text).toLowerCase().replace(/[‘’ʼ]/g, "'").match(/[\p{L}\p{N}']+/gu) ?? [];
  return words.map(w => w.replace(/^'+|'+$/g, '')).filter(w => w.length > 0);
}

export function sentenceBlockers(text, { lookup, knownInstant, names, taughtUpTo }) {
  const blockers = [];
  for (const w of tokenize(text)) {
    if (blockers.includes(w) || names.has(w) || knownInstant.has(w)) continue;
    const found = lookup(w);
    const rec = Array.isArray(found) ? { segs: found } : found;
    if (!rec || !isDecodable(rec.segs, taughtUpTo, rec)) blockers.push(w);
  }
  return blockers;
}

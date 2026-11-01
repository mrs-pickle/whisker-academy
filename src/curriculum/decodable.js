import { consonantClusters, phonemeCodes, soundKind } from './phonemes.js';
import { END, VCE, findCorrespondence } from './correspondences.js';


const TWO_SYLLABLE_LESSON = 67;

const ENDINGS = new Set(['es', 'ed', 'ing']);

const BLEND_REVIEW = new Map([['a', 35], ['i', 36], ['o', 37], ['u', 39], ['e', 40]]);

const FIRST_BLEND_REVIEW = 35;

const SUFFIX_S = new Map([['s', 20], ['z', 21]]);

const isSilentE = (seg) => seg !== undefined && String(seg[0]).toLowerCase() === 'e' && soundKind(seg[1]) === 'silent';

const isVCeVowel = (segs, i) =>
  i >= 0 && soundKind(segs[i]?.[1]) === 'vowel' && soundKind(segs[i + 1]?.[1]) === 'consonant' && isSilentE(segs[i + 2]);

function contexts(segs, i) {
  const next = segs[i + 1];
  if (!next) return [END];
  const g = String(next[0]).toLowerCase();
  const out = [g, `${g}=${phonemeCodes(next[1]).join(' ')}`];
  if (isVCeVowel(segs, i)) out.push(VCE);
  return out;
}

export function segLesson(segs, i) {
  const [g, p] = segs[i];
  if (isSilentE(segs[i]) && !isVCeVowel(segs, i - 2)) return Infinity;
  const ctx = contexts(segs, i);
  let best = null;
  for (const t of ctx) {
    const c = findCorrespondence(g, p, t);
    if (c && c.before !== undefined && (!best || c.lesson < best.lesson)) best = c;
  }
  if (!best && !ctx.includes(VCE)) best = findCorrespondence(g, p);
  return best ? best.lesson : Infinity;
}

function syllableVowels(segs) {
  const last = segs.length - 1;
  return segs.flatMap(([g, p], i) =>
    i === last && ENDINGS.has(String(g).toLowerCase()) ? [] : phonemeCodes(p).filter(c => soundKind(c) === 'vowel'));
}

function syllableLesson(segs) {
  const n = syllableVowels(segs).length;
  return n <= 1 ? 0 : n === 2 ? TWO_SYLLABLE_LESSON : Infinity;
}

function suffixSLesson(segs, run) {
  const i = run[run.length - 1];
  if (i !== segs.length - 1 || String(segs[i][0]).toLowerCase() !== 's') return 0;
  return SUFFIX_S.get(phonemeCodes(segs[i][1]).join(' ')) ?? 0;
}

function clusterLesson(segs) {
  const blend = Math.max(FIRST_BLEND_REVIEW, ...syllableVowels(segs).map(v => BLEND_REVIEW.get(v) ?? FIRST_BLEND_REVIEW));
  let lesson = 0;
  for (const run of consonantClusters(segs)) {
    const suffix = suffixSLesson(segs, run);
    const blendLength = suffix ? run.length - 1 : run.length;
    lesson = Math.max(lesson, suffix, blendLength >= 2 ? blend : 0);
  }
  return lesson;
}

export function wordLesson(segs) {
  if (segs.length === 0) return Infinity;
  return Math.max(syllableLesson(segs), clusterLesson(segs), ...segs.map((_, i) => segLesson(segs, i)));
}

export function isDecodable(segs, taughtUpTo) {
  return wordLesson(segs) <= taughtUpTo;
}

export function heartIndexes(segs, taughtUpTo) {
  return segs.flatMap((_, i) => (segLesson(segs, i) > taughtUpTo ? [i] : []));
}

export function tokenize(text) {
  const words = String(text).toLowerCase().replace(/[‘’ʼ]/g, "'").match(/[\p{L}\p{N}']+/gu) ?? [];
  return words.map(w => w.replace(/^'+|'+$/g, '')).filter(w => w.length > 0);
}

export function sentenceBlockers(text, { lookup, knownInstant, names, taughtUpTo }) {
  const blockers = [];
  for (const w of tokenize(text)) {
    if (blockers.includes(w) || names.has(w) || knownInstant.has(w)) continue;
    const segs = lookup(w);
    if (!segs || !isDecodable(segs, taughtUpTo)) blockers.push(w);
  }
  return blockers;
}

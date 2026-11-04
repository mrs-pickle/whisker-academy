import { CORRESPONDENCES, SOFT } from './correspondences.js';
import { segCorrespondence } from './decodable.js';
import { baseSegs, morphParts } from './affixes.js';
import { consonantClusters, phonemeCodes, soundKind } from './phonemes.js';
import { syllableCount } from './syllables.js';


const PLAIN_ENDINGS = new Set(['-s', '-es', '-ed', '-ing']);

function partsOf(segs, shape) {
  const parts = shape?.morph ? morphParts(segs, shape.morph) : null;
  const base = parts ? baseSegs(segs, parts, shape?.base) : null;
  if (!parts || !base) return null;
  const affixes = parts.affixes.filter((a) => !PLAIN_ENDINGS.has(a.id)).length;
  const axis = affixes >= 2 || shape?.base ? 3 : affixes === 1 ? 2 : 1;
  return { base, from: parts.from, to: parts.to, axis };
}

export const SPELLING_CHOICE_LESSON = 69;

const ENDINGS = new Set(['es', 'ed', 'ing']);

const R_CONTROLLED = new Set(['ar', 'or', 'er', 'air', 'ear']);

const SPELLINGS = (() => {
  const map = new Map();
  for (const c of CORRESPONDENCES) {
    if (c.p === '') continue;
    const set = map.get(c.p) ?? new Set();
    set.add(c.g);
    map.set(c.p, set);
  }
  return map;
})();

export function competingBoxes(segs, shape) {
  const parts = partsOf(segs, shape);
  if (parts) return competingBoxes(parts.base).flatMap((j) => (parts.from + j < parts.to ? [parts.from + j] : []));
  return segs.flatMap((_, i) => {
    const c = segCorrespondence(segs, i, shape?.stress ?? undefined);
    if (i + 1 < segs.length && segCorrespondence(segs, i + 1)?.after === SOFT) return [i];
    return c && c.lesson >= SPELLING_CHOICE_LESSON && (SPELLINGS.get(c.p)?.size ?? 0) > 1 ? [i] : [];
  });
}

export const isRControlled = (segs) => segs.some(([, p]) => phonemeCodes(p).some(c => R_CONTROLLED.has(c)));

function clusterTier(segs) {
  const hasR = (i) => phonemeCodes(segs[i][1]).includes('r');
  const clusters = consonantClusters(segs);
  const first = segs.findIndex(([, p]) => soundKind(p) !== 'silent');
  const rInitial = first >= 0 && soundKind(segs[first][1]) === 'consonant' && hasR(first);
  if (rInitial || clusters.some(c => c.some(hasR))) return 4;
  if (clusters.length >= 2 || clusters.some(c => c.length >= 3)) return 3;
  return clusters.length === 1 ? 2 : 1;
}

export function tierOf(segs, shape) {
  const parts = partsOf(segs, shape);
  if (parts) {
    const base = tierOf(parts.base);
    return base === 4 ? 4 : (Math.max(base, parts.axis));
  }
  const plain = shapeTier(segs);
  if (plain === 4) return 4;
  const competing = competingBoxes(segs, shape).length > 0 ? 3 : 1;
  return (Math.max(plain, competing));
}

export function shapeTier(segs, shape) {
  const parts = partsOf(segs, shape);
  if (parts) {
    const base = shapeTier(parts.base);
    return base === 4 ? 4 : (Math.max(base, parts.axis));
  }
  const clusters = clusterTier(segs);
  if (clusters === 4) return 4;
  const last = segs.at(-1);
  const ending = last !== undefined && ENDINGS.has(String(last[0]).toLowerCase()) && soundKind(last[1]) === 'vowel' ? 1 : 0;
  const syllables = syllableCount(segs) - ending >= 2 ? 2 : 1;
  return (Math.max(clusters, syllables));
}

import { consonantClusters, phonemeCodes, soundKind } from './phonemes.js';


export function tierOf(segs) {
  const hasR = (i) => phonemeCodes(segs[i][1]).includes('r');
  const clusters = consonantClusters(segs);
  const first = segs.findIndex(([, p]) => soundKind(p) !== 'silent');
  const rInitial = first >= 0 && soundKind(segs[first][1]) === 'consonant' && hasR(first);
  if (rInitial || clusters.some(c => c.some(hasR))) return 4;
  if (clusters.length >= 2 || clusters.some(c => c.length >= 3)) return 3;
  return clusters.length === 1 ? 2 : 1;
}

import { hasNasalIE } from './ie-nasal.js';
import { phonemeCodes, soundKind } from './phonemes.js';
import { competingBoxes } from './tiers.js';


export const UNDICTATED_BOXES = Object.freeze(new Set(['wh', 'ph']));

export const UNDICTATED_SOUNDS = Object.freeze(new Set(['air', 'ear']));

const SHORT = new Set(['a', 'e', 'i', 'o', 'u']);
const AFTER_SHORT = new Set(['tch', 'dge']);
const AT_END = new Set(['ay', 'oy', 'aw', 'ow']);
const INSIDE = new Set(['ai', 'oi', 'au']);
const ENDINGS = new Set(['s', 'es', 'ed', 'ing']);

export function ruleDecides(segs, i) {
  const g = String(segs[i][0]).toLowerCase();
  const codes = phonemeCodes(segs[i][1]).join(' ');
  const prev = segs[i - 1];
  const next = segs[i + 1];
  const atEnd = next === undefined || (i + 1 === segs.length - 1 && ENDINGS.has(String(next[0]).toLowerCase()));
  if (AFTER_SHORT.has(g)) return prev !== undefined && prev[0].length === 1 && SHORT.has(phonemeCodes(prev[1]).join(' '));
  if (AT_END.has(g)) return atEnd && (g !== 'ow' || codes === 'ow');
  if (INSIDE.has(g)) return !atEnd && soundKind(next[1]) === 'consonant';
  return false;
}

export const canDictate = (rec) => {
  const segs = rec?.segs;
  if (!Array.isArray(segs) || segs.length === 0
    || !segs.every(s => Array.isArray(s) && s.length === 2 && typeof s[0] === 'string' && typeof s[1] === 'string')) return false;
  const typed = (segs);
  if (hasNasalIE(typed) || typed.some(([g, p]) => UNDICTATED_BOXES.has(String(g).toLowerCase()) || phonemeCodes(p).some(c => UNDICTATED_SOUNDS.has(c))
    || (phonemeCodes(p).length === 0 && String(g).toLowerCase() !== 'e'))) return false;
  const competing = competingBoxes(typed, rec);
  return competing.length === 0 || (typed.length > 1 && competing.every(i => ruleDecides(typed, i)));
};

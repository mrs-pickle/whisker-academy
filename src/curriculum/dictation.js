import { hasNasalIE } from './ie-nasal.js';

export const UNDICTATED_BOXES = Object.freeze(new Set(['wh', 'ph']));

export const canDictate = (rec) => {
  const segs = rec?.segs;
  if (!Array.isArray(segs) || segs.length === 0
    || !segs.every(s => Array.isArray(s) && s.length === 2 && typeof s[0] === 'string' && typeof s[1] === 'string')) return false;
  return !hasNasalIE( (segs)) && !segs.some(([g]) => UNDICTATED_BOXES.has(String(g).toLowerCase()));
};

import { phonemeCodes } from './phonemes.js';


export const END = '#';

export const VCE = '_e';

const cg =(g, p, lesson, before) => Object.freeze(before === undefined ? { g, p, lesson } : { g, p, lesson, before });

export const CORRESPONDENCES = Object.freeze([
  cg('a', 'a', 1),
  cg('m', 'm', 2),
  cg('s', 's', 3),
  cg('t', 't', 4),
  cg('p', 'p', 6),
  cg('f', 'f', 7),
  cg('i', 'i', 8),
  cg('n', 'n', 9),
  cg('a', 'a', 11, 'm'),
  cg('a', 'a', 11, 'n'),
  cg('o', 'o', 12),
  cg('d', 'd', 13),
  cg('c', 'k', 14),
  cg('u', 'u', 15),
  cg('g', 'g', 16),
  cg('b', 'b', 17),
  cg('e', 'e', 18),
  cg('s', 'z', 21),
  cg('k', 'k', 22),
  cg('h', 'h', 23),
  cg('r', 'r', 24),
  cg('l', 'l', 26),
  cg('a', 'a', 27, 'l'),
  cg('w', 'w', 28),
  cg('j', 'j', 29),
  cg('y', 'y', 30),
  cg('x', 'k s', 31),
  cg('qu', 'k w', 32),
  cg('v', 'v', 33),
  cg('z', 'z', 34),

  cg('ff', 'f', 42),
  cg('ll', 'l', 42),
  cg('ss', 's', 42),
  cg('zz', 'z', 42),
  cg('a', 'aw', 43, 'll'),
  cg('o', 'O', 43, 'll'),
  cg('ck', 'k', 44),
  cg('sh', 'sh', 45),
  cg('th', 'dh', 46),
  cg('th', 'th', 47),
  cg('ch', 'ch', 48),
  cg('wh', 'w', 50),
  cg('ph', 'f', 50),
  cg('ng', 'ng', 51),
  cg('n', 'ng', 52, 'k'),

  cg('e', '', 54),
  cg('a', 'A', 54, VCE),
  cg('i', 'I', 55, VCE),
  cg('o', 'O', 56, VCE),
  cg('e', 'E', 57, VCE),
  cg('u', 'U', 58, VCE),
  cg('u', 'oo', 58, VCE),
  cg('c', 's', 60, 'e='),
  cg('g', 'j', 61, 'e='),
  cg('a', 'a', 62, VCE),
  cg('i', 'i', 62, VCE),
  cg('o', 'u', 62, VCE),

  cg('es', '@ z', 63, END),
  cg('es', 'i z', 63, END),
  cg('ed', 'd', 64, END),
  cg('ed', 't', 64, END),
  cg('ed', '@ d', 64, END),
  cg('ed', 'i d', 64, END),
  cg('ing', 'i ng', 65, END),

  cg('e', 'E', 66, END),
  cg('i', 'I', 66, END),
  cg('o', 'O', 66, END),
  cg('u', 'U', 66, END),
  cg('u', 'oo', 66, END),
]);

const BY_GRAPHEME = new Map();
for (const c of CORRESPONDENCES) {
  const list = BY_GRAPHEME.get(c.g);
  if (list) list.push(c); else BY_GRAPHEME.set(c.g, [c]);
}

export function findCorrespondence(g, p, nextG) {
  const codes = phonemeCodes(p).join(' ');
  const same = (BY_GRAPHEME.get(String(g).toLowerCase()) ?? []).filter(c => c.p === codes);
  if (nextG !== undefined) {
    const hit = same.find(c => c.before === nextG);
    if (hit || nextG === VCE) return hit ?? null;
  }
  return same.find(c => c.before === undefined) ?? null;
}

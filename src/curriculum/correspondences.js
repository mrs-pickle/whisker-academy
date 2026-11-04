import { phonemeCodes } from './phonemes.js';


export const END = '#';

export const START = '^';

export const VCE = '_e';

export const OPEN = 'V.CV';

export const MEDIAL = 'V|V';

export const UNSTRESSED = 'V0';

export const SIGNAL = 'eiy';

export const SOFT = 'c/g';

const cg =(g, p, lesson, before) => Object.freeze(before === undefined ? { g, p, lesson } : { g, p, lesson, before });

const ca = (g, p, lesson, after) => Object.freeze({ g, p, lesson, after });

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
  cg('u', 'uu', 43, 'll'),
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
  ...['b', 'd', 'g', 'm', 'n', 'p', 'r', 't'].map(c => cg(c + c, c, 67, MEDIAL)),
  cg('cc', 'k', 67, MEDIAL),
  cg('a', 'A', 68, OPEN),
  cg('e', 'E', 68, OPEN),
  cg('i', 'I', 68, OPEN),
  cg('o', 'O', 68, OPEN),
  cg('u', 'U', 68, OPEN),
  cg('u', 'oo', 68, OPEN),

  cg('tch', 'ch', 69),
  cg('dge', 'j', 70),
  cg('i', 'I', 72, 'l+d'),
  cg('i', 'I', 72, 'n+d'),
  cg('o', 'O', 72, 'l+d'),
  cg('o', 'O', 72, 'l+t'),
  cg('o', 'O', 72, 's+t'),
  cg('y', 'I', 73, END),
  cg('y', 'I', 73, 'ing'),
  cg('y', 'I', 73, OPEN),
  cg('y', 'E', 74, END),
  cg('le', '@ l', 75, END),
  cg('le', '@ l', 75, 's'),

  cg('ar', 'ar', 77),
  cg('or', 'or', 78),
  cg('ore', 'or', 78),
  cg('er', 'er', 80),
  cg('ir', 'er', 81),
  cg('ur', 'er', 81),
  ca('or', 'er', 82, 'w'),

  cg('ai', 'A', 84),
  cg('ay', 'A', 84),
  cg('ee', 'E', 85),
  cg('ea', 'E', 85),
  cg('ey', 'E', 85),
  cg('oa', 'O', 86),
  cg('ow', 'O', 86),
  cg('oe', 'O', 86),
  cg('ie', 'I', 87),
  cg('igh', 'I', 87),

  cg('oo', 'uu', 89),
  cg('u', 'uu', 89),
  cg('oo', 'oo', 90),
  cg('ew', 'oo', 91),
  cg('ui', 'oo', 91),
  cg('ue', 'oo', 91),
  cg('au', 'aw', 93),
  cg('aw', 'aw', 93),
  cg('augh', 'aw', 93),
  cg('ea', 'e', 94),
  ca('a', 'o', 94, 'w'),
  ca('a', 'aw', 94, 'w'),
  ca('a', 'o', 94, 'qu'),

  cg('oi', 'oy', 95),
  cg('oy', 'oy', 95),
  cg('ou', 'ow', 96),
  cg('ow', 'ow', 96),

  ca('kn', 'n', 98, START),
  ca('wr', 'r', 98, START),
  ...[END, 's', 'ed', 'ing', 'er'].map(next => cg('mb', 'm', 98, next)),

  ...['a', 'e', 'i', 'o', 'u'].map(v => cg(v, '@', 67, UNSTRESSED)),
  cg('ar', 'er', 111, UNSTRESSED),
  cg('or', 'er', 111, UNSTRESSED),

  cg('air', 'air', 112),
  cg('are', 'air', 112),
  cg('ear', 'air', 112),
  cg('ear', 'ear', 113),

  cg('ei', 'A', 114),
  cg('eigh', 'A', 114),
  cg('ey', 'A', 114),
  cg('ea', 'A', 114),
  cg('aigh', 'A', 114),
  cg('ew', 'U', 115),
  cg('eu', 'U', 115),
  cg('ue', 'U', 115),
  cg('ou', 'oo', 115),
  cg('ough', 'aw', 116),
  cg('ough', 'O', 116),
  cg('c', 's', 117, SIGNAL),
  cg('g', 'j', 117, SIGNAL),
  ca('e', '', 117, SOFT),
  cg('ch', 'sh', 118),
  cg('ch', 'k', 118),
  ca('gn', 'n', 118, START),
  ...[END, 's', 'ed', 'ing'].map(next => cg('gn', 'n', 118, next)),
  ca('gh', 'g', 118, START),
  cg('t', '', 118),
]);

const BY_GRAPHEME = new Map();
for (const c of CORRESPONDENCES) {
  const list = BY_GRAPHEME.get(c.g);
  if (list) list.push(c); else BY_GRAPHEME.set(c.g, [c]);
}

export function correspondencesOf(g, p) {
  const codes = phonemeCodes(p).join(' ');
  return (BY_GRAPHEME.get(String(g).toLowerCase()) ?? []).filter(c => c.p === codes);
}

export function findCorrespondence(g, p, nextG, prevG) {
  const prev = prevG === undefined ? undefined : String(prevG).toLowerCase();
  const same = correspondencesOf(g, p).filter(c => c.after === undefined || c.after === prev);
  if (nextG !== undefined) {
    const hit = same.find(c => c.before === nextG);
    if (hit || nextG === VCE) return hit ?? null;
  }
  return same.find(c => c.before === undefined && c.after !== undefined) ?? same.find(c => c.before === undefined) ?? null;
}

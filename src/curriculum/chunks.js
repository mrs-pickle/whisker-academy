import { phonemeCodes } from './phonemes.js';
import { chunkClip, morphParts } from './affixes.js';


export const CHUNKS = Object.freeze([
  ['tion', 'sh @ n'], ['sion', 'zh @ n'], ['ture', 'ch er'], ['le', '@ l'],
  ['ild', 'I l d'], ['old', 'O l d'], ['ind', 'I n d'], ['olt', 'O l t'], ['ost', 'O s t'],
  ['s', 's'], ['es', 'i z'], ['ing', 'i ng'],
  ['er', 'er'], ['est', 'e s t'], ['ly', 'l E'], ['less', 'l e s'], ['ful', 'f uu l'], ['un', 'u n'], ['pre', 'p r E'],
  ['re', 'r E'], ['dis', 'd i s'], ['or', 'er'], ['ist', 'i s t'], ['ish', 'i sh'], ['y', 'E'], ['ness', 'n e s'],
  ['ment', 'm e n t'], ['able', '@ b @ l'], ['ible', 'i b @ l'], ['uni', 'U n E'], ['bi', 'b I'], ['tri', 't r I'],
].map(([name, sounds]) => Object.freeze({ id: `ck.${name}`, sounds })));

const BOX_CHUNKS = new Map([['tion|sh @ n', 'ck.tion'], ['sion|zh @ n', 'ck.sion'], ['sion|sh @ n', 'ck.tion'], ['ture|ch er', 'ck.ture'], ['le|@ l', 'ck.le']]);

const VCC = new Map([['ild', 'I'], ['ind', 'I'], ['old', 'O'], ['olt', 'O'], ['ost', 'O']]);

const AFFIX_CHUNKS_FROM = 99;

export function chunkOfGrapheme(g) {
  const key = String(g).toLowerCase();
  for (const [box, id] of BOX_CHUNKS) if (box.split('|')[0] === key) return id;
  return null;
}

export function boxClips([g, p]) {
  const chunk = BOX_CHUNKS.get(`${String(g).toLowerCase()}|${phonemeCodes(p).join(' ')}`);
  return chunk ? [chunk] : phonemeCodes(p).map(code => `p.${code}`);
}

function vccAt(segs, i, end) {
  if (i + 3 !== end) return null;
  const run = segs.slice(i, end);
  const letters = run.map(([g]) => String(g).toLowerCase()).join('');
  const vowel = VCC.get(letters);
  if (!vowel || run.some(([g]) => g.length !== 1) || phonemeCodes(run[0][1]).join(' ') !== vowel) return null;
  return `ck.${letters}`;
}

export function wordSoundClips(rec) {
  const { segs } = rec;
  const parts = morphParts(segs, rec.morph);
  const known = new Set(CHUNKS.map(c => c.id));
  const out = [];
  const baseEnd = parts ? parts.to : segs.length;
  for (let i = 0; i < segs.length;) {
    const affix = parts?.affixes.find(a => a.from === i);
    if (affix && affix.affix.lesson >= AFFIX_CHUNKS_FROM && known.has(chunkClip(affix.id))) {
      out.push(chunkClip(affix.id));
      i = affix.to;
      continue;
    }
    const vcc = vccAt(segs, i, baseEnd);
    if (vcc) {
      out.push(vcc);
      i += 3;
      continue;
    }
    out.push(...boxClips(segs[i]));
    i += 1;
  }
  return out;
}

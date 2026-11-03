import { CORRESPONDENCES } from '../curriculum/correspondences.js';
import { beforeNasal } from '../curriculum/ie-nasal.js';
import { phonemeCodes } from '../curriculum/phonemes.js';
import { competingBoxes } from '../curriculum/tiers.js';
import { CONFUSIONS } from './cards.js';






export function createSpellController({ word, scaffold, tray }) {
  const targets = word.segs.map(([g]) => g);
  const competing = new Set(competingBoxes(word.segs));
  let nears = 0;
  const boxes = targets.map(() => null);
  let cursor = 0;
  let misses = 0;
  let tileMisses = 0;
  let boxMisses = 0;
  let taps = 0;
  let helped = false;
  let phase = scaffold === 'full' ? 'build' : 'count';
  let feedback = null;
  let locked = false;

  return {
    state: () => ({
      boxes: [...boxes], cursor, misses, phase, feedback: feedback && { ...feedback }, taps, helped, nears, tray: [...tray],
    }),
    tapPaw() {
      if (locked || phase !== 'count') return;
      taps++;
    },
    finishCount() {
      if (locked || phase !== 'count' || taps === 0) return;
      if (taps === targets.length) {
        feedback = null;
      } else {
        misses++;
        feedback = { kind: 'count-model' };
      }
      phase = 'build';
    },
    pick(grapheme) {
      if (locked || phase !== 'build') return;
      if (grapheme === targets[cursor]) {
        boxes[cursor] = grapheme;
        cursor++;
        boxMisses = 0;
        feedback = null;
        if (cursor === targets.length) phase = 'read';
        return;
      }
      if (boxMisses >= 2) return;
      if (competing.has(cursor) && sameSoundTiles(word.segs[cursor]).includes(grapheme)) {
        nears++;
        boxMisses = 2;
        feedback = { kind: 'near', box: cursor, tile: grapheme };
        return;
      }
      misses++;
      tileMisses++;
      boxMisses++;
      if (boxMisses >= 2) helped = true;
      feedback = { kind: boxMisses >= 2 ? 'reveal' : 'bounce', box: cursor };
    },
    takeBack() {
      if (locked || phase !== 'build' || cursor === 0) return;
      cursor--;
      boxes[cursor] = null;
      boxMisses = 0;
      feedback = null;
    },
    finishRead() {
      if (locked || phase !== 'read') return;
      phase = 'done';
    },
    result: () => ({ correct: cursor === targets.length && tileMisses === 0, helped }),
    get locked() { return locked; },
    setLocked(b) { locked = Boolean(b); },
  };
}

export function scaffoldFor(itemState) {
  const box = itemState?.box ?? 0;
  if (box >= 4) return 'none';
  if (box >= 2) return 'partial';
  return 'full';
}


const VOWELS = Object.freeze(['a', 'e', 'i', 'o', 'u']);
const S_SH = new Set(['s', 'sh']);

export function sShTiles(a, b) {
  return a !== b && S_SH.has(a) && S_SH.has(b);
}

const SINGLE_OF = Object.freeze({ ff: 'f', ll: 'l', ss: 's', zz: 'z', ck: 'k' });
const MAX_DISTRACTORS = 3;

const TAUGHT = (() => {
  const map = new Map();
  for (const c of CORRESPONDENCES) {
    if (c.before !== undefined || c.after !== undefined || c.p === '') continue;
    const entry = map.get(c.g) ?? { lesson: Infinity, sounds: new Map() };
    entry.lesson = Math.min(entry.lesson, c.lesson);
    entry.sounds.set(c.p, Math.min(entry.sounds.get(c.p) ?? Infinity, c.lesson));
    map.set(c.g, entry);
  }
  return map;
})();

const saysBy = (x, n) => [...(TAUGHT.get(x)?.sounds ?? [])].flatMap(([p, lesson]) => (lesson <= n ? [p] : []));

const PLAIN_BY_SOUND = (() => {
  const map = new Map();
  for (const c of CORRESPONDENCES) {
    if (c.before !== undefined || c.after !== undefined || c.p === '') continue;
    const of = map.get(c.p) ?? new Map();
    of.set(c.g, Math.min(of.get(c.g) ?? Infinity, c.lesson));
    map.set(c.p, of);
  }
  return map;
})();

export function sameSoundTiles([g, p], taughtUpTo = Infinity) {
  const of = PLAIN_BY_SOUND.get(phonemeCodes(p).join(' ')) ?? new Map();
  return [...of].filter(([x, lesson]) => x !== g && lesson <= taughtUpTo).map(([x]) => x);
}

function partnersOf(g) {
  const map = CONFUSIONS;
  return [...(map[g] ?? []), ...Object.keys(map).filter(k => map[k].includes(g))];
}

const otherIE = (g) => (g === 'i' ? 'e' : g === 'e' ? 'i' : null);

export function buildTray(word, settings, rng, after) {
  const needed = [...new Set(word.segs.map(([g]) => g))];
  const voiced = [...new Set(word.segs.filter(([, p]) => p !== '').map(([g]) => g))];
  const sounds = new Set(word.segs.map(([, p]) => p).filter(p => p !== ''));
  const whole = after ? [...word.segs, after] : word.segs;
  const nasalSwaps = new Set(word.segs.flatMap(([g, p], i) => {
    const other = otherIE(g);
    return other !== null && p !== '' && beforeNasal(whole, i) ? [other] : [];
  }));
  const sShOk = (x) => settings.sShContrast || !(needed.some(n => sShTiles(x, n)) || (x === 'sh' && sounds.has('s')));
  const ok = (x) => !needed.includes(x) && !nasalSwaps.has(x) && (TAUGHT.get(x)?.lesson ?? Infinity) <= settings.taughtUpTo && sShOk(x);

  const swap = voiced.map(otherIE).filter(x => x !== null && !needed.includes(x) && !nasalSwaps.has(x));
  const single = voiced.flatMap(g => {
    const x = (SINGLE_OF)[g];
    return x !== undefined && ok(x) && !word.segs.some(([other, p]) => other !== g && saysBy(x, settings.taughtUpTo).includes(p)) ? [x] : [];
  });
  const alike = voiced.flatMap(partnersOf).filter(x => ok(x) && !saysBy(x, settings.taughtUpTo).some(p => sounds.has(p)));
  const competing = competingBoxes(word.segs);
  const sameSound = competing.flatMap(i => sameSoundTiles(word.segs[i], settings.taughtUpTo))
    .filter(x => !needed.includes(x) && !nasalSwaps.has(x) && sShOk(x)
      && !word.segs.some(([, p], j) => !competing.includes(j) && p !== '' && saysBy(x, settings.taughtUpTo).includes(p)));
  const longer = sameSound.filter(x => x.length >= 2);
  const same = sameSound.length > 0 ? [rng.pick(longer.length > 0 ? longer : sameSound)] : [];
  const near = [...new Set([...swap, ...single, ...alike])];
  const otherVowels = VOWELS.filter(v => ok(v) && !near.includes(v) && !saysBy(v, settings.taughtUpTo).some(p => sounds.has(p)));
  const vowel = voiced.some(g => VOWELS.includes(g)) && !near.some(x => VOWELS.includes(x)) && otherVowels.length > 0
    ? [rng.pick(otherVowels)] : [];
  const fill = rng.shuffle([...TAUGHT.keys()].filter((x) =>
    x.length === 1 && ok(x) && !near.includes(x) && !vowel.includes(x) && !saysBy(x, settings.taughtUpTo).some(p => sounds.has(p))));
  const count = Math.min(MAX_DISTRACTORS, Math.max(2 + rng.int(2), near.length));
  const ranked = [...new Set([...same, ...swap, ...single, ...vowel, ...alike])];
  return rng.shuffle([...needed, ...[...ranked, ...fill].slice(0, count)]);
}

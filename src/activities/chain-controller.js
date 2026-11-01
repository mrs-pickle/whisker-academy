import { beforeNasal } from '../curriculum/ie-nasal.js';
import { consonantClusters, phonemeCodes } from '../curriculum/phonemes.js';
import { tierOf } from '../curriculum/tiers.js';
import { CONFUSION_PAIRS, swapsSForSh } from '../engine/session-builder.js';
import { buildTray, sShTiles } from './spell-controller.js';



const spelling = (seg) => String(seg[0]).toLowerCase();

const sameBox = (a, b) => a[0] === b[0] && phonemeCodes(a[1]).join(' ') === phonemeCodes(b[1]).join(' ');

export function diffStep(fromSegs, toSegs) {
  const a = fromSegs.map(spelling);
  const b = toSegs.map(spelling);
  if (a.length === b.length) {
    const changed = a.flatMap((g, i) => (g === b[i] ? [] : [i]));
    if (changed.length !== 1) return null;
    const [i] = changed;
    return { op: 'sub', index: i, from: fromSegs[i][0], to: toSegs[i][0] };
  }
  if (Math.abs(a.length - b.length) !== 1) return null;
  const [long, short] = a.length > b.length ? [a, b] : [b, a];
  let i = 0;
  while (i < short.length && long[i] === short[i]) i++;
  if (!short.slice(i).every((g, j) => g === long[i + 1 + j])) return null;
  return b.length > a.length ? { op: 'ins', index: i, to: toSegs[i][0] } : { op: 'del', index: i, from: fromSegs[i][0] };
}




export function createChainController({ steps }) {
  const words = steps.map(s => ({ w: s.w, segs: s.segs.map(seg => ([...seg])) }));
  const changes = words.slice(1).map((s, i) => diffStep(words[i].segs, s.segs));
  const bad = changes.findIndex(ch => ch === null);
  if (bad >= 0) throw new RangeError(`Chain step ${words[bad].w} → ${words[bad + 1].w} does not change exactly one sound box`);
  const last = words.length - 1;

  let stepIndex = 0;
  let phase = last > 0 ? 'choose-box' : 'done';
  let feedback = null;
  let misses = 0;
  let tries = 0;
  let helped = false;
  let locked = false;

  const change = () => (changes[stepIndex]);
  const right = () => { tries = 0; feedback = null; };
  const miss = () => {
    if (tries >= 2) return;
    misses++;
    tries++;
    if (tries >= 2) helped = true;
    feedback = { kind: tries >= 2 ? 'reveal' : 'bounce' };
  };
  const advance = () => {
    stepIndex++;
    right();
    phase = stepIndex === last ? 'done' : 'choose-box';
  };
  const open = () => !locked && phase === 'choose-box';

  return {
    state() {
      const ch = changes[stepIndex] ?? null;
      const next = words[stepIndex + 1] ?? null;
      const nextSeg = ch && ch.op !== 'del' && next ? ([...next.segs[ch.index]]) : null;
      return {
        current: words[stepIndex].segs.map(seg => ([...seg])),
        word: words[stepIndex].w,
        stepIndex,
        phase,
        feedback: feedback && { ...feedback },
        change: ch && { ...ch },
        next: next?.w ?? null,
        nextSeg,
        misses,
        helped,
      };
    },
    pickBox(i) {
      if (!open()) return;
      const ch = change();
      if (ch.op === 'ins' || i !== ch.index) { miss(); return; }
      right();
      if (ch.op === 'del') advance(); else phase = 'choose-tile';
    },
    pickGap(i) {
      if (!open()) return;
      const ch = change();
      if (ch.op !== 'ins' || i !== ch.index) { miss(); return; }
      right();
      phase = 'choose-tile';
    },
    pickTile(g) {
      if (locked || phase !== 'choose-tile') return;
      if (g === change().to) advance(); else miss();
    },
    get locked() { return locked; },
    setLocked(b) { locked = Boolean(b); },
  };
}

export function chainTray(seg, old, settings, rng, after) {
  const tray = buildTray({ segs: [seg] }, settings, rng, after);
  const to = seg[0];
  if (old === undefined) return tray;
  const from = old[0];
  if (from === to || tray.includes(from)) return tray;
  if (!settings.sShContrast && (sShTiles(from, to) || swapsSForSh([old], [seg]))) return tray;
  const ie = ( g) => g === 'i' || g === 'e';
  if (ie(from) && ie(to) && after !== undefined && beforeNasal([seg, after], 0)) return tray;
  const swap = to === 'i' ? 'e' : to === 'e' ? 'i' : null;
  const drop = tray.findLastIndex(g => g !== to && g !== swap);
  return rng.shuffle([...tray.filter((_, i) => i !== drop), from]);
}


const PAIR_SEGS = Object.freeze({
  the: [['th', 'dh'], ['e', 'u']],
  they: [['th', 'dh'], ['ey', 'A']],
  his: [['h', 'h'], ['i', 'i'], ['s', 'z']],
  this: [['th', 'dh'], ['i', 'i'], ['s', 's']],
});
const PARTNER = new Map(CONFUSION_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]));



export function protegeOptions(word, content, readable = () => true) {
  const { segs } = word;
  const byWord = content?.byWord ?? new Map();
  const instant = new Set((content?.instant ?? []).map(iw => iw.w));
  const out = [];
  const add = (shownSegs) => {
    const fix = diffStep(shownSegs, segs);
    if (!fix || fix.op === 'del') return;
    const shown = shownSegs.map(([g]) => g).join('');
    if (shown === word.w || out.some(o => o.shown === shown)) return;
    out.push({ shown, fixBox: fix.index, correct: (fix.to), op: fix.op, segs: shownSegs.map(seg => ([...seg])) });
  };
  const addVetted = (made, except = -1) => {
    const shown = made.map(([g]) => g).join('');
    const rec = byWord.get(shown);
    if (!rec || instant.has(shown) || typeof ( (rec)).fry === 'number') return;
    if (rec.segs.length !== made.length || !made.every((seg, k) => k === except || sameBox(rec.segs[k], seg))) return;
    if (readable(rec.segs, shown)) add(rec.segs);
  };

  const partner = PARTNER.get(word.w);
  const partnerSegs = partner === undefined ? undefined : byWord.get(partner)?.segs ?? PAIR_SEGS[partner];
  if (partner !== undefined && partnerSegs && readable(partnerSegs, partner)) add(partnerSegs);

  segs.forEach(([g, p], i) => {
    const sound = phonemeCodes(p).join(' ');
    if (!((g === 'i' && sound === 'i') || (g === 'e' && sound === 'e'))) return;
    if (beforeNasal(segs, i)) return;
    const other = g === 'i' ? 'e' : 'i';
    addVetted(segs.map((seg, j) => (j === i ? ([other, other]) : seg)), i);
  });

  if ((word.tier ?? tierOf(segs)) >= 2) {
    for (const run of consonantClusters(segs)) {
      for (const i of run) if (i > 0 && i < segs.length - 1) addVetted(segs.filter((_, j) => j !== i));
    }
  }
  return out;
}

export function protegeError(word, content, rng, readable) {
  const options = protegeOptions(word, content, readable);
  return options.length > 0 ? rng.pick(options) : null;
}

import { consonantClusters } from '../curriculum/phonemes.js';
import { CONFUSION_PAIRS } from './session-builder.js';
import { SLIP_KINDS, normalizeSlips } from './slip-log.js';


export { SLIP_KINDS, SLIPS_KEPT, isSlip, normalizeSlips, withSlip } from './slip-log.js';

export const SLIP_LABELS = Object.freeze({
  bd: 'b and d',
  cs: 'c or ck and s',
  ending: 'The last sound',
  blend: 'A blend sound skipped',
  lookalike: 'Look-alike words',
  other: 'Other',
});
const S_LETTERS = new Set(['s', 'ss']);
const C_LETTERS = new Set(['c', 'ck']);

const blendBoxes = (segs) => new Set(consonantClusters(segs).flat());

export function letterSlip(target, chose, { box, segs } = {}) {
  const both = new Set([target, chose]);
  if (both.size === 2 && both.has('b') && both.has('d')) return 'bd';
  if ([...both].some((g) => S_LETTERS.has(g)) && [...both].some((g) => C_LETTERS.has(g))) return 'cs';
  if (Array.isArray(segs) && Number.isInteger(box) && (box) >= 0 && (box) < segs.length) {
    const at = (box);
    if (blendBoxes(segs).has(at) && segs[at + 1]?.[0] === chose) return 'blend';
    if (at === segs.length - 1) return 'ending';
  }
  return 'other';
}

const isLookAlike = (a, b) => CONFUSION_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

export function wordSlip(target, chose, segsOf) {
  if (isLookAlike(target, chose)) return 'lookalike';
  const t = segsOf(target);
  const c = segsOf(chose);
  if (!Array.isArray(t) || !Array.isArray(c)) return 'other';
  if (t.length === c.length) {
    const at = t.flatMap(([g], i) => (g === c[i][0] ? [] : [i]));
    if (at.length !== 1) return 'other';
    const kind = letterSlip(t[at[0]][0], c[at[0]][0]);
    if (kind !== 'other') return kind;
    return at[0] === t.length - 1 ? 'ending' : 'other';
  }
  if (c.length === t.length - 1) {
    const blend = blendBoxes(t);
    for (let i = 0; i < t.length; i++) {
      if (!blend.has(i)) continue;
      const left = [...t.slice(0, i), ...t.slice(i + 1)];
      if (left.every(([g], j) => g === c[j][0])) return 'blend';
    }
  }
  return 'other';
}


const EXAMPLES = 5;

export function slipSummary(slips, from, to) {
  const inWindow = normalizeSlips(slips).filter((s) => s.day >= from && s.day <= to);
  return SLIP_KINDS.flatMap((kind) => {
    const these = inWindow.filter((s) => s.kind === kind);
    if (these.length === 0) return [];
    const examples = [];
    for (const s of [...these].reverse()) {
      const word = s.target && !s.item.startsWith('w:') ? s.target : s.item.replace(/^[a-z]+:/, '');
      const shown = s.chose ? `${word}, picked ${s.chose}` : word;
      if (!examples.includes(shown)) examples.push(shown);
      if (examples.length >= EXAMPLES) break;
    }
    return [{ kind, label: (SLIP_LABELS)[kind], count: these.length, examples }];
  });
}

export const MISSED_PATTERNS = Object.freeze([
  { id: 'bd', label: 'b or d', has: (segs) => segs.some(([g]) => g === 'b' || g === 'd') },
  { id: 'c', label: 'a hard c or ck', has: (segs) => segs.some(([g, p]) => (g === 'c' || g === 'ck') && p === 'k') },
  { id: 'st', label: 'an s or t at the end', has: (segs) => ['s', 'ss', 't'].includes(segs.at(-1)?.[0] ?? '') },
  { id: 'endblend', label: 'a blend or ck at the end', has: (segs) => segs.at(-1)?.[0] === 'ck' || consonantClusters(segs).some((run) => run.includes(segs.length - 1)) },
  { id: 'lookalike', label: 'a look-alike word (from, for, the, they, his, this, went, what)', has: (_, w) => CONFUSION_PAIRS.some((pair) => pair.includes(w)) },
]);

export function missedPatterns(states, content, from, to) {
  const segsOf = new Map([...(content?.instant ?? []), ...(content?.words ?? [])].map((w) => [w.w, w.segs]));
  const byWord = new Map();
  for (const [key, state] of states) {
    const m = /^(?:w|iw):(.+)#(read|spell)$/.exec(key);
    if (!m || !segsOf.has(m[1])) continue;
    for (const a of state?.hist ?? []) {
      if (!(a?.day >= from && a.day <= to)) continue;
      const t = byWord.get(m[1]) ?? { tries: 0, misses: 0 };
      t.tries++;
      if (a.correct !== true || a.helped === true) t.misses++;
      byWord.set(m[1], t);
    }
  }
  return MISSED_PATTERNS.map(({ id, label, has }) => {
    const words = [...byWord].filter(([w]) => {
      const segs = segsOf.get(w);
      return Array.isArray(segs) && has(segs, w);
    });
    const missed = words.filter(([, t]) => t.misses > 0)
      .sort(([a, x], [b, y]) => y.misses - x.misses || a.localeCompare(b));
    return { id, label, missed: missed.length, practiced: words.length, examples: missed.slice(0, EXAMPLES + 1).map(([w]) => w) };
  });
}

import { isDecodable, sentenceBlockers } from '../curriculum/decodable.js';
import { CORRESPONDENCES } from '../curriculum/correspondences.js';
import { LAST_LESSON, LESSONS } from '../curriculum/lessons.js';


export const MIX_TYPES = Object.freeze( (['read', 'hear', 'nonsense', 'phrase', 'sound']));

export const PROBE_RIGHT = 2;
export const PROBE_MISSES = 2;
export const PROBE_WORDS = 4;
export const MIX_MAX_ITEMS = 30;
const BELOW = 5;
export const CLOSE_ENOUGH = 2;
const MAX_STEP = 8;
const CHOICES = 3;



const hash = (s) => {
  let x = 2166136261;
  for (let i = 0; i < s.length; i++) x = Math.imul(x ^ s.charCodeAt(i), 16777619);
  return x >>> 0;
};
const stable = (list, key, salt) => [...list].sort((a, b) => hash(`${salt}:${key(a)}`) - hash(`${salt}:${key(b)}`) || (key(a) < key(b) ? -1 : 1));

const readsAt = (w, lesson) => Number.isInteger(w.lesson) && w.lesson <= lesson && isDecodable(w.segs, lesson, w);

const sounds = (w) => w.segs.map(([, p]) => p).join(' ');

const heartWordsTo = (lesson) => new Set(LESSONS.filter((l) => l.n <= lesson).flatMap((l) => l.heartWords));

export function probeLessons(content) {
  const count = new Map();
  for (const w of content.words ?? []) {
    if (w.real === false || !Number.isInteger(w.lesson) || w.lesson > LAST_LESSON || !readsAt(w, w.lesson)) continue;
    count.set(w.lesson, (count.get(w.lesson) ?? 0) + 1);
  }
  return [...count].filter(([, n]) => n >= PROBE_WORDS).map(([l]) => l).sort((a, b) => a - b);
}

export function probeStart(lessons, guess) {
  if (typeof guess !== 'number' || !Number.isFinite(guess)) return 0;
  let start = 0;
  lessons.forEach((l, i) => { if (l < guess) start = i; });
  return start;
}


export function mixPlan(content, guess, { soundOf = () => [] } = {}) {
  const lessons = probeLessons(content);
  return { content, lessons, start: probeStart(lessons, guess), soundOf };
}

export function probeOutcome(answers) {
  const right = answers.filter((a) => a.correct).length;
  if (right >= PROBE_RIGHT) return 'read';
  return answers.length - right >= PROBE_MISSES ? 'not-yet' : 'open';
}


const needsCheck = (probes) => probes.length === 1
  && probes[0].answers.some((a) => a.correct && !isReadAloud(a.item));

export function mixState(plan, answers) {
  const n = plan.lessons.length;
  const probes = [];
  for (const a of answers) {
    const last = probes.at(-1);
    if (last && last.at === a.item.at && last.outcome === 'open') {
      last.answers.push(a);
      last.outcome = probeOutcome(last.answers);
    } else {
      const check = probes.some((p) => p.at === a.item.at);
      probes.push({ at: a.item.at, lesson: plan.lessons[a.item.at], answers: [a], check, outcome: check ? (a.correct ? 'read' : 'not-yet') : probeOutcome([a]) });
    }
  }
  const votes = new Map();
  let step = 1;
  let way = null;
  for (const p of probes) {
    if (p.outcome === 'open') continue;
    votes.set(p.at, (votes.get(p.at) ?? 0) + (p.outcome === 'read' ? 1 : -1));
    step = p.outcome === way ? Math.min(MAX_STEP, step * 2) : 2;
    way = p.outcome;
  }
  let lo = -1;
  for (const [at, v] of votes) if (v > 0 && at > lo) lo = at;
  let hi = n;
  for (const [at, v] of votes) if (v <= 0 && at > lo && at < hi) hi = at;
  const open = probes.at(-1)?.outcome === 'open' ? (probes.at(-1)).at : null;
  let next;
  if (n === 0 || answers.length >= MIX_MAX_ITEMS) next = null;
  else if (open !== null) next = open;
  else if (probes.length === 0) next = Math.min(Math.max(0, plan.start), n - 1);
  else if (hi - lo <= 1 || (lo >= 0 && hi < n && plan.lessons[hi] - plan.lessons[lo] <= CLOSE_ENOUGH)) next = lo >= 0 && needsCheck(probes.filter((p) => p.at === lo)) ? lo : null;
  else if (hi === n) next = Math.min(n - 1, lo + step);
  else if (lo === -1) next = Math.max(0, hi - step);
  else next = Math.floor((lo + hi) / 2);
  if (next !== null && next !== lo && open === null && (next <= lo || next >= hi)) next = Math.floor((lo + hi) / 2);
  const check = next !== null && open === null && probes.some((p) => p.at === next);
  return { probes, lo, hi, next, check, suggested: lo >= 0 ? plan.lessons[lo] : null };
}

const ownWords = (plan, lesson, used) => stable((plan.content.words ?? []).filter((w) => w.real !== false && w.lesson === lesson && !used.has(w.w) && readsAt(w, lesson)), (w) => w.w, `w${lesson}`);

export function mixItem(plan, at, type, used) {
  const probe = plan.lessons[at];
  const base = { type, at, probe };
  if (type === 'read') {
    const w = ownWords(plan, probe, used)[0];
    return w ? { ...base, lesson: w.lesson, word: w, text: w.w } : null;
  }
  if (type === 'phrase') {
    const bank = new Map((plan.content.words ?? []).map((w) => [w.w, w]));
    const hearts = heartWordsTo(probe);
    const w = ownWords(plan, probe, used).find((x) => typeof x.phrase === 'string' && x.phrase.split(' ').length >= 2
      && sentenceBlockers(x.phrase, { lookup: (y) => bank.get(y) ?? null, knownInstant: hearts, names: new Set(), taughtUpTo: probe }).length === 0);
    return w ? { ...base, lesson: w.lesson, word: w, text: (w.phrase) } : null;
  }
  if (type === 'nonsense') {
    const near = (plan.content.nonsense ?? []).filter((w) => Number.isInteger(w.lesson) && w.lesson <= probe && w.lesson > probe - BELOW && !used.has(w.w) && readsAt(w, probe));
    const w = stable(near, (x) => x.w, `n${probe}`).sort((a, b) => b.lesson - a.lesson)[0];
    return w ? { ...base, lesson: w.lesson, word: { ...w, real: false }, text: w.w } : null;
  }
  if (type === 'hear') {
    const w = ownWords(plan, probe, used)[0];
    if (!w) return null;
    const letters = ( x) => x.segs.map(([g]) => g);
    const mine = letters(w);
    const others = stable((plan.content.words ?? []).filter((x) => x.real !== false && x.w !== w.w && !used.has(x.w) && x.lesson <= probe
      && x.segs.length === w.segs.length && sounds(x) !== sounds(w)), (x) => x.w, `h${w.w}`)
      .map((x) => ({ x, same: letters(x).filter((g, i) => g === mine[i]).length }))
      .sort((a, b) => b.same - a.same)
      .slice(0, CHOICES - 1).map(({ x }) => x.w);
    if (others.length < CHOICES - 1) return null;
    return { ...base, lesson: w.lesson, word: w, text: w.w, choices: stable([w.w, ...others], (s) => s, `c${w.w}`) };
  }
  const plain = CORRESPONDENCES.filter((c) => c.p !== '' && c.before === undefined && c.after === undefined && c.lesson <= probe && /^[a-z]+$/.test(c.g));
  const clips = ( g) => plan.soundOf(g).join(' ');
  const near = plain.filter((c) => c.lesson > probe - BELOW && !used.has(`g:${c.g}`) && clips(c.g) !== '');
  const target = stable(near, (c) => c.g, `s${probe}`).sort((a, b) => b.lesson - a.lesson)[0];
  if (!target) return null;
  const others = [...new Set(stable(plain.filter((c) => c.g !== target.g && clips(c.g) !== '' && clips(c.g) !== clips(target.g)), (c) => c.g, `o${target.g}`)
    .sort((a, b) => b.lesson - a.lesson).map((c) => c.g))].slice(0, CHOICES - 1);
  if (others.length < CHOICES - 1) return null;
  return { ...base, lesson: target.lesson, word: null, text: target.g, g: target.g, choices: stable([target.g, ...others], (s) => s, `c${target.g}`) };
}

const usedKey = (item) => (item.type === 'sound' ? `g:${item.g}` : (item.word).w);

export function nextMixItem(plan, answers) {
  const { next, check } = mixState(plan, answers);
  if (next === null) return null;
  const used = new Set(answers.map((a) => usedKey(a.item)));
  const last = answers.at(-1)?.item.type;
  const from = last === undefined ? 0 : MIX_TYPES.indexOf(last) + 1;
  for (let k = 0; k < MIX_TYPES.length; k++) {
    const type = MIX_TYPES[(from + k) % MIX_TYPES.length];
    if (check && !READ_ALOUD.has(type)) continue;
    const item = mixItem(plan, next, type, used);
    if (item) return item;
  }
  return null;
}

const READ_ALOUD = new Set(['read', 'nonsense', 'phrase']);
export const isReadAloud = (item) => READ_ALOUD.has(item.type);

export const MIX_TYPE_NAMES = Object.freeze({ read: 'a word', hear: 'a word heard', nonsense: 'a made-up word', phrase: 'a phrase', sound: 'a sound' });

export function mixSummary(plan, answers) {
  return mixState(plan, answers).probes.map((p) => {
    const right = p.answers.filter((a) => a.correct).length;
    return `Lesson ${p.lesson}: ${right} of ${p.answers.length} (${p.answers.map((a) => MIX_TYPE_NAMES[a.item.type]).join(', ')})`;
  });
}

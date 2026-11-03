import { hasNasalIE } from '../curriculum/ie-nasal.js';
import { LAST_LESSON } from '../curriculum/lessons.js';
import { UNITS } from '../curriculum/units.js';
import { isRControlled } from '../curriculum/tiers.js';
import { canDictate } from '../curriculum/dictation.js';
import { needsSAndSh, R_WORD_TIER } from './session-builder.js';


export const CHECK_SETS = Object.freeze([['42', 42], ['43', 43], ['44', 44], ['45', 45], ['th', 47], ['48', 48], ['50', 50],
  ...UNITS.filter(u => u.from > 50 && u.to <= LAST_LESSON).map(u => ([u.id, u.to]))]);

export const CHECK_LINE = 5;
const NEW_LINES = Object.freeze({ real: 2, nonsense: 2 });
const NEW_DICTATED = 4;


export function spentItems(past) {
  const spent = new Set();
  for (const check of past ?? []) {
    for (const line of check?.lines ?? []) for (const w of line?.words ?? []) spent.add(w);
    for (const d of check?.dictation ?? []) if (typeof d?.word === 'string') spent.add(d.word);
  }
  return spent;
}

export const formsLeft = (checks, past) => {
  const used = new Set((past ?? []).map(c => c?.form));
  return (checks?.forms ?? []).filter(f => !used.has(f.id));
};

export function mayDictate(rec, { sShContrast, rWords }) {
  if (!sShContrast && needsSAndSh(rec.segs)) return false;
  if (hasNasalIE(rec.segs)) return false;
  if ((rec.tier >= R_WORD_TIER || isRControlled(rec.segs)) && !rWords) return false;
  return canDictate(rec);
}

export function checkForm(checks, { taughtUpTo, past = [], sShContrast = false, rWords = false, baselineTaughtUpTo }) {
  const form = formsLeft(checks, past)[0];
  if (!form) return null;
  const pools = checks.pools ?? {};
  const records = new Map((checks.items ?? []).map(r => [r.w, r]));
  const used = spentItems(past);
  const since = past.at(-1)?.taughtUpTo ?? baselineTaughtUpTo ?? -Infinity;
  const unused = (set, kind) => (pools[set]?.[kind] ?? []).filter(w => !used.has(w) && records.has(w));
  const taught = CHECK_SETS.filter(([id, top]) => top <= taughtUpTo && pools[id]).map(([id]) => id);
  const live = ( id) => unused(id, 'real').length + unused(id, 'nonsense').length > 0;
  const fresh = taught.filter(id => CHECK_SETS.find(([s]) => s === id)?.[1] > since && live(id));
  const sets = fresh.length > 0 ? fresh : taught.filter(live);

  const order = [...sets.filter(id => !(pools[id]?.nonsense ?? []).length), ...sets.filter(id => (pools[id]?.nonsense ?? []).length)];
  let turn = 0;
  const inTurn = (make) => {
    for (let tries = 0; tries < sets.length; tries++) {
      const set = order[turn++ % order.length];
      const got = make(set);
      if (got !== null) return [set, got];
    }
    return null;
  };
  const spend = (words) => { for (const w of words) used.add(w); return words; };

  const realLines = form.real.map(( words) => ({ kind: 'real', set: null, words: spend([...words]) }));
  const madeUpLines = form.nonsense.map(( words) => ({ kind: 'nonsense', set: null, words: spend([...words]) }));
  const dictation = form.spell.map(( w) => ({ w, set: (null) }));
  spend(form.spell);
  const placed = new Set();

  let moved = 0;
  for (let i = 0; i < NEW_LINES.real; i++) {
    const got = inTurn((set) => {
      const real = unused(set, 'real').slice(0, CHECK_LINE);
      const words = [...real, ...unused(set, 'nonsense').slice(0, CHECK_LINE - real.length)];
      return words.length === CHECK_LINE ? { words, kind: (real.length === CHECK_LINE ? 'real' : 'nonsense') } : null;
    });
    if (!got) break;
    const [set, { words, kind }] = got;
    placed.add(set);
    spend(words);
    if (kind === 'real') realLines.push({ kind, set, words });
    else { madeUpLines.push({ kind, set, words }); moved++; }
  }
  for (let i = moved; i < NEW_LINES.nonsense; i++) {
    const got = inTurn((set) => { const words = unused(set, 'nonsense').slice(0, CHECK_LINE); return words.length === CHECK_LINE ? words : null; });
    if (!got) break;
    placed.add(got[0]);
    madeUpLines.push({ kind: 'nonsense', set: got[0], words: spend(got[1]) });
  }
  for (let i = 0; i < NEW_DICTATED; i++) {
    const got = inTurn((set) => unused(set, 'real').find(w => mayDictate( (records.get(w)), { sShContrast, rWords })) ?? null);
    if (!got) break;
    placed.add(got[0]);
    dictation.push({ w: got[1], set: got[0] });
    spend([got[1]]);
  }

  return {
    form: form.id,
    taughtUpTo,
    sets: sets.filter(s => placed.has(s)),
    lines: [...realLines, ...madeUpLines],
    dictation,
    passage: form.passage,
  };
}

export const CHECK_EVERY_DAYS = 28;

export function checkReady(profile, checks, day) {
  const last = profile?.checks?.at(-1)?.day ?? profile?.baseline?.day;
  if (!Number.isFinite(last) || !Number.isFinite(day)) return false;
  return formsLeft(checks, profile?.checks ?? []).length > 0 && day - (last) >= CHECK_EVERY_DAYS;
}

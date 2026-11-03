import { boxClips, wordSoundClips } from '../curriculum/chunks.js';
import { PHONEMES, phonemeCodes } from '../curriculum/phonemes.js';
import { sentenceBlockers, tokenize, wordLesson } from '../curriculum/decodable.js';
import { LAST_LESSON, LESSONS } from '../curriculum/lessons.js';
import { RULES, affixOf, baseSegs, chunkClip, morphParts, ruleFits, ruleStep, withoutAffix } from '../curriculum/affixes.js';
import { tierOf } from '../curriculum/tiers.js';
import { UNITS } from '../curriculum/units.js';
import { artFile } from '../core/art-file.js';
import { beforeNasal, hasNasalIE } from '../curriculum/ie-nasal.js';
import { canDictate } from '../curriculum/dictation.js';
import { BLOCKLIST_FORMAT, isBlocked } from './blocklist.js';






const LIST_FILES = Object.freeze({
  words: 'words.json', nonsense: 'nonsense.json', instant: 'instant-words.json', chains: 'chains.json',
  warmup: 'warmup.json', names: 'names.json', wardrobe: 'wardrobe.json', colorin: 'colorin.json',
  rewards: 'rewards.json', letters: 'letters.json', robot: 'robot.json', story: 'story',
});

export const ROBOT_WORDS = Object.freeze(['said', 'was', 'of', 'to', 'do', 'are', 'have', 'says', 'were', 'want', 'walk', 'talk', 'could', 'would', 'should',
  'there', 'once',
  'two', 'friend']);

const FILE_OF = { ...LIST_FILES, pairs: 'pairs.json', checks: 'checks.json', entrance: 'entrance.json', blocklist: 'blocklist.json' };

const PAIR_SWAPS = Object.freeze({ ie: 'EH/IH', ssh: 'S/SH' });
const PAIR_NAMES = Object.freeze({ ie: 'i↔e', ssh: 's↔sh' });
const NASALS = new Set(['M', 'N', 'NG']);

const PICTURE_MAX = 200;

const PRINCE_TWIN = '.prince';

const LAYERED_CAST = new Set(['princess', 'kitten']);

const HIDDEN = '(spelling not shown)';

const CHECK_LESSON = 41;
const POOL_LESSON = new Map([
  ...[['42', 42], ['43', 43], ['44', 44], ['45', 45], ['th', 47], ['48', 48], ['50', 50]].map(([set, n]) => ([String(set), [Number(n), Number(n)]])),
  ...UNITS.filter(u => u.from > 50).map(u => ([u.id, [u.from, u.to]])),
]);
const fmtRange = ([from, to]) => (from === to ? String(from) : `${from} to ${to}`);
const FORM_LINES = Object.freeze({ real: 2, nonsense: 1 });
const FORM_SPELLED = 4;
const LINE_WORDS = 5;
const PASSAGE_MIN = 40;
const PASSAGE_MAX = 60;
const R_TIER = 4;
const HEARTS_AT_CHECK = new Set(LESSONS.filter(l => l.n <= CHECK_LESSON).flatMap(l => l.heartWords));
const PHRASE_HEARTS = new Set(['the', 'i', 'a']);
const KIND_SWAPS = Object.freeze({ i: 'e', e: 'i', b: 'dp', d: 'bp', p: 'bd' });

const LETTER_IDS = Object.freeze([...'abcdefghijklmnopqrstuvwxyz', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']);
const LOWER_FAMILIES = Object.freeze(['tall', 'round', 'hump', 'hook', 'slant']);
const CAPITAL_FAMILIES = Object.freeze(['caps-1', 'caps-2', 'caps-3', 'caps-4']);
const ALLOW_UP = new Set([...'abdghmnpqru', ...'MNUVW']);
const START_LOW = new Set(['d', 'e']);
const DOTTED = new Set(['i', 'j']);
const MAX_STEP_DOTS = 6;
const MIN_DOT_GAP = 60;
const PROGRAM_TERMS = Object.freeze(['magic c']);
const hasPrince = (record) => record?.prince !== undefined;
const PRINCESS = /\bprincess\b/i;

const list = (v) => (Array.isArray(v) ? v : []);
const obj = (v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
const lower = (s) => String(s).toLowerCase();
const fmtLesson = (n) => (Number.isFinite(n) ? String(n) : `Infinity: not decodable through lesson ${LAST_LESSON}`);

const repeated = (values) => [...new Set(values.filter((x, i) => x !== undefined && values.indexOf(x) !== i))];

const isSegs = (segs) => Array.isArray(segs) && segs.length > 0 &&
  segs.every(s => Array.isArray(s) && s.length === 2 && typeof s[0] === 'string' && typeof s[1] === 'string');

const codesOf = (segs) => segs.flatMap(([, p]) => phonemeCodes(p));

const boxKey = ([g, p]) => `${lower(g)}=${phonemeCodes(p).join(' ')}`;

const scenesOf = (ch) => [...list(ch?.scenes), ...list(ch?.side)];

const norm = (sym) => { const s = sym.replace(/\d/g, '').toUpperCase(); return s === 'AO' ? 'AA' : s; };

const pronKey = (syms) => syms.map(norm).filter(Boolean).join(' ');

function renderings(segs) {
  let out = [[]];
  for (const code of codesOf(segs)) {
    if (!Object.hasOwn(PHONEMES, code)) return [];
    out = out.flatMap(prefix => PHONEMES[code].arpabet.map(a => [...prefix, ...a.split(' ')]));
  }
  return [...new Set(out.map(pronKey))];
}

function editDistance(a, b) {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

function indexWords(...lists) {
  return new Map(lists.flat().filter(r => typeof r?.w === 'string' && isSegs(r.segs)).map(r => [lower(r.w), r]));
}

function recordLabel(file, name, i, r) {
  if (typeof name === 'string' && name !== '') return `${file} ${name}`;
  r.error(`${file}: entry ${i + 1} has no name`);
  return null;
}

function checkSegs(label, spelling, segs, r) {
  if (!isSegs(segs)) { r.error(`${label}: segs must be a non-empty list of [grapheme, phonemes] pairs`); return false; }
  const spelled = segs.map(s => s[0]).join('');
  if (lower(spelled) !== lower(spelling)) r.error(`${label}: segs spell "${spelled}"`);
  const unknown = [...new Set(codesOf(segs).filter(code => !Object.hasOwn(PHONEMES, code)))];
  if (unknown.length > 0) r.error(`${label}: unknown phoneme code(s): ${unknown.join(', ')}`);
  return true;
}

function checkLessonTier(label, rec, r) {
  const lesson = wordLesson(rec.segs, rec);
  const tier = tierOf(rec.segs, rec);
  if (rec.lesson !== lesson) r.error(`${label}: lesson is ${rec.lesson}, but wordLesson gives ${fmtLesson(lesson)}`);
  if (rec.tier !== tier) r.error(`${label}: tier is ${rec.tier}, but tierOf gives ${tier}`);
}

function checkPronunciation(label, w, segs, r, listed = false) {
  if (!r.cmu) return;
  const said = renderings(segs);
  if (said.length === 0) return;
  const prons = r.cmu.get(lower(w));
  if (!prons) { (listed ? r.error : r.warn)(`${label}: not in CMUdict; pronunciation not checked`); return; }
  const dict = [...new Set(prons.map(pronKey))];
  if (!dict.some(k => said.includes(k))) r.error(`${label}: segs say "${said[0]}", but CMUdict has ${dict.map(k => `"${k}"`).join(' or ')}`);
}

function checkParts(label, rec, bases, r) {
  const { morph, base } = rec;
  if (morph === undefined && base === undefined) return;
  if (morph === undefined) { r.error(`${label}: has a base but no morph`); return; }
  const parts = morphParts(rec.segs, (morph));
  if (!parts) { r.error(`${label}: morph does not fit its boxes (parts in order: prefixes, one base "", suffixes, each [id, boxes], each affix spelled as affixes.js has it)`); return; }
  if (base === undefined) return;
  const b = (obj(base));
  if (b !== base || typeof b.w !== 'string' || typeof b.rule !== 'string' || !Object.hasOwn(RULES, b.rule)) {
    r.error(`${label}: base must be {w, rule} with rule one of ${Object.keys(RULES).join(', ')}`);
    return;
  }
  const rule = (b.rule);
  const undone = baseSegs(rec.segs, parts, { w: b.w, rule });
  const next = parts.affixes.find((a) => a.from === parts.to);
  if (!undone || !next) { r.error(`${label}: the ${rule} rule does not fit its boxes`); return; }
  const spelled = undone.map(([g]) => g).join('');
  if (lower(spelled) !== lower(b.w)) r.error(`${label}: its base with the ${rule} rule undone spells "${spelled}", not "${b.w}"`);
  const suffix = rec.segs.slice(next.from, next.to).map(([g]) => g).join('');
  if (!ruleFits(undone, rule, suffix)) r.error(`${label}: the ${rule} rule is not the one "${b.w}" + "${suffix}" calls for`);
  if (!bases.has(lower(b.w))) r.error(`${label}: base "${b.w}" is not in ${LIST_FILES.words} or ${LIST_FILES.nonsense}`);
}

const AFFIX_WARMUP_LESSON = 99;

function checkAffixWarmup(it, c, r) {
  const label = `${LIST_FILES.warmup} ${it.id}`;
  const affix = typeof it.affix === 'string' ? affixOf(it.affix) : null;
  if (!affix) { r.error(`${label}: affix must be an affix id of affixes.js`); return; }
  const rec = c.words.find((w) => lower(w?.w) === lower(it.word));
  if (!rec || !isSegs(rec.segs)) { r.error(`${label}: "${it.word}" is not in ${LIST_FILES.words}`); return; }
  const left = withoutAffix(rec, affix.id);
  if (left === null) r.error(`${label}: ${affix.id} is not the first or last part of "${it.word}" (its morph)`);
  else if (lower(left) !== lower(it.answer)) r.error(`${label}: "${it.word}" without ${affix.id} is "${left}", not "${it.answer}"`);
  const known = new Set([...c.words, ...c.instant].map((w) => lower(w?.w)));
  if (!known.has(lower(it.answer))) r.error(`${label}: answer "${it.answer}" is not in ${LIST_FILES.words} or ${LIST_FILES.instant}`);
  const lesson = Math.max(AFFIX_WARMUP_LESSON, wordLesson(rec.segs, rec));
  if (!(it.minLesson >= lesson)) r.error(`${label}: minLesson must be at least ${fmtLesson(lesson)}`);
}

export const needsStress = (segs) => segs.some(([g, p], i) => {
  const codes = phonemeCodes(p).join(' ');
  const letters = lower(g);
  if (codes === '@' && letters.length === 1) return true;
  return (letters === 'ar' || letters === 'or') && codes === 'er' && lower(segs[i - 1]?.[0] ?? '') !== 'w';
});

export const stressDigits = (syms) => {
  const digits = syms.flatMap(s => (/\d$/.test(s) ? [Number(s.at(-1))] : []));
  return digits.length > 0 ? digits : null;
};

function checkStress(label, rec, r) {
  const { stress } = rec;
  if (stress === undefined) {
    if (needsStress(rec.segs)) r.warn(`${label}: has a box only a stress can read (/ə/, or ar or or saying /er/) but no stress; run npm run stress`);
    return;
  }
  const vowels = codesOf(rec.segs).filter(c => PHONEMES[c]?.kind === 'vowel').length;
  if (!Array.isArray(stress) || stress.length !== vowels || !stress.every(d => d === 0 || d === 1 || d === 2) || stress.filter(d => d === 1).length !== 1) {
    r.error(`${label}: stress must be one digit (0, 1 or 2) per vowel sound (${vowels}), with one 1`);
    return;
  }
  if (rec.real !== true || !r.cmu) return;
  const patterns = (r.cmu.get(lower(rec.w)) ?? []).map(stressDigits).filter(d => d !== null);
  if (patterns.length === 0) return;
  if (!patterns.some(d => d.join('') === stress.join(''))) r.error(`${label}: stress ${stress.join('')} is none of CMUdict's (${[...new Set(patterns.map(d => d.join('')))].join(', ')})`);
}

function checkRecords(c, r) {
  const bases = new Set([...c.words, ...c.nonsense].map((w) => lower(w?.w)));
  for (const key of (['words', 'nonsense'])) {
    c[key].forEach((rec, i) => {
      const label = recordLabel(LIST_FILES[key], rec?.w, i, r);
      if (!label || !checkSegs(label, rec.w, rec.segs, r)) return;
      checkParts(label, rec, bases, r);
      checkStress(label, rec, r);
      checkLessonTier(label, rec, r);
      if (key === 'words') checkPronunciation(label, rec.w, rec.segs, r);
    });
  }
  c.instant.forEach((rec, i) => {
    const label = recordLabel(LIST_FILES.instant, rec?.w, i, r);
    if (label && checkSegs(label, rec.w, rec.segs, r)) checkPronunciation(label, rec.w, rec.segs, r);
  });
  c.names.forEach((n, i) => {
    const label = recordLabel(LIST_FILES.names, n?.id, i, r);
    if (!label || !checkSegs(label, String(n.display ?? ''), n.segs, r)) return;
    const lesson = wordLesson(n.segs);
    if (!(lesson <= n.lesson)) r.error(`${label}: not decodable at its lesson ${n.lesson} (wordLesson gives ${fmtLesson(lesson)})`);
  });
  const known = new Set([...c.words, ...c.instant].map(w => lower(w?.w)));
  for (const it of c.warmup) {
    const unknown = [...new Set(list(it?.sounds).filter(s => typeof s !== 'string' || s === '' || !Object.hasOwn(PHONEMES, s)))];
    if (unknown.length > 0) r.error(`${LIST_FILES.warmup} ${it?.id}: unknown phoneme code(s): ${unknown.join(', ')}`);
    if (it?.type === 'affix') { checkAffixWarmup(it, c, r); continue; }
    if (it?.type !== 'syllables') continue;
    const parts = list(it.parts);
    if (parts.length === 0 || parts.join('') !== it.word) r.error(`${LIST_FILES.warmup} ${it.id}: parts must spell "${it.word}"`);
    for (const part of parts) if (!known.has(lower(part))) r.error(`${LIST_FILES.warmup} ${it.id}: part "${part}" is not a word in words.json or instant-words.json`);
    if (it.answer !== String(parts.length)) r.error(`${LIST_FILES.warmup} ${it.id}: answer must be the number of parts (${parts.length})`);
  }
}

function readBlocklist(raw, r) {
  const file = FILE_OF.blocklist;
  const result = { format: BLOCKLIST_FORMAT, entries: [] };
  if (raw === undefined) return result;
  const rec = (raw);
  if (rec === null || typeof rec !== 'object' || Array.isArray(rec)) {
    r.error(`${file}: must be {"format": "${BLOCKLIST_FORMAT}", "entries": [{"h": <sha256 hex>, "sub": true|false}, ...]}`);
  } else if (rec.format !== BLOCKLIST_FORMAT) {
    r.error(`${file}: format must be "${BLOCKLIST_FORMAT}"`);
  } else if (!Array.isArray(rec.entries)) {
    r.error(`${file}: entries must be a list`);
  } else {
    rec.entries.forEach(( e, i) => {
      if (typeof e?.h === 'string' && /^[0-9a-f]{64}$/.test(e.h) && typeof e.sub === 'boolean') result.entries.push({ h: e.h, sub: e.sub });
      else r.error(`${file} entry ${i + 1}: must be {"h": <64 lowercase hex>, "sub": true|false}`);
    });
  }
  return result;
}

function madeUpTest(c, blocklist, r) {
  const real = indexWords(c.words, c.instant);
  let soundsLike = null;
  const realSounds = () => {
    if (soundsLike) return soundsLike;
    soundsLike = new Map();
    for (const [w, rec] of real) for (const k of renderings(rec.segs)) if (!soundsLike.has(k)) soundsLike.set(k, w);
    if (r.cmu) for (const [w, prons] of r.cmu) for (const p of prons) { const k = pronKey(p); if (!soundsLike.has(k)) soundsLike.set(k, w); }
    return soundsLike;
  };
  return (label, w, segs) => {
    if (real.has(w)) r.error(`${label}: is a real word (in words.json or instant-words.json)`);
    if (r.cmu?.has(w)) r.error(`${label}: is a real word (in CMUdict)`);
    const twin = renderings(segs).map(k => realSounds().get(k)).find(x => x !== undefined && x !== w);
    if (twin) r.error(`${label}: sounds the same as the real word "${isBlocked(twin, blocklist) ? HIDDEN : twin}"`);
  };
}

function checkNonsense(c, blocklist, madeUp, r) {
  for (const [i, n] of c.nonsense.entries()) {
    if (typeof n?.w !== 'string' || !isSegs(n.segs)) continue;
    const w = lower(n.w);
    madeUp(`${LIST_FILES.nonsense} ${n.w}`, w, n.segs);
    if (isBlocked(w, blocklist)) r.error(`${LIST_FILES.nonsense} #${i + 1}: matches the blocklist (spelling not shown)`);
  }
  for (const it of c.warmup) {
    if ((it?.type !== 'delete' && it?.type !== 'substitute' && it?.type !== 'affix') || typeof it.answer !== 'string') continue;
    if (isBlocked(lower(it.answer), blocklist)) r.error(`${LIST_FILES.warmup} ${it.id}: answer matches the blocklist (spelling not shown)`);
  }
}

function swapsIEBeforeNasal(a, b) {
  if (a.length !== b.length) return false;
  const at = a.findIndex((seg, i) => boxKey(seg) !== boxKey(b[i]));
  if (at < 0) return false;
  const pair = new Set([phonemeCodes(a[at][1]).join(' '), phonemeCodes(b[at][1]).join(' ')]);
  return pair.size === 2 && pair.has('i') && pair.has('e') && (beforeNasal(a, at) || beforeNasal(b, at));
}

function checkChains(c, r) {
  const bank = indexWords(c.words);
  for (const ch of c.chains) {
    const label = `${LIST_FILES.chains} ${ch?.id}`;
    if (!Array.isArray(ch?.steps)) { r.error(`${label}: steps must be a list of words`); continue; }
    const recs = ch.steps.map(s => bank.get(lower(s)));
    ch.steps.forEach((s, i) => { if (!recs[i]) r.error(`${label}: step "${s}" is not in words.json`); });
    for (let i = 1; i < recs.length; i++) {
      const a = recs[i - 1];
      const b = recs[i];
      if (!a || !b) continue;
      const rule = ruleStep(a.segs, b.segs);
      if (rule) {
        if (b.base?.w !== a.w || b.base?.rule !== rule.rule) r.error(`${label}: ${a.w} → ${b.w} is a ${rule.rule} step, so ${b.w} needs base {w: "${a.w}", rule: "${rule.rule}"}`);
        continue;
      }
      const sounds = editDistance(codesOf(a.segs), codesOf(b.segs));
      const boxes = editDistance(a.segs.map(boxKey), b.segs.map(boxKey));
      if (sounds !== 1) r.error(`${label}: ${a.w} → ${b.w} changes ${sounds} sounds (each step changes exactly 1)`);
      else if (boxes !== 1) r.error(`${label}: ${a.w} → ${b.w} changes ${boxes} sound boxes (each step changes exactly 1)`);
      else if (swapsIEBeforeNasal(a.segs, b.segs)) r.error(`${label}: ${a.w} → ${b.w} swaps short i and e before m, n or ng`);
    }
  }
}

function checkPairs(c, r) {
  const { pairs } = c;
  const bank = indexWords(c.words);
  const sshSegs = pairs.sshSegs !== null && typeof pairs.sshSegs === 'object' ? (pairs.sshSegs) : {};
  const minLesson = pairs.sshMinLesson;
  const extra = Object.entries(sshSegs);
  if (extra.length > 0 && typeof minLesson !== 'number') r.error('pairs.json: sshMinLesson must be a lesson number when sshSegs are given');
  for (const [w, segs] of extra) {
    const label = `pairs.json sshSegs ${w}`;
    if (!checkSegs(label, w, segs, r)) continue;
    checkPronunciation(label, w, segs, r);
    const lesson = wordLesson(segs);
    if (typeof minLesson === 'number' && !(lesson <= minLesson)) r.error(`${label}: not decodable at sshMinLesson ${minLesson} (wordLesson gives ${fmtLesson(lesson)})`);
  }

  const soundsOf = (w, kind) => {
    const own = sshSegs[w];
    const segs = bank.get(w)?.segs ?? (kind === 'ssh' && isSegs(own) ? own : null);
    const key = segs ? renderings(segs)[0] : (r.cmu?.get(w)?.[0] ? pronKey(r.cmu.get(w)[0]) : undefined);
    return key ? key.split(' ') : null;
  };

  for (const kind of (['ie', 'ssh'])) {
    for (const pair of list(pairs[kind])) {
      if (!Array.isArray(pair) || pair.length !== 2 || !pair.every(x => typeof x === 'string')) {
        r.error(`pairs.json ${kind}: ${JSON.stringify(pair)} must be two words`);
        continue;
      }
      const label = `pairs.json ${kind} ${pair[0]}/${pair[1]}`;
      const [a, b] = pair.map(lower);
      for (const w of [a, b]) {
        if (kind === 'ie' && !bank.has(w)) r.error(`${label}: "${w}" is not in words.json`);
        if (kind === 'ssh' && !bank.has(w) && !isSegs(sshSegs[w])) r.error(`${label}: "${w}" is not in words.json or pairs.sshSegs`);
      }
      const sa = soundsOf(a, kind);
      const sb = soundsOf(b, kind);
      if (!sa || !sb) continue;
      const at = sa.length === sb.length ? sa.flatMap((s, i) => (s === sb[i] ? [] : [i])) : [];
      const swap = at.length === 1 ? [sa[at[0]], sb[at[0]]].sort().join('/') : '';
      if (swap !== PAIR_SWAPS[kind]) r.error(`${label}: the words must differ only by ${PAIR_NAMES[kind]}`);
      else if (kind === 'ie' && NASALS.has(sa[at[0] + 1])) r.error(`${label}: the vowel is followed by a nasal (m, n or ng)`);
    }
  }
}

function checkStory(c, r) {
  const lexicon = indexWords(c.words, c.nonsense, c.instant);
  const instant = new Set(c.instant.map(rec => lower(rec?.w)));
  const lookup = (w) => lexicon.get(w) ?? null;
  let bookTwo = false;
  for (const ch of c.story) {
    const label = `story ${ch?.id}`;
    const book = ch?.book;
    if (book !== undefined && book !== 2) r.error(`${label}: book ${JSON.stringify(book)} must be 2 (Book Two) or left out (Book One)`);
    else if (book === 2) bookTwo = true;
    else if (bookTwo) r.error(`${label}: a Book One chapter after Book Two has begun`);
    const lessons = list(ch?.lessons).filter(n => Number.isFinite(n));
    if (lessons.length === 0) { r.error(`${label}: lessons must list at least one lesson number`); continue; }
    const first = Math.min(...lessons);
    const known = list(ch.requiresKnown).map(lower);
    for (const w of known) if (!instant.has(w)) r.error(`${label}: requiresKnown "${w}" is not in instant-words.json`);
    for (const scene of scenesOf(ch)) {
      const own = scene?.lesson;
      if (own === first) r.error(`${label} ${scene.id}: lesson ${own} is the chapter's first, so the scene leaves it out`);
      else if (own !== undefined && !lessons.includes(own)) r.error(`${label} ${scene.id}: lesson ${JSON.stringify(own)} is not one of the chapter's lessons`);
      const taughtUpTo = own ?? first;
      const ctx = {
        lookup,
        knownInstant: new Set(known),
        names: new Set(c.names.filter(n => isSegs(n?.segs) && wordLesson(n.segs) <= taughtUpTo).map(n => lower(n.display))),
        taughtUpTo,
      };
      for (const s of list(scene?.sentences)) {
        const blockers = sentenceBlockers(String(s?.text ?? ''), ctx);
        if (blockers.length > 0) r.error(`${label} ${scene.id} sentence ${s?.id}: "${s?.text}" is not readable at lesson ${taughtUpTo}: ${blockers.join(', ')}`);
        if (typeof s?.prince !== 'string') continue;
        const hisBlockers = sentenceBlockers(s.prince, ctx);
        if (hisBlockers.length > 0) r.error(`${label} ${scene.id} sentence ${s?.id} (prince): "${s.prince}" is not readable at lesson ${taughtUpTo}: ${hisBlockers.join(', ')}`);
      }
    }
  }
}

const HERO_WORN = new Set(['outfit', 'crown']);
const PAGE_TWIN = '-prince';

function checkPrinceThings(c, r) {
  for (const item of c.wardrobe) {
    if (!HERO_WORN.has(item?.slot)) continue;
    if (typeof item.prince !== 'string' || item.prince.trim() === '') r.error(`${LIST_FILES.wardrobe} ${item.id}: an outfit or crown needs a prince label`);
  }
  const ids = new Set(c.colorin.map(p => p?.id));
  for (const page of c.colorin) {
    const id = page?.id;
    if (typeof id !== 'string' || !id.endsWith(PAGE_TWIN)) continue;
    const base = id.slice(0, -PAGE_TWIN.length);
    if (!ids.has(base)) r.error(`${LIST_FILES.colorin} ${id}: a ${PAGE_TWIN} page needs the page it twins, ${base}`);
  }
}

function checkPictures(c, r) {
  const names = c.names.filter(n => typeof n?.display === 'string' && n.display !== '').map(n => n.display);
  const named = names.map(n => [n, new RegExp(`(?<![\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'iu')]);
  for (const ch of c.story) {
    for (const scene of scenesOf(ch)) {
      const label = `story ${ch?.id} ${scene?.id}`;
      const picture = scene?.picture;
      if (typeof picture !== 'string' || picture.trim() === '') {
        r.error(`${label}: picture is missing (one sentence describing the scene, for its coloring page)`);
        continue;
      }
      if (picture.length > PICTURE_MAX) r.error(`${label}: picture is ${picture.length} characters (at most ${PICTURE_MAX})`);
      const found = named.filter(([, re]) => re.test(picture)).map(([n]) => n);
      if (found.length > 0) r.error(`${label}: picture names ${found.join(', ')} (describe characters without their names, like "a goofy crow")`);
    }
  }
}

function* stringsIn(v) {
  if (typeof v === 'string') yield v;
  else if (Array.isArray(v)) for (const x of v) yield* stringsIn(x);
  else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) yield* stringsIn(x);
}

function checkPrince(label, record, r) {
  if (!hasPrince(record)) return;
  const { prince, text } = record;
  if (typeof prince !== 'string' || prince.trim() === '') r.error(`${label}: prince must be a non-empty string`);
  else if (prince === text) r.error(`${label}: prince is the same as its text; leave it out`);
}

function checkVoice(c, content, r) {
  const has = (id) => typeof id === 'string' && Object.hasOwn(c.voice, id);
  for (const ch of c.story) {
    for (const scene of scenesOf(ch)) {
      const lines = [...list(scene?.intro), ...list(scene?.outro), ...(scene?.question?.line === undefined ? [] : [scene.question.line])];
      for (const id of lines) if (!has(id)) r.error(`story ${ch.id} ${scene.id}: voice line "${id}" is not in voice.json`);
      for (const s of list(scene?.sentences)) checkPrince(`story ${ch.id} ${scene.id} sentence ${s?.id}`, s, r);
    }
  }
  for (const [id, line] of Object.entries(c.voice)) {
    if (id.endsWith(PRINCE_TWIN)) r.error(`voice.json ${id}: a voice key may not end in ${PRINCE_TWIN}; that ending is kept for a line's second clip`);
    checkPrince(`voice.json ${id}`, line, r);
    if (typeof line?.text === 'string' && PRINCESS.test(line.text)) {
      if (!hasPrince(line)) r.error(`voice.json ${id}: it says princess, so it needs a prince version`);
      else if (typeof line.prince === 'string' && PRINCESS.test(line.prince)) r.error(`voice.json ${id}: its prince version still says princess`);
    }
  }
  for (const [key, value] of Object.entries(content)) {
    if (key === 'voice' || key === 'byWord' || key === 'missing') continue;
    for (const s of stringsIn(value)) if (/^v\.\S/.test(s) && !has(s.slice(2))) r.error(`${FILE_OF[key] ?? key}: voice clip "${s}" is not in voice.json`);
  }
}

const WARMUP_SAYS_WORD = new Set(['blend', 'isolate', 'segment', 'syllables', 'delete', 'substitute', 'affix']);
const WARMUP_SAYS_ANSWER = new Set(['delete', 'substitute', 'affix']);

function clipRefs(c) {
  const refs = new Set();
  const addWord = (w) => { if (typeof w === 'string' && w !== '') refs.add(`w.${w}`); };
  const items = list(c.checks.items);
  for (const rec of indexWords(c.words, c.nonsense, c.instant, items).values()) {
    refs.add(`w.${rec.w}`);
    for (const code of codesOf(rec.segs)) refs.add(`p.${code}`);
    if (Array.isArray(rec.segs)) for (const id of [...rec.segs.flatMap(boxClips), ...wordSoundClips(rec)]) refs.add(id);
  }
  for (const rec of items) tokenize(rec?.phrase ?? '').forEach(addWord);
  for (const rec of c.letters) for (const id of list(rec?.sounds)) if (typeof id === 'string') refs.add(id);
  for (const w of list(c.entrance?.dictation)) refs.add(`w.${w}`);
  for (const line of list(c.entrance?.ladder)) list(line?.words).forEach(addWord);
  for (const kind of (['ie', 'ssh'])) {
    for (const pair of list(c.pairs[kind])) if (Array.isArray(pair) && pair.length === 2) pair.forEach(addWord);
  }
  for (const it of c.warmup) {
    if (WARMUP_SAYS_WORD.has(it?.type)) addWord(it.word);
    if (WARMUP_SAYS_ANSWER.has(it?.type)) addWord(it.answer);
    if (it?.type === 'affix' && typeof it.affix === 'string') refs.add(chunkClip(it.affix));
    if (it?.type === 'syllables') list(it.parts).forEach(addWord);
  }
  for (const it of c.warmup) for (const s of list(it?.sounds)) refs.add(`p.${s}`);
  for (const ch of c.story) {
    for (const scene of scenesOf(ch)) {
      for (const s of list(scene?.sentences)) {
        const clip = `s.${s?.id}`;
        refs.add(clip);
        if (hasPrince(s)) refs.add(clip + PRINCE_TWIN);
      }
    }
  }
  for (const rec of c.robot) if (typeof rec?.w === 'string' && rec.w !== '') refs.add(`rr.${rec.w}`);
  for (const [id, line] of Object.entries(c.voice)) {
    const clip = `v.${id}`;
    refs.add(clip);
    if (hasPrince(line)) refs.add(clip + PRINCE_TWIN);
  }
  return refs;
}

function artPath(ref, group, ext) {
  const id = ref.includes('/') ? ref : `${group}/${ref}`;
  if (id.startsWith('assets/')) return id;
  if (/\.(png|webp|svg)$/.test(id)) return `assets/art/${id}`;
  return `assets/art/${ext ? id + ext : artFile(id)}`;
}

function artRefs(c) {
  const refs = new Map();
  const add = (label, ref, group, ext) => {
    if (typeof ref !== 'string' || ref === '') return;
    const p = artPath(ref, group, ext);
    if (!refs.has(p)) refs.set(p, label);
  };
  for (const w of c.words) add(`${LIST_FILES.words} ${w?.w}`, w?.trick, 'tricks');
  for (const w of c.words) if (w?.pic === true) add(`${LIST_FILES.words} ${w?.w}`, w?.w, 'tricks');
  for (const it of c.warmup) if (it?.type === 'blend') for (const x of list(it.choices)) add(`${LIST_FILES.warmup} ${it.id}`, x, 'tricks');
  for (const ch of c.story) {
    add(`story ${ch?.id}`, ch?.page, 'tricks');
    for (const scene of scenesOf(ch)) {
      const label = `story ${ch.id} ${scene?.id}`;
      add(label, scene?.bg, 'bg');
      for (const who of list(scene?.cast)) if (!LAYERED_CAST.has(who)) add(label, who, 'cast');
      for (const s of list(scene?.sentences)) add(label, s?.trick, 'tricks');
      for (const x of list(scene?.question?.choices)) add(label, x, 'tricks');
    }
  }
  for (const item of c.wardrobe) {
    add(`${LIST_FILES.wardrobe} ${item?.id}`, item?.art, 'wardrobe');
    if (HERO_WORN.has(item?.slot) && typeof item?.id === 'string') add(`${LIST_FILES.wardrobe} ${item.id}`, `prince/${item.id}`, 'prince');
  }
  for (const page of c.colorin) add(`${LIST_FILES.colorin} ${page?.id}`, page?.svg, 'colorin', '.svg');
  return refs;
}

function checkSceneGifts(c, r) {
  const wardrobe = new Set(c.wardrobe.map(item => item?.id));
  for (const ch of c.story) {
    for (const scene of scenesOf(ch)) {
      const gift = scene?.reward?.wardrobe;
      if (gift !== undefined && !wardrobe.has(gift)) r.error(`story ${ch.id} ${scene.id}: reward.wardrobe ${JSON.stringify(gift)} is not in ${LIST_FILES.wardrobe}`);
    }
  }
}

function practicedWords(c) {
  const seen = new Map();
  const add = (where, words) => { for (const w of words) if (typeof w === 'string' && !seen.has(lower(w))) seen.set(lower(w), where); };
  add(LIST_FILES.words, c.words.map(rec => rec?.w));
  add(LIST_FILES.nonsense, c.nonsense.map(rec => rec?.w));
  add(LIST_FILES.instant, c.instant.map(rec => rec?.w));
  add(LIST_FILES.chains, c.chains.flatMap(ch => list(ch?.steps)));
  add(FILE_OF.pairs, [...list(c.pairs.ie).flat(), ...list(c.pairs.ssh).flat(), ...Object.keys(obj(c.pairs.sshSegs))]);
  add(LIST_FILES.warmup, c.warmup.flatMap(it => [WARMUP_SAYS_WORD.has(it?.type) ? it.word : null, WARMUP_SAYS_ANSWER.has(it?.type) ? it.answer : null]));
  add(FILE_OF.entrance, [...list(c.entrance.lines).flatMap(l => list(l?.words)), ...list(c.entrance.ladder).flatMap(l => list(l?.words)), ...list(c.entrance.dictation), ...tokenize(c.entrance.passage?.text ?? '')]);
  for (const ch of c.story) add(`story ${ch?.id}`, scenesOf(ch).flatMap(sc => list(sc?.sentences)).flatMap(s => tokenize(s?.text ?? '')));
  return seen;
}

function checkPlaces(checks, r) {
  const file = FILE_OF.checks;
  const uses = [];
  const forms = list(checks.forms);
  for (const id of repeated(forms.map(form => form?.id))) r.error(`${file}: form id ${id} is used twice`);
  for (const id of repeated(forms.map(form => form?.passage?.id))) r.error(`${file}: passage id ${id} is used twice`);
  forms.forEach((form, i) => {
    if (!recordLabel(file, form?.id, i, r)) return;
    for (const [part, count] of (Object.entries(FORM_LINES))) {
      const rows = list(form[part]);
      if (rows.length !== count) r.error(`${file} ${form.id}: needs ${count} ${part} line${count === 1 ? '' : 's'}, not ${rows.length}`);
      rows.forEach((row, n) => {
        const where = `${form.id} ${part} line ${n + 1}`;
        if (list(row).length !== LINE_WORDS) r.error(`${file} ${where}: has ${list(row).length} words, not ${LINE_WORDS}`);
        for (const w of list(row)) uses.push({ w, where, real: part === 'real' });
      });
    }
    const spell = list(form.spell);
    if (spell.length !== FORM_SPELLED) r.error(`${file} ${form.id}: needs ${FORM_SPELLED} spell words, not ${spell.length}`);
    for (const w of spell) uses.push({ w, where: `${form.id} spell`, real: true, dictated: true });
  });
  for (const [set, pool] of Object.entries(obj(checks.pools))) {
    if (!POOL_LESSON.has(set)) r.error(`${file} pool ${set}: not a pattern set (${[...POOL_LESSON.keys()].join(', ')})`);
    if (!Array.isArray(pool?.real) || !Array.isArray(pool?.nonsense)) { r.error(`${file} pool ${set}: real and nonsense must be lists of words`); continue; }
    for (const w of pool.real) uses.push({ w, where: `pool ${set} real`, real: true, set });
    for (const w of pool.nonsense) uses.push({ w, where: `pool ${set} nonsense`, real: false, set });
  }
  return uses;
}

const sentencesOf = (text) => String(text).split(/(?<=[.!?]["”’']?)\s+(?=["“‘']?\p{Lu})|\n+/u).map(s => tokenize(s).join(' ')).filter(s => s !== '');

function checkPassages(c, r) {
  const file = FILE_OF.checks;
  const lexicon = indexWords(c.words, c.instant);
  const lookup = (w) => lexicon.get(w)?.segs ?? null;
  const names = new Set(c.names.filter(n => isSegs(n?.segs) && wordLesson(n.segs) <= CHECK_LESSON).map(n => lower(n.display)));
  const story = new Set(c.story.flatMap(ch => scenesOf(ch).flatMap(sc => list(sc?.sentences))).flatMap(s => sentencesOf(s?.text ?? '')));
  for (const form of list(c.checks.forms)) {
    if (typeof form?.id !== 'string' || form.id === '') continue;
    const { passage } = form;
    if (obj(passage) !== passage) { r.error(`${file} ${form.id}: needs a passage`); continue; }
    const label = `${file} ${form.id} passage`;
    const text = String(passage.text ?? '');
    const words = tokenize(text);
    if (typeof passage.id !== 'string' || passage.id === '') r.error(`${label}: needs an id`);
    if (words.length < PASSAGE_MIN || words.length > PASSAGE_MAX) r.error(`${label}: has ${words.length} words (${PASSAGE_MIN} to ${PASSAGE_MAX})`);
    if (passage.wordCount !== words.length) r.error(`${label}: wordCount is ${passage.wordCount}, but it has ${words.length} words`);
    const blockers = sentenceBlockers(text, { lookup, knownInstant: HEARTS_AT_CHECK, names, taughtUpTo: CHECK_LESSON });
    if (blockers.length > 0) r.error(`${label}: not readable at lesson ${CHECK_LESSON}: ${blockers.join(', ')}`);
    const rWords = [...new Set(words)].filter((w) => { const segs = lookup(w); return segs !== null && tierOf(segs) === R_TIER; });
    if (rWords.length > 0) r.error(`${label}: has a tier-4 word: ${rWords.join(', ')}`);
    for (const s of new Set(sentencesOf(text))) if (story.has(s)) r.error(`${label}: "${s}" is a story sentence`);
  }
}


function checkPhrase(label, rec, needed, bank, r) {
  if (rec.phrase === null || rec.phrase === undefined) {
    if (needed) r.error(`${label}: needs a phrase, since it can be dictated`);
    return;
  }
  const w = lower(rec.w);
  const words = tokenize(rec.phrase);
  if (!words.includes(w)) r.error(`${label}: phrase does not hold the word`);
  for (const t of words) if (t !== w && !bank.has(t) && !PHRASE_HEARTS.has(t)) r.error(`${label}: phrase word "${t}" is not in words.json`);
}

const swapsOf = (w) => [...w].flatMap((ch, i) => [...(KIND_SWAPS[ (ch)] ?? '')].map(to => w.slice(0, i) + to + w.slice(i + 1)));

function checkHeldOut(c, blocklist, madeUp, r) {
  const file = FILE_OF.checks;
  const { checks } = c;
  for (const key of (['forms', 'items'])) if (checks[key] !== undefined && !Array.isArray(checks[key])) r.error(`${file}: ${key} must be a list`);
  if (checks.pools !== undefined && obj(checks.pools) !== checks.pools) r.error(`${file}: pools must be {"<set>": {"real": [...], "nonsense": [...]}, ...}`);
  const uses = checkPlaces(checks, r);
  checkPassages(c, r);

  const items = list(checks.items);
  const blocked = new Set([...items.map(rec => rec?.w), ...uses.map(u => u.w)].filter(w => typeof w === 'string' && isBlocked(w, blocklist)));
  const shown = (w) => (blocked.has(w) ? HIDDEN : w);

  for (const w of repeated(items.map(rec => rec?.w))) r.error(`${file}: "${shown(w)}" has more than one record in items`);
  const records = new Map(items.map(rec => [rec?.w, rec]));
  const usedAt = new Map();
  const dictable = new Set();
  for (const { w, where, real, set, dictated } of uses) {
    const word = `${file} ${where}: "${shown(w)}"`;
    if (usedAt.has(w)) r.error(`${file} ${shown(w)}: used twice (${usedAt.get(w)}, then ${where})`);
    else usedAt.set(w, where);
    const rec = records.get(w);
    if (!rec) { r.error(`${word} has no record in items`); continue; }
    if (dictated || (set !== undefined && rec.real === true && canDictate(rec))) dictable.add(w);
    if (typeof rec.real === 'boolean' && rec.real !== real) r.error(`${word} is a ${rec.real ? 'real' : 'made-up'} word`);
    if (!isSegs(rec.segs)) continue;
    const lesson = wordLesson(rec.segs, rec);
    if (set === undefined && !(lesson <= CHECK_LESSON)) r.error(`${word} is an anchor, but is not decodable at ${CHECK_LESSON} (wordLesson gives ${fmtLesson(lesson)})`);
    const range = set === undefined ? undefined : POOL_LESSON.get(set);
    if (range && !(lesson >= range[0] && lesson <= range[1])) r.error(`${word} has lesson ${fmtLesson(lesson)}, not ${fmtRange(range)}`);
    if (dictated && hasNasalIE(rec.segs)) r.error(`${word} has i or e before m, n or ng, so it cannot be dictated`);
  }

  const practiced = practicedWords(c);
  const bank = new Set(c.words.map(rec => lower(rec?.w)));
  items.forEach((rec, i) => {
    const at = `${file} #${i + 1}`;
    const label = blocked.has(rec?.w) ? at : recordLabel(file, rec?.w, i, r);
    if (!label) return;
    const w = lower(rec.w);
    if (blocked.has(rec.w)) r.error(`${at}: matches the blocklist ${HIDDEN}`);
    if (swapsOf(w).some(misread => isBlocked(misread, blocklist))) r.error(`${at}: one i/e or b/d/p swap matches the blocklist ${HIDDEN}`);
    if (!usedAt.has(rec.w)) r.error(`${label}: in items, but no form or pool uses it`);
    if (practiced.has(w)) r.error(`${label}: also in ${practiced.get(w)}`);
    if (typeof rec.real !== 'boolean') r.error(`${label}: real must be true or false`);
    if (!checkSegs(label, rec.w, rec.segs, r)) return;
    checkLessonTier(label, rec, r);
    if (rec.real === true) checkPronunciation(label, rec.w, rec.segs, r, true);
    if (rec.real === false) madeUp(label, w, rec.segs);
    const base = w.slice(0, -1);
    if (lower(rec.segs[rec.segs.length - 1][0]) === 's' && bank.has(base)) r.error(`${label}: the plain -s form of "${base}", a word-bank word`);
    checkPhrase(label, rec, dictable.has(rec.w), bank, r);
  });
}

function programTerm(text) {
  const words = ` ${tokenize(text).join(' ')} `;
  return PROGRAM_TERMS.find(term => words.includes(` ${term} `));
}

const isPoint = (dot) => Array.isArray(dot) && dot.length === 2 && dot.every(Number.isFinite);

const isSoundClip = (id) => typeof id === 'string' && id.startsWith('p.') && id !== 'p.' && Object.hasOwn(PHONEMES, id.slice(2));

function checkStep(id, step, n, r) {
  const at = `${LIST_FILES.letters} ${id} step ${n + 1}`;
  if (typeof step?.d !== 'string' || !/^\s*[Mm]/.test(step.d)) r.error(`${at}: d must be an SVG path`);
  if (typeof step?.say !== 'string' || !/^v\.\S/.test(step.say)) r.error(`${at}: say must be a voice clip id (v.<line>)`);
  const lift = step?.lift;
  if (lift !== undefined && lift !== true) r.error(`${at}: lift must be true or left out`);
  else if (n === 0 && lift === true) r.error(`${at}: a first step has no lift`);

  const dots = list(step?.dots);
  if (!dots.every(isPoint)) { r.error(`${at}: each dot must be [x, y]`); return; }
  if (DOTTED.has(id) && dots.length === 1) {
    if (lift !== true) r.error(`${at}: the dot of ${id} needs lift: true`);
  } else if (dots.length < 2 || dots.length > MAX_STEP_DOTS) {
    r.error(`${at}: has ${dots.length} dots (2 to ${MAX_STEP_DOTS}, or 1 for the dot of i or j)`);
  }
  if (dots.length === 0) return;
  if (dots[0][1] > dots[dots.length - 1][1] && !ALLOW_UP.has(id)) r.error(`${at}: goes up, and ${id} is not on ALLOW_UP`);
  for (let a = 0; a < dots.length; a++) {
    for (let b = a + 1; b < dots.length; b++) {
      if (Math.hypot(dots[a][0] - dots[b][0], dots[a][1] - dots[b][1]) < MIN_DOT_GAP) r.error(`${at}: dots ${a + 1} and ${b + 1} are under ${MIN_DOT_GAP}px apart`);
    }
  }
}

function checkLetter(rec, r) {
  const { id } = rec;
  const label = `${LIST_FILES.letters} ${id}`;
  const capital = id !== lower(id);
  const families = capital ? CAPITAL_FAMILIES : LOWER_FAMILIES;
  if (rec.case !== (capital ? 'upper' : 'lower')) r.error(`${label}: case must be "${capital ? 'upper' : 'lower'}"`);
  if (!families.includes(rec.family)) r.error(`${label}: family must be one of ${families.join(', ')}`);
  const term = programTerm(rec.family ?? '');
  if (term) r.error(`${label}: uses a program's own term, "${term}"`);
  if (!Array.isArray(rec.sounds) || rec.sounds.length === 0 || !rec.sounds.every(isSoundClip)) r.error(`${label}: sounds must be a non-empty list of p.* ids`);
  if (![rec.box?.w, rec.box?.h].every(n => Number.isFinite(n) && n > 0)) r.error(`${label}: box must be {"w": <px>, "h": <px>}`);

  const steps = list(rec.strokes);
  if (steps.length === 0) { r.error(`${label}: strokes must list at least one step`); return; }
  steps.forEach((step, n) => checkStep(id, step, n, r));
  if (lower(id) === 'z') {
    const first = list(steps[0]?.dots).filter(isPoint);
    if (!(first.length > 1 && first[0][0] < first[first.length - 1][0])) r.error(`${label}: the first step must go right`);
  }
  const heights = steps.flatMap(step => list(step?.dots)).filter(isPoint).map(dot => dot[1]);
  if (heights.length > 0 && !START_LOW.has(id) && heights[0] > (Math.min(...heights) + Math.max(...heights)) / 2) {
    r.error(`${label}: the first dot is in the lower half of its ink, and ${id} is not on START_LOW`);
  }
}

function checkLetters(c, r) {
  const file = LIST_FILES.letters;
  const ids = c.letters.map(rec => rec?.id);
  if (ids.length > 0) {
    const absent = LETTER_IDS.filter(id => !ids.includes(id));
    if (absent.length > 0) r.error(`${file}: no record for ${absent.join(', ')}`);
    for (const id of repeated(ids)) r.error(`${file}: ${id} has more than one record`);
  }
  c.letters.forEach((rec, i) => {
    if (!recordLabel(file, rec?.id, i, r)) return;
    if (LETTER_IDS.includes(rec.id)) checkLetter(rec, r);
    else r.error(`${file} ${rec.id}: not a letter a to z`);
  });
  const familyOf = (id) => c.letters.find(rec => rec?.id === id)?.family;
  if (familyOf('b') !== undefined && familyOf('b') === familyOf('d')) r.error(`${file}: b and d are both in family ${familyOf('b')}`);

  const said = c.letters.flatMap(rec => list(rec?.strokes)).map(step => String(step?.say).slice(2));
  for (const id of new Set([...Object.keys(c.voice).filter(line => line.startsWith('pencil.')), ...said])) {
    const term = Object.hasOwn(c.voice, id) ? programTerm(c.voice[id]?.text ?? '') : undefined;
    if (term) r.error(`voice.json ${id}: uses a program's own term, "${term}"`);
  }
}

export const LADDER_WORDS = 5;

function checkLadder(c, r) {
  const file = FILE_OF.entrance;
  const ladder = c.entrance.ladder;
  if (ladder === undefined) return;
  if (!Array.isArray(ladder)) { r.error(`${file}: ladder must be a list`); return; }
  const bank = new Map(c.words.map(rec => [rec?.w, rec]));
  const dictated = new Set(list(c.entrance.dictation));
  for (const id of repeated(ladder.map(line => line?.id))) r.error(`${file}: ladder line ${id} is used twice`);
  for (const w of repeated(ladder.flatMap(line => list(line?.words)))) r.error(`${file}: ladder word "${w}" is used twice`);
  let below = 0;
  ladder.forEach((line, i) => {
    const label = `${file} ladder ${typeof line?.id === 'string' && line.id !== '' ? line.id : `#${i + 1}`}`;
    if (typeof line?.id !== 'string' || line.id === '') r.error(`${label}: needs an id`);
    const lesson = line?.lesson;
    if (!Number.isInteger(lesson) || !LESSONS.some(l => l.n === lesson)) { r.error(`${label}: lesson must be a UFLI lesson number`); return; }
    if (lesson <= below) r.error(`${label}: lesson ${lesson} is not above the line before's (${below})`);
    const words = list(line.words);
    if (words.length !== LADDER_WORDS || new Set(words).size !== words.length) r.error(`${label}: needs ${LADDER_WORDS} different words`);
    for (const w of words) {
      const rec = bank.get(w);
      if (!rec) { r.error(`${label}: "${w}" is not in ${LIST_FILES.words}`); continue; }
      if (dictated.has(w)) r.error(`${label}: "${w}" is dictated in the quest`);
      if (!isSegs(rec.segs)) continue;
      const at = wordLesson(rec.segs, rec);
      if (!(at <= lesson)) r.error(`${label}: "${w}" reads at ${fmtLesson(at)}, past lesson ${lesson}`);
      else if (!(at > below)) r.error(`${label}: "${w}" reads at ${fmtLesson(at)}, which the line before covers`);
    }
    below = Math.max(below, lesson);
  });
}

function checkRobot(c, r) {
  const file = LIST_FILES.robot;
  for (const w of repeated(c.robot.map(rec => rec?.w))) r.error(`${file}: ${w} has more than one record`);
  const symbols = new Set([...Object.values(PHONEMES).flatMap(p => [...p.ipa]), 'ˈ']);
  c.robot.forEach((rec, i) => {
    if (!recordLabel(file, rec?.w, i, r)) return;
    const label = `${file} ${rec.w}`;
    if (!ROBOT_WORDS.includes(rec.w)) { r.error(`${label}: not one of the robot reading words`); return; }
    const iw = c.instant.find(x => x?.w === rec.w);
    if (!iw) r.error(`${label}: not in ${LIST_FILES.instant}`);
    const wrong = rec.wrong;
    if (typeof wrong !== 'string' || wrong === '' || ![...wrong].every(ch => symbols.has(ch)) || [...wrong].filter(ch => ch === 'ˈ').length !== 1) {
      r.error(`${label}: wrong must be IPA of the game's sounds, with one stress mark`);
      return;
    }
    const real = list(iw?.segs).map(seg => PHONEMES[seg?.[1]]?.ipa ?? '').join('');
    if (iw && wrong.replace(/ˈ/g, '') === real) r.error(`${label}: wrong is the word's real reading`);
  });
}

export function validateContent(content, { cmu, audioManifest, artExists } = {}) {
  const errors = new Set();
  const warnings = new Set();
  const r = { error: (m) => errors.add(m), warn: (m) => warnings.add(m), cmu };

  for (const path of list(content.missing)) r.warn(`${path}: not found; an empty default was used`);
  for (const [key, file] of Object.entries(LIST_FILES)) if (content[key] !== undefined && !Array.isArray(content[key])) r.error(`${file}: must be a list`);
  if (content.checks !== undefined && obj(content.checks) !== content.checks) r.error(`${FILE_OF.checks}: must be {"forms": [...], "pools": {...}, "items": [...]}`);

  const c = {
    words: list(content.words), nonsense: list(content.nonsense), instant: list(content.instant), chains: list(content.chains),
    pairs: (obj(content.pairs)), warmup: list(content.warmup), entrance: (obj(content.entrance)),
    names: list(content.names), voice: (obj(content.voice)), wardrobe: list(content.wardrobe),
    colorin: list(content.colorin), rewards: list(content.rewards), checks: (obj(content.checks)), letters: list(content.letters),
    robot: list(content.robot), blocklist: (content.blocklist), story: list(content.story),
    byWord: new Map(), missing: [],
  };

  checkRecords(c, r);
  const blocklist = readBlocklist(c.blocklist, r);
  const madeUp = madeUpTest(c, blocklist, r);
  checkNonsense(c, blocklist, madeUp, r);
  checkChains(c, r);
  checkPairs(c, r);
  checkStory(c, r);
  checkVoice(c, content, r);
  if (audioManifest) {
    for (const id of clipRefs(c)) if (!Object.hasOwn(audioManifest, id)) r.error(`assets: audio clip ${id} is not in assets/audio/manifest.json`);
  }
  if (artExists) {
    for (const [path, label] of artRefs(c)) if (!artExists(path)) r.error(`${label}: art ${path} does not exist`);
    checkSceneGifts(c, r);
  }
  checkPictures(c, r);
  checkHeldOut(c, blocklist, madeUp, r);
  checkLetters(c, r);
  checkPrinceThings(c, r);
  checkRobot(c, r);
  checkLadder(c, r);
  return { errors: [...errors], warnings: [...warnings] };
}

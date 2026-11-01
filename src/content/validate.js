import { PHONEMES, phonemeCodes } from '../curriculum/phonemes.js';
import { sentenceBlockers, wordLesson } from '../curriculum/decodable.js';
import { tierOf } from '../curriculum/tiers.js';
import { beforeNasal } from '../curriculum/ie-nasal.js';
import { BLOCKLIST_FORMAT, isBlocked } from './blocklist.js';




const LIST_FILES = Object.freeze({
  words: 'words.json', nonsense: 'nonsense.json', instant: 'instant-words.json', chains: 'chains.json',
  warmup: 'warmup.json', names: 'names.json', wardrobe: 'wardrobe.json', colorin: 'colorin.json',
  rewards: 'rewards.json', story: 'story',
});

const FILE_OF = { ...LIST_FILES, pairs: 'pairs.json', entrance: 'entrance.json', blocklist: 'blocklist.json' };

const PAIR_SWAPS = Object.freeze({ ie: 'EH/IH', ssh: 'S/SH' });
const PAIR_NAMES = Object.freeze({ ie: 'i↔e', ssh: 's↔sh' });
const NASALS = new Set(['M', 'N', 'NG']);

const PICTURE_MAX = 200;

const LAYERED_CAST = new Set(['princess', 'kitten']);

const list = (v) => (Array.isArray(v) ? v : []);
const lower = (s) => String(s).toLowerCase();
const fmtLesson = (n) => (Number.isFinite(n) ? String(n) : 'Infinity: not decodable through lesson 68');

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

function checkPronunciation(label, w, segs, r) {
  if (!r.cmu) return;
  const said = renderings(segs);
  if (said.length === 0) return;
  const prons = r.cmu.get(lower(w));
  if (!prons) { r.warn(`${label}: not in CMUdict; pronunciation not checked`); return; }
  const dict = [...new Set(prons.map(pronKey))];
  if (!dict.some(k => said.includes(k))) r.error(`${label}: segs say "${said[0]}", but CMUdict has ${dict.map(k => `"${k}"`).join(' or ')}`);
}

function checkRecords(c, r) {
  for (const key of (['words', 'nonsense'])) {
    c[key].forEach((rec, i) => {
      const label = recordLabel(LIST_FILES[key], rec?.w, i, r);
      if (!label || !checkSegs(label, rec.w, rec.segs, r)) return;
      const lesson = wordLesson(rec.segs);
      const tier = tierOf(rec.segs);
      if (rec.lesson !== lesson) r.error(`${label}: lesson is ${rec.lesson}, but wordLesson gives ${fmtLesson(lesson)}`);
      if (rec.tier !== tier) r.error(`${label}: tier is ${rec.tier}, but tierOf gives ${tier}`);
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
  for (const it of c.warmup) {
    const unknown = [...new Set(list(it?.sounds).filter(s => typeof s !== 'string' || s === '' || !Object.hasOwn(PHONEMES, s)))];
    if (unknown.length > 0) r.error(`${LIST_FILES.warmup} ${it?.id}: unknown phoneme code(s): ${unknown.join(', ')}`);
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

function checkNonsense(c, r) {
  const real = indexWords(c.words, c.instant);
  const blocklist = readBlocklist(c.blocklist, r);
  let soundsLike = null;
  const realSounds = () => {
    if (soundsLike) return soundsLike;
    soundsLike = new Map();
    for (const [w, rec] of real) for (const k of renderings(rec.segs)) if (!soundsLike.has(k)) soundsLike.set(k, w);
    if (r.cmu) for (const [w, prons] of r.cmu) for (const p of prons) { const k = pronKey(p); if (!soundsLike.has(k)) soundsLike.set(k, w); }
    return soundsLike;
  };

  for (const [i, n] of c.nonsense.entries()) {
    if (typeof n?.w !== 'string' || !isSegs(n.segs)) continue;
    const w = lower(n.w);
    const label = `${LIST_FILES.nonsense} ${n.w}`;
    if (real.has(w)) r.error(`${label}: is a real word (in words.json or instant-words.json)`);
    if (r.cmu?.has(w)) r.error(`${label}: is a real word (in CMUdict)`);
    const twin = renderings(n.segs).map(k => realSounds().get(k)).find(x => x !== undefined && x !== w);
    if (twin) r.error(`${label}: sounds the same as the real word "${twin}"`);
    if (isBlocked(w, blocklist)) r.error(`${LIST_FILES.nonsense} #${i + 1}: matches the blocklist (spelling not shown)`);
  }
  for (const it of c.warmup) {
    if ((it?.type !== 'delete' && it?.type !== 'substitute') || typeof it.answer !== 'string') continue;
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
  const lookup = (w) => lexicon.get(w)?.segs ?? null;
  for (const ch of c.story) {
    const label = `story ${ch?.id}`;
    const lessons = list(ch?.lessons).filter(n => Number.isFinite(n));
    if (lessons.length === 0) { r.error(`${label}: lessons must list at least one lesson number`); continue; }
    const taughtUpTo = Math.min(...lessons);
    const known = list(ch.requiresKnown).map(lower);
    for (const w of known) if (!instant.has(w)) r.error(`${label}: requiresKnown "${w}" is not in instant-words.json`);
    const ctx = {
      lookup,
      knownInstant: new Set(known),
      names: new Set(c.names.filter(n => isSegs(n?.segs) && wordLesson(n.segs) <= taughtUpTo).map(n => lower(n.display))),
      taughtUpTo,
    };
    for (const scene of scenesOf(ch)) {
      for (const s of list(scene?.sentences)) {
        const blockers = sentenceBlockers(String(s?.text ?? ''), ctx);
        if (blockers.length > 0) r.error(`${label} ${scene.id} sentence ${s?.id}: "${s?.text}" is not readable at lesson ${taughtUpTo}: ${blockers.join(', ')}`);
      }
    }
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

function checkVoice(c, content, r) {
  const has = (id) => typeof id === 'string' && Object.hasOwn(c.voice, id);
  for (const ch of c.story) {
    for (const scene of scenesOf(ch)) {
      const lines = [...list(scene?.intro), ...list(scene?.outro), ...(scene?.question?.line === undefined ? [] : [scene.question.line])];
      for (const id of lines) if (!has(id)) r.error(`story ${ch.id} ${scene.id}: voice line "${id}" is not in voice.json`);
    }
  }
  for (const [key, value] of Object.entries(content)) {
    if (key === 'voice' || key === 'byWord' || key === 'missing') continue;
    for (const s of stringsIn(value)) if (/^v\.\S/.test(s) && !has(s.slice(2))) r.error(`${FILE_OF[key] ?? key}: voice clip "${s}" is not in voice.json`);
  }
}

const WARMUP_SAYS_WORD = new Set(['blend', 'isolate', 'segment', 'delete', 'substitute']);
const WARMUP_SAYS_ANSWER = new Set(['delete', 'substitute']);

function clipRefs(c) {
  const refs = new Set();
  const addWord = (w) => { if (typeof w === 'string' && w !== '') refs.add(`w.${w}`); };
  for (const rec of indexWords(c.words, c.nonsense, c.instant).values()) {
    refs.add(`w.${rec.w}`);
    for (const code of codesOf(rec.segs)) refs.add(`p.${code}`);
  }
  for (const w of list(c.entrance?.dictation)) refs.add(`w.${w}`);
  for (const kind of (['ie', 'ssh'])) {
    for (const pair of list(c.pairs[kind])) if (Array.isArray(pair) && pair.length === 2) pair.forEach(addWord);
  }
  for (const it of c.warmup) {
    if (WARMUP_SAYS_WORD.has(it?.type)) addWord(it.word);
    if (WARMUP_SAYS_ANSWER.has(it?.type)) addWord(it.answer);
  }
  for (const it of c.warmup) for (const s of list(it?.sounds)) refs.add(`p.${s}`);
  for (const ch of c.story) for (const scene of scenesOf(ch)) for (const s of list(scene?.sentences)) refs.add(`s.${s?.id}`);
  for (const id of Object.keys(c.voice)) refs.add(`v.${id}`);
  return refs;
}

function artPath(ref, group, ext = '.png') {
  let p = ref.includes('/') ? ref : `${group}/${ref}`;
  if (!p.startsWith('assets/')) p = `assets/art/${p}`;
  return /\.(png|svg)$/.test(p) ? p : p + ext;
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
    for (const scene of scenesOf(ch)) {
      const label = `story ${ch.id} ${scene?.id}`;
      add(label, scene?.bg, 'bg');
      for (const who of list(scene?.cast)) if (!LAYERED_CAST.has(who)) add(label, who, 'cast');
      for (const s of list(scene?.sentences)) add(label, s?.trick, 'tricks');
      for (const x of list(scene?.question?.choices)) add(label, x, 'tricks');
    }
  }
  for (const item of c.wardrobe) add(`${LIST_FILES.wardrobe} ${item?.id}`, item?.art, 'wardrobe');
  for (const page of c.colorin) add(`${LIST_FILES.colorin} ${page?.id}`, page?.svg, 'colorin', '.svg');
  return refs;
}

export function validateContent(content, { cmu, audioManifest, artExists } = {}) {
  const errors = new Set();
  const warnings = new Set();
  const r = { error: (m) => errors.add(m), warn: (m) => warnings.add(m), cmu };

  for (const path of list(content.missing)) r.warn(`${path}: not found; an empty default was used`);
  for (const [key, file] of Object.entries(LIST_FILES)) if (content[key] !== undefined && !Array.isArray(content[key])) r.error(`${file}: must be a list`);

  const obj = ( v) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const c = {
    words: list(content.words), nonsense: list(content.nonsense), instant: list(content.instant), chains: list(content.chains),
    pairs: (obj(content.pairs)), warmup: list(content.warmup), entrance: (obj(content.entrance)),
    names: list(content.names), voice: (obj(content.voice)), wardrobe: list(content.wardrobe),
    colorin: list(content.colorin), rewards: list(content.rewards), blocklist: (content.blocklist), story: list(content.story),
    byWord: new Map(), missing: [],
  };

  checkRecords(c, r);
  checkNonsense(c, r);
  checkChains(c, r);
  checkPairs(c, r);
  checkStory(c, r);
  checkVoice(c, content, r);
  if (audioManifest) {
    for (const id of clipRefs(c)) if (!Object.hasOwn(audioManifest, id)) r.error(`assets: audio clip ${id} is not in assets/audio/manifest.json`);
  }
  if (artExists) {
    for (const [path, label] of artRefs(c)) if (!artExists(path)) r.error(`${label}: art ${path} does not exist`);
  }
  checkPictures(c, r);
  return { errors: [...errors], warnings: [...warnings] };
}

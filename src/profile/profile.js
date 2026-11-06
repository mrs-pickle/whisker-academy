import { LAST_LESSON, LESSONS } from '../curriculum/lessons.js';
import { isPassRecord, normalizePasses } from '../engine/passes.js';
import { isCheckRecord, isPlacement } from '../engine/quest-results.js';
import { clampTaughtUpTo } from './settings.js';







export const POINTER_KEPT = 200;

export function withPointerLog(profile, lesson, day) {
  if (!isNumber(lesson) || !isNumber(day)) return profile;
  const log = Array.isArray(profile.pointerLog) ? profile.pointerLog : [];
  const last = log.at(-1);
  if (last && last.lesson === lesson) return profile;
  const kept = last && last.day === day ? log.slice(0, -1) : log;
  const next = kept.at(-1)?.lesson === lesson ? kept : [...kept, { day, lesson }];
  return { ...profile, pointerLog: next.slice(-POINTER_KEPT) };
}

export const FLASH_KEPT = 60;

export const isFlashRound = (r) => isPlainObject(r) && isNumber(r.day) && isNumber(r.shown) && isNumber(r.first) && r.shown >= 0 && r.first >= 0 && r.first <= r.shown;

export function withFlash(profile, { day, shown, first, ms }) {
  const kept = { day, shown, first };
  if (!isFlashRound(kept) || !isNumber(ms)) return profile;
  return { ...profile, flash: [...(Array.isArray(profile.flash) ? profile.flash : []), kept].slice(-FLASH_KEPT), flashMs: ms };
}


const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => (letter === 'q' ? 'qu' : letter));
const DIGRAPHS = ['sh', 'ch', 'th', 'wh', 'ck'];
const card = (g, status) => Object.freeze({ g, status, keyword: '' });

export const DEFAULT_DECK = Object.freeze([
  ...LETTERS.map((g) => card(g, g === 'i' || g === 'e' ? 'learning' : 'mastered')),
  ...DIGRAPHS.map((g) => card(g, 'learning')),
]);

const PH_LESSON = 50;

const STARTER_WARDROBE = Object.freeze(['o-gown-teal', 'o-gown-pink', 'o-meadow', 'k-hat-blue', 'k-bow-pink', 'k-sun-hat',
  'crown-flower', 'crown-silver']);
export const STARTER_ITEMS = Object.freeze([...STARTER_WARDROBE, 'crown-gold']);
export const LEGACY_STARTERS = Object.freeze(['o-gown-teal', 'o-gown-pink', 'o-tunic-green', 'o-meadow', 'o-pajamas', 'k-hat-blue',
  'crown-flower', 'crown-silver', 'crown-rainbow', 'crown-shell']);
export const WARDROBE_SET = 2;
export const WARDROBE_RENAMES = Object.freeze({ 'o-wizard': 'o-painter', 'o-fairy': 'o-petal' });
const renamedId = (id) => (Object.hasOwn(WARDROBE_RENAMES, id) ? WARDROBE_RENAMES[ (id)] : id);
const STARTER_CRAYONS = ['#e63946', '#f4a261', '#f6d55c', '#6bbf59', '#4a90d9', '#9b6bcc', '#f28fb5', '#8d5b3e'];

export function newProfile(startLesson = 41) {
  const start = clampTaughtUpTo(startLesson);
  return withTaughtLessons({
    princessName: '',
    kittenName: '',
    look: { skin: 's3', hair: 'long', hairColor: 'brown', outfit: 'o-gown-teal', crown: 'gold', kittenFur: 'orange', kittenAcc: 'k-hat-blue' },
    deck: DEFAULT_DECK.map((card) => ({ ...card })),
    instant: {},
    startLesson: start,
    heartSeededTo: 0,
    spellTier: 1,
    baseline: null,
    story: { chapter: 'prologue', scene: 0, side: 0 },
    unlocked: { wardrobe: [...STARTER_WARDROBE], colorin: [], crayons: [...STARTER_CRAYONS], tricks: [], charms: [], sparkles: [] },
    sessions: [],
    giftIndex: 0,
    wardrobeSet: WARDROBE_SET,
  }, start);
}

export function withTaughtLessons(profile, taughtUpTo) {
  const seededTo = profile.heartSeededTo ?? profile.startLesson;
  const instant = { ...profile.instant };
  for (const lesson of LESSONS) {
    if (lesson.n <= seededTo || lesson.n > taughtUpTo) continue;
    for (const word of lesson.heartWords) if (!Object.hasOwn(instant, word)) instant[word] = 'known';
  }
  const addCard = taughtUpTo >= PH_LESSON && !profile.deck.some((c) => c.g === 'ph');
  return {
    ...profile,
    instant,
    heartSeededTo: Math.max(seededTo, taughtUpTo),
    ...(addCard ? { deck: [...profile.deck, { g: 'ph', status: 'learning', keyword: '' }] } : {}),
  };
}


export const isComplete = (record) => isPlainObject(record) && record.complete !== false;

export function finishedSessions(profile) {
  const days = new Set();
  let count = 0;
  for (const s of Array.isArray(profile?.sessions) ? profile.sessions : []) {
    if (!isComplete(s)) continue;
    if (Number.isFinite(s.day)) {
      if (days.has(s.day)) continue;
      days.add(s.day);
    }
    count++;
  }
  return count;
}

export const isExtraPractice = (profile, day) => (Array.isArray(profile?.sessions) ? profile.sessions : []).some(s => isComplete(s) && s.day === day);
export function latestAccuracy(profile) {
  return profile.sessions?.findLast((s) => typeof s.accuracy === 'number')?.accuracy ?? null;
}


export const GIFT_COLLECTION = Object.freeze({ wardrobe: 'wardrobe', colorin: 'colorin', crayon: 'crayons' });

export function owns(profile, gift) {
  if (gift.type === 'wardrobe' && STARTER_ITEMS.includes(gift.id)) return true;
  const kept = profile?.unlocked?.[GIFT_COLLECTION[gift.type]];
  return Array.isArray(kept) && kept.includes(gift.id);
}

export function withUnlocked(profile, kind, id) {
  const unlocked = { ...(profile.unlocked ?? {}) };
  const kept = Array.isArray(unlocked[kind]) ? unlocked[kind] : [];
  return { ...profile, unlocked: { ...unlocked, [kind]: kept.includes(id) ? [...kept] : [...kept, id] } };
}


function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
const isString = (v) => typeof v === 'string';
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isStrings = (v) => Array.isArray(v) && v.every(isString);
const CARD_STATUSES = Object.freeze(['learning', 'mastered']);
const INSTANT_STATUSES = Object.freeze(['learning', 'known']);
const LOOK_FIELDS = Object.freeze(['skin', 'hair', 'hairColor', 'outfit', 'crown', 'kittenFur', 'kittenAcc', 'hero']);
const UNLOCKED_FIELDS = Object.freeze(['wardrobe', 'colorin', 'crayons', 'tricks', 'charms', 'sparkles']);
const MAX_TIER = 4;
export const CUSTOM_WORD = /^[a-z]+(?:'[a-z]+)?$/;
export const CUSTOM_WORD_MAX = 24;
const GIFT_TYPES = Object.freeze(['wardrobe', 'colorin', 'crayon']);

const fieldsOk = (value, fields) => isPlainObject(value)
  && Object.entries(fields).every(([key, ok]) => !Object.hasOwn(value, key) || ok(value[key]));

const isCard = (card) => isPlainObject(card) && isString(card.g) && CARD_STATUSES.includes(card.status)
  && (!Object.hasOwn(card, 'keyword') || isString(card.keyword));

export const isGiftRecord = (g) => isPlainObject(g) && GIFT_TYPES.includes(g.type) && isString(g.id) && g.id !== '';

const isRecord = (record) => isPlainObject(record) && isNumber(record.day)
  && fieldsOk(record, { minutes: isNumber, rounds: isNumber, accuracy: isNumber, copilot: (v) => typeof v === 'boolean', complete: (v) => typeof v === 'boolean' });

export const isReread = (r) => isPlainObject(r) && isNumber(r.day) && isString(r.scene) && r.scene !== '' && isNumber(r.wpm) && r.wpm > 0;

export function withReread(profile, { day, scene, wpm }) {
  const reread = { day, scene, wpm };
  if (!isReread(reread)) return profile;
  const kept = (Array.isArray(profile.rereads) ? profile.rereads : []).filter((r) => !(r.day === day && r.scene === scene));
  return { ...profile, rereads: [...kept, reread] };
}

const isPointerEntry = (p) => isPlainObject(p) && isNumber(p.day) && isNumber(p.lesson);

const isLetterMarks = (v) => isPlainObject(v) && Object.entries(v).every(([id, mark]) => /^[a-zA-Z]$/.test(id) && mark === 'fine');

const PROFILE_FIELDS = Object.freeze({
  princessName: isString,
  kittenName: isString,
  look: ( v) => fieldsOk(v, Object.fromEntries(LOOK_FIELDS.map((f) => [f, isString]))),
  deck: ( v) => Array.isArray(v) && v.every(isCard),
  instant: ( v) => isPlainObject(v) && Object.values(v).every((s) => INSTANT_STATUSES.includes(s)),
  startLesson: isNumber,
  heartSeededTo: isNumber,
  spellTier: isNumber,
  baseline: ( v) => v === null || isPlainObject(v),
  story: ( v) => fieldsOk(v, { chapter: isString, scene: isNumber, side: isNumber }),
  unlocked: ( v) => fieldsOk(v, Object.fromEntries(UNLOCKED_FIELDS.map((f) => [f, isStrings]))),
  sessions: ( v) => Array.isArray(v) && v.every(isRecord),
  giftIndex: isNumber,
  wardrobeSet: isNumber,
  customInstant: isStrings,
  pendingGifts: ( v) => Array.isArray(v) && v.every(isGiftRecord),
  passes: ( v) => Array.isArray(v) && v.every(isPassRecord),
  breaks: isStrings,
  checks: ( v) => Array.isArray(v) && v.every(isCheckRecord),
  rereads: ( v) => Array.isArray(v) && v.every(isReread),
  letters: isLetterMarks,
  flash: ( v) => Array.isArray(v) && v.every(isFlashRound),
  flashMs: isNumber,
  assessFirst: ( v) => typeof v === 'boolean',
  assessFrom: isNumber,
  placements: ( v) => Array.isArray(v) && v.every(isPlacement),
  pointerLog: ( v) => Array.isArray(v) && v.every(isPointerEntry),
});

export const isProfileShape = (value) => fieldsOk(value, PROFILE_FIELDS);

function overFresh(fresh, stored, ok) {
  if (!isPlainObject(stored)) return { ...fresh };
  const kept = Object.entries(stored).filter(([key, value]) => (Object.hasOwn(fresh, key) ? ok(key, value) : true));
  return { ...fresh, ...Object.fromEntries(kept) };
}

export function normalizeProfile(stored, startLesson) {
  const fresh = newProfile(startLesson);
  if (!isPlainObject(stored)) return fresh;
  const unlocked = overFresh(fresh.unlocked, stored.unlocked, (_, v) => Array.isArray(v));
  for (const kind of UNLOCKED_FIELDS) unlocked[kind] = unlocked[kind].filter(isString);
  const deck = Array.isArray(stored.deck)
    ? stored.deck.filter((c) => isPlainObject(c) && isString(c.g)).map((c) => ({
      ...c,
      status: CARD_STATUSES.includes(c.status) ? c.status : 'learning',
      keyword: isString(c.keyword) ? c.keyword : '',
    }))
    : [];
  const profile = {
    ...stored,
    princessName: isString(stored.princessName) ? stored.princessName : fresh.princessName,
    kittenName: isString(stored.kittenName) ? stored.kittenName : fresh.kittenName,
    look: (overFresh(fresh.look, stored.look, (_, v) => isString(v))),
    deck: deck.length > 0 ? deck : fresh.deck,
    instant: isPlainObject(stored.instant)
      ? Object.fromEntries(Object.entries(stored.instant).filter(([, s]) => INSTANT_STATUSES.includes(s)))
      : fresh.instant,
    startLesson: isNumber(stored.startLesson) ? stored.startLesson : fresh.startLesson,
    spellTier: (isNumber(stored.spellTier) ? Math.min(MAX_TIER, Math.max(1, Math.round(stored.spellTier))) : fresh.spellTier),
    baseline: stored.baseline === null || isPlainObject(stored.baseline) ? stored.baseline : fresh.baseline,
    story: (overFresh(fresh.story, stored.story, (key, v) => (key === 'chapter' ? isString(v) : isNumber(v)))),
    unlocked: (unlocked),
    sessions: Array.isArray(stored.sessions) ? stored.sessions.filter((s) => isPlainObject(s) && isNumber(s.day)) : fresh.sessions,
    giftIndex: isNumber(stored.giftIndex) && stored.giftIndex >= 0 ? stored.giftIndex : fresh.giftIndex,
  };
  if (stored.wardrobeSet !== WARDROBE_SET) {
    const kept = profile.unlocked.wardrobe;
    profile.unlocked = { ...profile.unlocked, wardrobe: [...kept, ...LEGACY_STARTERS.filter((id) => !kept.includes(id))] };
    profile.wardrobeSet = WARDROBE_SET;
  }
  const renamed = new Set(Object.values(WARDROBE_RENAMES)), owned = new Set();
  profile.unlocked = { ...profile.unlocked, wardrobe: profile.unlocked.wardrobe.map(renamedId).filter((id) => !renamed.has(id) || (!owned.has(id) && Boolean(owned.add(id)))) };
  profile.look = { ...profile.look, outfit: renamedId(profile.look.outfit) };
  if (!isNumber(stored.heartSeededTo)) delete profile.heartSeededTo;
  const custom = Array.isArray(stored.customInstant)
    ? [...new Set(stored.customInstant.filter((w) => isString(w) && w.length <= CUSTOM_WORD_MAX && CUSTOM_WORD.test(w)))]
    : [];
  if (custom.length > 0) profile.customInstant = custom;
  else delete profile.customInstant;
  const waiting = Array.isArray(stored.pendingGifts) ? stored.pendingGifts.filter(isGiftRecord).map((g) => ({ type: g.type, id: g.type === 'wardrobe' ? renamedId(g.id) : g.id })) : [];
  if (waiting.length > 0) profile.pendingGifts = waiting;
  else delete profile.pendingGifts;
  const passes = normalizePasses(stored.passes);
  if (passes.length > 0) profile.passes = passes;
  else delete profile.passes;
  const breaks = Array.isArray(stored.breaks) ? stored.breaks.filter(isString) : [];
  if (breaks.length > 0) profile.breaks = breaks;
  else delete profile.breaks;
  const rereads = Array.isArray(stored.rereads) ? stored.rereads.filter(isReread) : [];
  if (rereads.length > 0) profile.rereads = rereads;
  else delete profile.rereads;
  const checks = Array.isArray(stored.checks) ? stored.checks.filter(isCheckRecord) : [];
  if (checks.length > 0) profile.checks = checks;
  else delete profile.checks;
  const letters = isPlainObject(stored.letters) ? Object.fromEntries(Object.entries(stored.letters).filter(([id, mark]) => /^[a-zA-Z]$/.test(id) && mark === 'fine')) : {};
  if (Object.keys(letters).length > 0) profile.letters = (letters);
  else delete profile.letters;
  const flash = Array.isArray(stored.flash) ? stored.flash.filter(isFlashRound).slice(-FLASH_KEPT) : [];
  if (flash.length > 0) profile.flash = flash;
  else delete profile.flash;
  if (!isNumber(stored.flashMs)) delete profile.flashMs;
  if (stored.assessFirst !== true) delete profile.assessFirst;
  if (!(Number.isInteger(stored.assessFrom) && stored.assessFrom >= 1 && stored.assessFrom <= LAST_LESSON)) delete profile.assessFrom;
  const placements = Array.isArray(stored.placements) ? stored.placements.filter(isPlacement) : [];
  if (placements.length > 0) profile.placements = placements;
  else delete profile.placements;
  const pointerLog = Array.isArray(stored.pointerLog) ? stored.pointerLog.filter(isPointerEntry).map((p) => ({ day: p.day, lesson: p.lesson })) : [];
  if (pointerLog.length > 0) profile.pointerLog = pointerLog;
  else delete profile.pointerLog;
  return profile;
}

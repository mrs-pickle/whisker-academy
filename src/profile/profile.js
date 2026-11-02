import { LESSONS } from '../curriculum/lessons.js';
import { isPassRecord, normalizePasses } from '../engine/passes.js';
import { clampTaughtUpTo } from './settings.js';






const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => (letter === 'q' ? 'qu' : letter));
const DIGRAPHS = ['sh', 'ch', 'th', 'wh', 'ck'];
const card = (g, status) => Object.freeze({ g, status, keyword: '' });

export const DEFAULT_DECK = Object.freeze([
  ...LETTERS.map((g) => card(g, g === 'i' || g === 'e' ? 'learning' : 'mastered')),
  ...DIGRAPHS.map((g) => card(g, 'learning')),
]);

const STARTER_WARDROBE = ['o-gown-teal', 'o-gown-pink', 'o-tunic-green', 'k-hat-blue'];
const STARTER_CRAYONS = ['#e63946', '#f4a261', '#f6d55c', '#6bbf59', '#4a90d9', '#9b6bcc', '#f28fb5', '#8d5b3e'];

export function newProfile(startLesson = 41) {
  const start = clampTaughtUpTo(startLesson);
  const instant = {};
  for (const lesson of LESSONS) {
    if (lesson.n > start) continue;
    for (const word of lesson.heartWords) instant[word] = 'known';
  }
  return {
    princessName: '',
    kittenName: '',
    look: { skin: 's3', hair: 'long', hairColor: 'brown', outfit: 'o-gown-teal', crown: 'gold', kittenFur: 'orange', kittenAcc: 'k-hat-blue' },
    deck: DEFAULT_DECK.map((card) => ({ ...card })),
    instant,
    startLesson: start,
    spellTier: 1,
    baseline: null,
    story: { chapter: 'prologue', scene: 0, side: 0 },
    unlocked: { wardrobe: [...STARTER_WARDROBE], colorin: [], crayons: [...STARTER_CRAYONS], tricks: [], charms: [], sparkles: [] },
    sessions: [],
    giftIndex: 0,
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
const LOOK_FIELDS = Object.freeze(['skin', 'hair', 'hairColor', 'outfit', 'crown', 'kittenFur', 'kittenAcc']);
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

const PROFILE_FIELDS = Object.freeze({
  princessName: isString,
  kittenName: isString,
  look: ( v) => fieldsOk(v, Object.fromEntries(LOOK_FIELDS.map((f) => [f, isString]))),
  deck: ( v) => Array.isArray(v) && v.every(isCard),
  instant: ( v) => isPlainObject(v) && Object.values(v).every((s) => INSTANT_STATUSES.includes(s)),
  startLesson: isNumber,
  spellTier: isNumber,
  baseline: ( v) => v === null || isPlainObject(v),
  story: ( v) => fieldsOk(v, { chapter: isString, scene: isNumber, side: isNumber }),
  unlocked: ( v) => fieldsOk(v, Object.fromEntries(UNLOCKED_FIELDS.map((f) => [f, isStrings]))),
  sessions: ( v) => Array.isArray(v) && v.every(isRecord),
  giftIndex: isNumber,
  customInstant: isStrings,
  pendingGifts: ( v) => Array.isArray(v) && v.every(isGiftRecord),
  passes: ( v) => Array.isArray(v) && v.every(isPassRecord),
  breaks: isStrings,
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
  const custom = Array.isArray(stored.customInstant)
    ? [...new Set(stored.customInstant.filter((w) => isString(w) && w.length <= CUSTOM_WORD_MAX && CUSTOM_WORD.test(w)))]
    : [];
  if (custom.length > 0) profile.customInstant = custom;
  else delete profile.customInstant;
  const waiting = Array.isArray(stored.pendingGifts) ? stored.pendingGifts.filter(isGiftRecord).map((g) => ({ type: g.type, id: g.id })) : [];
  if (waiting.length > 0) profile.pendingGifts = waiting;
  else delete profile.pendingGifts;
  const passes = normalizePasses(stored.passes);
  if (passes.length > 0) profile.passes = passes;
  else delete profile.passes;
  const breaks = Array.isArray(stored.breaks) ? stored.breaks.filter(isString) : [];
  if (breaks.length > 0) profile.breaks = breaks;
  else delete profile.breaks;
  return profile;
}

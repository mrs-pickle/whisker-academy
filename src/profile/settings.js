import { LAST_LESSON } from '../curriculum/lessons.js';

export const MIX_IT_UP = 'mix-it-up';


export const DEFAULT_SETTINGS = Object.freeze({
  taughtUpTo: 41,
  sessionMinutes: 15,
  copilot: true,
  sShContrast: true,
  ieEmphasis: true,
  newWordPace: 'steady',
  cardRoutine: 'sound',
  breakStyle: MIX_IT_UP,
  mixOffered: true,
  textSpacing: 'normal',
  tint: 'paper',
  pin: null,
  printWords: true,
  flash: true,
  gamesOffered: true,
  muted: false,
  tipsSeen: Object.freeze({}),
});

const MIN_LESSON = 1;
const SESSION_MINUTES = Object.freeze([10, 15, 20]);
export const NEW_WORD_PACES = Object.freeze(['gentle', 'steady', 'quick']);
const CARD_ROUTINES = Object.freeze(['sound', 'name-key-sound']);
const TEXT_SPACINGS = Object.freeze(['normal', 'wide']);
const NAME = /^[a-z][a-z0-9-]{0,23}$/;
const MAX_PIN_HASH_LENGTH = 200;
const TIP_ID = /^[a-z][a-z0-9.-]{0,63}$/;
const MAX_TIPS_SEEN = 64;

export function clampTaughtUpTo(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_SETTINGS.taughtUpTo;
  return Math.min(LAST_LESSON, Math.max(MIN_LESSON, Math.round(value)));
}

const bool = (value, fallback) => (typeof value === 'boolean' ? value : fallback);
const oneOf = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
const name = (value, fallback) => (typeof value === 'string' && NAME.test(value) ? value : fallback);
const isRecord = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function tipsSeen(value) {
  const seen = {};
  if (!isRecord(value)) return seen;
  for (const [id, mark] of Object.entries(value).slice(0, MAX_TIPS_SEEN)) if (mark === true && TIP_ID.test(id)) seen[id] = true;
  return seen;
}

const SETTING_TYPES = Object.freeze({
  taughtUpTo: 'number', sessionMinutes: 'number', copilot: 'boolean', sShContrast: 'boolean', ieEmphasis: 'boolean',
  newWordPace: 'string', cardRoutine: 'string', breakStyle: 'string', mixOffered: 'boolean', textSpacing: 'string', tint: 'string', pin: 'string',
  printWords: 'boolean', flash: 'boolean', gamesOffered: 'boolean', muted: 'boolean', tipsSeen: 'object',
});

export function isSettingsShape(raw) {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const r = (raw);
  return Object.entries(SETTING_TYPES).every(([key, type]) => !Object.hasOwn(r, key)
    || (key === 'pin' && r[key] === null) || (type === 'object' ? isRecord(r[key])
      : typeof r[key] === type && (type !== 'number' || Number.isFinite(r[key]))));
}

export function normalizeSettings(raw) {
  const r = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw) : {};
  const d = DEFAULT_SETTINGS;
  const games = r.gamesOffered === true;
  return {
    taughtUpTo: clampTaughtUpTo(r.taughtUpTo),
    sessionMinutes: oneOf(r.sessionMinutes, SESSION_MINUTES, d.sessionMinutes),
    copilot: bool(r.copilot, d.copilot),
    sShContrast: games ? bool(r.sShContrast, d.sShContrast) : true,
    ieEmphasis: bool(r.ieEmphasis, d.ieEmphasis),
    newWordPace: oneOf(r.newWordPace, NEW_WORD_PACES, d.newWordPace),
    cardRoutine: oneOf(r.cardRoutine, CARD_ROUTINES, d.cardRoutine),
    breakStyle: r.mixOffered !== true && r.breakStyle === 'ballet' ? d.breakStyle : name(r.breakStyle, d.breakStyle),
    mixOffered: true,
    textSpacing: oneOf(r.textSpacing, TEXT_SPACINGS, d.textSpacing),
    tint: name(r.tint, d.tint),
    pin: typeof r.pin === 'string' && r.pin.length > 0 && r.pin.length <= MAX_PIN_HASH_LENGTH ? r.pin : d.pin,
    printWords: bool(r.printWords, d.printWords),
    flash: games ? bool(r.flash, d.flash) : true,
    gamesOffered: true,
    muted: bool(r.muted, d.muted),
    tipsSeen: tipsSeen(r.tipsSeen),
  };
}

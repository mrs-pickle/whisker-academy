import { sentenceBlockers } from '../curriculum/decodable.js';
import { LAST_LESSON } from '../curriculum/lessons.js';
import { withTaughtLessons } from '../profile/profile.js';
import { clampTaughtUpTo } from '../profile/settings.js';
import { LINE_MISSES, questSelection, scoreLine } from './quest-results.js';


export const ASSESSMENT_DEADLINES = Object.freeze({ mix: 4 * 60000, dictation: 5.5 * 60000 });

export const READ_MISSES = 1;

export const DICTATION_WORDS = 3;


export function ladderLines(content) {
  const bank = new Map((content.words ?? []).map((w) => [w.w, w]));
  return (Array.isArray(content.entrance?.ladder) ? content.entrance.ladder : []).flatMap(( line) => {
    const words = (Array.isArray(line?.words) ? line.words : []).map(( w) => bank.get(w));
    return Number.isInteger(line?.lesson) && line.lesson <= LAST_LESSON && words.length > 0 && words.every(Boolean)
      ? [{ id: String(line.id), kind: ('real'), lesson: line.lesson, words: (words) }] : [];
  });
}

export const ladderOpen = (log) => !(log.length >= 2 && log.at(-1)?.stopped === true && log.at(-2)?.stopped === true);

const misses = (marks) => Math.min(LINE_MISSES, marks.filter((m) => m === false).length);

export function suggestLesson(ladder, log) {
  let best = null;
  for (const line of log) {
    const band = ladder.find((l) => l.words.map((w) => w.w).join(' ') === line.words.join(' '));
    if (!band) continue;
    if (lineRead(line) && (best === null || band.lesson > best)) best = band.lesson;
  }
  return best;
}

export const lineRead = (line) => line.marks.length === line.words.length && !scoreLine(line.marks).stopped && misses(line.marks) <= READ_MISSES;

export function ladderStart(ladder, guess) {
  if (typeof guess !== 'number' || !Number.isFinite(guess)) return 0;
  let start = 0;
  ladder.forEach((l, i) => { if (l.lesson < guess) start = i; });
  return start;
}

export function nextLadderLine(start, count, tried) {
  if (count === 0) return null;
  if (tried.length === 0) return Math.min(Math.max(0, start), count - 1);
  const last = (tried.at(-1));
  if (tried[0].at === 0 || lineRead(tried[0].line)) {
    return ladderOpen(tried.map((t) => t.line)) && last.at + 1 < count ? last.at + 1 : null;
  }
  return !lineRead(last.line) && last.at > 0 ? last.at - 1 : null;
}

export function spread(list, n) {
  if (list.length <= n) return [...list];
  if (n <= 1) return list.slice(-n);
  return Array.from({ length: n }, (_, i) => list[Math.round((i * (list.length - 1)) / (n - 1))]);
}

export function assessmentPlan(content, level, profile) {
  if (level === null) return { lines: [], dictation: [], passage: null };
  const { lines, dictation } = questSelection(content, level);
  const bank = new Map((content.words ?? []).map((w) => [w.w, w]));
  const instant = withTaughtLessons( ({ ...profile, instant: { ...(profile.instant ?? {}) } }), level).instant;
  const known = new Set(Object.keys(instant).filter((w) => instant[w] === 'known'));
  const passage = content.entrance?.passage;
  const fits = passage && sentenceBlockers(passage.text, { lookup: (w) => bank.get(w) ?? null, knownInstant: known, names: new Set(), taughtUpTo: level }).length === 0;
  return {
    lines: (lines.filter((l) => l.kind === 'nonsense')),
    dictation: spread(dictation, DICTATION_WORDS),
    passage: fits ? passage : null,
  };
}

export const atLesson = (results, lesson) => results.filter((r) => Number.isFinite(r.word?.lesson) && (r.word.lesson) <= lesson);


export { isPlacement } from './quest-results.js';

export function confirmNew(profile, settings, lesson) {
  const n = clampTaughtUpTo(lesson);
  const { assessFirst, assessFrom, ...rest } = (profile);
  return { profile: (withTaughtLessons({ ...rest, startLesson: n }, n)), settings: { ...settings, taughtUpTo: n } };
}

export function confirmRetake(profile, settings, lesson) {
  if (lesson === null || clampTaughtUpTo(lesson) === settings.taughtUpTo) return { profile, settings };
  const n = clampTaughtUpTo(lesson);
  return { profile: (withTaughtLessons( (profile), n)), settings: { ...settings, taughtUpTo: n } };
}

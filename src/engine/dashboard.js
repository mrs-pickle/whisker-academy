import { checkColumns } from './check-table.js';
import { unitOf } from '../curriculum/units.js';
import { isComplete } from '../profile/profile.js';

const DAYS_AFTER_SUNDAY = 4;
export const WEEKS_SHOWN = 8;
export const SESSIONS_SHOWN = 20;

export const weekOf = (day) => day - ((((day + DAYS_AFTER_SUNDAY) % 7) + 7) % 7);

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export function minutesByWeek(profile, today) {
  const last = weekOf(today);
  const weeks = Array.from({ length: WEEKS_SHOWN }, (_, i) => ({ week: last - (WEEKS_SHOWN - 1 - i) * 7, full: 0, part: 0 }));
  for (const s of Array.isArray(profile?.sessions) ? profile.sessions : []) {
    if (!isNumber(s?.day) || !isNumber(s.minutes)) continue;
    const w = weeks.find((x) => x.week === weekOf(s.day));
    if (!w) continue;
    if (isComplete(s)) w.full += s.minutes;
    else w.part += s.minutes;
  }
  return weeks.map((w) => ({ ...w, full: Math.round(w.full), part: Math.round(w.part) }));
}

export function accuracyBySession(profile) {
  return (Array.isArray(profile?.sessions) ? profile.sessions : [])
    .filter((s) => isNumber(s?.day))
    .map((s, i) => ({ s, i }))
    .sort((a, b) => a.s.day - b.s.day || a.i - b.i)
    .slice(-SESSIONS_SHOWN)
    .map(({ s }) => ({ day: s.day, accuracy: isNumber(s.accuracy) ? s.accuracy : null }));
}

export function masteredByUnit(states, content) {
  const mastered = new Set();
  for (const [key, s] of states) if (s?.mastered === true) mastered.add(key.slice(0, key.lastIndexOf('#')));
  const units = new Map();
  for (const word of content?.words ?? []) {
    if (word.real === false || !isNumber(word.lesson)) continue;
    const unit = unitOf(word.lesson);
    if (!unit) continue;
    const bar = units.get(unit.from) ?? { id: unit.id, name: unit.name, from: unit.from, to: unit.to, mastered: 0, words: 0 };
    bar.words += 1;
    if (mastered.has(`w:${word.w}`)) bar.mastered += 1;
    units.set(unit.from, bar);
  }
  return [...units.values()].sort((a, b) => a.from - b.from);
}

const share = (score) => (score.total > 0 ? score.correct / score.total : null);

export function newWordsRead(profile, checks) {
  let n = 0;
  return checkColumns(profile, checks).map((c) => ({
    label: c.kind === 'baseline' ? 'Baseline' : `Check ${++n}`,
    day: c.day,
    anchor: share(c.real.anchor),
    fresh: share(c.real.new),
  }));
}

export function rereadSpeeds(profile) {
  return (Array.isArray(profile?.rereads) ? profile.rereads : [])
    .filter((r) => isNumber(r?.day) && isNumber(r.wpm))
    .map((r) => ({ day: r.day, wpm: r.wpm }))
    .sort((a, b) => a.day - b.day);
}

export function pointerOverTime(profile) {
  const log = Array.isArray(profile?.pointerLog) ? profile.pointerLog.filter((p) => isNumber(p?.day) && isNumber(p.lesson)) : [];
  return log.length >= 2 ? log.map((p) => ({ day: p.day, lesson: p.lesson })) : null;
}

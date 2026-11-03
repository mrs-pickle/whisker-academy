import { LETTER_SECURE_BOX, pencilLetters } from './session-builder.js';


export const START_HABIT_DAYS = 28;
export const SHEET_MAX = 4;
export const WEEK_DAYS = 7;
const TWINS = Object.freeze({ b: 'd', d: 'b' });

export const isLetterId = (id) => typeof id === 'string' && /^[a-zA-Z]$/.test(id);

export function setLetterMark(marks, id, fine) {
  const next = { ...(marks ?? {}) };
  if (!isLetterId(id)) return next;
  if (fine) next[id] = 'fine';
  else delete next[id];
  return next;
}

export function letterStatus(id, profile, states) {
  const state = states.get(`lf:${id}#paper`);
  if (profile?.letters?.[id] === 'fine' || (state?.box ?? 0) >= LETTER_SECURE_BOX) return 'secure';
  return state !== undefined ? 'practicing' : 'not started';
}

export function letterFamilies(content, profile, states) {
  const families = new Map();
  for (const l of content.letters ?? []) families.set(l.family, [...(families.get(l.family) ?? []), l.id]);
  return [...families].map(([family, ids]) => {
    const status = ids.map(id => letterStatus(id, profile, states));
    return { family, ids, secure: status.filter(s => s === 'secure').length, practicing: status.filter(s => s === 'practicing').length, notStarted: status.filter(s => s === 'not started').length };
  });
}

export function familyLine(f) {
  const parts = [[f.secure, 'secure'], [f.practicing, 'practicing'], [f.notStarted, 'not started']].filter(([n]) => Number(n) > 0).map(([n, w]) => `${n} ${w}`);
  return `${f.family} (${f.ids.join(' ')}): ${parts.join(', ')}`;
}

export function startHabit(states, day) {
  let right = 0;
  let total = 0;
  for (const [key, state] of states) {
    if (!/^lf:[a-zA-Z]#start$/.test(key)) continue;
    for (const answer of state.hist ?? []) {
      if (!(answer.day > day - START_HABIT_DAYS && answer.day <= day)) continue;
      total++;
      if (answer.correct === true && answer.helped !== true) right++;
    }
  }
  return { right, total };
}

export function reportLetterLines(content, profile, states, day) {
  const families = letterFamilies(content, profile, states);
  if (families.every(f => f.secure === 0 && f.practicing === 0)) return [];
  const secure = families.filter(f => f.secure === f.ids.length).map(f => f.family);
  const working = families.filter(f => f.secure < f.ids.length && f.secure + f.practicing > 0).map(f => `${f.family} (${f.secure} of ${f.ids.length} secure)`);
  const habit = startHabit(states, day);
  return [
    'She is learning print.',
    `Families secure: ${secure.length > 0 ? secure.join(', ') : 'none yet'}.`,
    ...(working.length > 0 ? [`In progress: ${working.join(', ')}.`] : []),
    habit.total > 0 ? `Pencil start found first try: ${habit.right} of ${habit.total} in 4 weeks.` : 'Pencil start: not asked yet in 4 weeks.',
  ];
}

export function sheetLetters(content, profile, states, day) {
  const marks = profile?.letters ?? {};
  const recent = (content.letters ?? []).map(l => l.id).filter(id => {
    const last = states.get(`lf:${id}#paper`)?.last;
    return marks[id] !== 'fine' && typeof last === 'number' && last > day - WEEK_DAYS && last <= day;
  });
  const next = recent.length > 0 ? recent : pencilLetters( (content), profile, states, day);
  const pool = next.length > 0 ? next : (content.letters ?? []).map(l => l.id).filter(id => letterStatus(id, profile, states) !== 'secure');
  const out = [];
  for (const id of pool) {
    if (out.length >= SHEET_MAX) break;
    const twin = TWINS[ (id)];
    if (twin && out.includes(twin) && !(letterStatus(id, profile, states) === 'secure' && letterStatus(twin, profile, states) === 'secure')) continue;
    out.push(id);
  }
  return out;
}

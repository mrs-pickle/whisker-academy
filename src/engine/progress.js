const CATEGORIES = Object.freeze({ w: 'words', g: 'cards', iw: 'instant' });
const TREND_LENGTH = 10;
const DAYS_AFTER_SUNDAY = 4;

const weekOf = (day) => day - (((day + DAYS_AFTER_SUNDAY) % 7) + 7) % 7;

export function summarize(states, profile) {
  const mastered = { words: new Set(), cards: new Set(), instant: new Set() };
  const practiced = new Set();
  for (const [key, s] of states) {
    const id = key.slice(0, key.lastIndexOf('#'));
    const category = (CATEGORIES)[id.slice(0, id.indexOf(':'))];
    if (category === undefined) continue;
    if (s.mastered) mastered[category].add(id);
    if (s.last !== null) practiced.add(id);
  }
  const masteredIds = new Set([...mastered.words, ...mastered.cards, ...mastered.instant]);

  const sessions = profile.sessions.filter(s => Number.isFinite(s.day)).sort((a, b) => a.day - b.day);
  const minutes = new Map();
  for (const s of sessions) {
    const week = weekOf(s.day);
    minutes.set(week, (minutes.get(week) ?? 0) + (Number.isFinite(s.minutes) ? s.minutes : 0));
  }

  const latest = sessions.filter(s => Number.isFinite(s.accuracy)).slice(-TREND_LENGTH);
  return {
    mastered: { words: mastered.words.size, cards: mastered.cards.size, instant: mastered.instant.size },
    learning: [...practiced].filter(id => !masteredIds.has(id)).length,
    minutesByWeek: [...minutes].sort(([a], [b]) => a - b).map(([week, total]) => ({ week, minutes: total })),
    accuracyTrend: latest.map(s => s.accuracy),
    accuracyDays: latest.map(s => s.day),
  };
}

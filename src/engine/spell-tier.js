const MIN_TRACKED = 8;
const MASTERED_SHARE = 0.6;
const TOP_TIER = 4;
const CATCH_UP_WORDS = 10;
const CATCH_UP_TOP = 3;
const CATCH_UP_TRACKED = 4;
const CATCH_UP_SHARE = 0.75;

export function catchUpTier(profile, content) {
  const start = profile.startLesson;
  if (typeof start !== 'number') return 1;
  const counts = new Map();
  for (const w of content.words ?? []) {
    if (w.real === false || typeof w.lesson !== 'number' || w.lesson > start) continue;
    counts.set(w.tier, (counts.get(w.tier) ?? 0) + 1);
  }
  for (let t = CATCH_UP_TOP; t > 1; t--) if ((counts.get(t) ?? 0) >= CATCH_UP_WORDS) return (t);
  return 1;
}

const latestRight = (s) => {
  const last = s.hist.at(-1);
  return last !== undefined && last.correct && !last.helped;
};

export function nextSpellTier(profile, states, content) {
  const tier = profile.spellTier;
  if (tier >= TOP_TIER) return tier;
  const tracked = (content.words ?? [])
    .filter(w => w.tier === tier)
    .map(w => states.get(`w:${w.w}#spell`))
    .filter(s => s !== undefined);
  const mastered = tracked.filter(s => s.mastered).length;
  if (tracked.length >= MIN_TRACKED && mastered / tracked.length >= MASTERED_SHARE) return (tier + 1);
  if (tier < catchUpTier(profile, content) && tracked.length >= CATCH_UP_TRACKED
    && tracked.filter(latestRight).length / tracked.length >= CATCH_UP_SHARE) return (tier + 1);
  return tier;
}

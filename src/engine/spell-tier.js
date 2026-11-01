const MIN_TRACKED = 8;
const MASTERED_SHARE = 0.6;
const TOP_TIER = 4;

export function nextSpellTier(profile, states, content) {
  const tier = profile.spellTier;
  if (tier >= TOP_TIER) return tier;
  const tracked = (content.words ?? [])
    .filter(w => w.tier === tier)
    .map(w => states.get(`w:${w.w}#spell`))
    .filter(s => s !== undefined);
  const mastered = tracked.filter(s => s.mastered).length;
  if (tracked.length >= MIN_TRACKED && mastered / tracked.length >= MASTERED_SHARE) return (tier + 1);
  return tier;
}

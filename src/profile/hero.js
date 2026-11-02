export const HEROES = Object.freeze(['princess', 'prince']);

export const heroOf = (profile) => (profile?.look?.hero === 'prince' ? 'prince' : 'princess');

export const heroVariant = (profile) => (heroOf(profile) === 'prince' ? 'prince' : null);

export function withHero(profile, hero) {
  if (hero === 'prince') {
    if (profile?.look?.hero === 'prince') return profile;
    return { ...profile, look: { ...profile?.look, hero: 'prince' } };
  }
  if (!Object.hasOwn(profile?.look ?? {}, 'hero')) return profile;
  const { hero: _gone, ...look } = profile.look;
  return { ...profile, look };
}

export function heroLine(record, hero, field = 'text') {
  if (hero === 'prince' && typeof record?.prince === 'string' && record.prince !== '') return record.prince;
  return record?.[field];
}

const HIM = /\b(beside|compare|earns|give|giving|have) her\b/gi;
const HIM_END = /\b(with|for) her(?=$|[.,?!)]| \(| yet\b)/g;
const WORDS = ([[/\b[Hh]erself\b/g, 'himself'], [/\b[Ss]he\b/g, 'he'], [/\b[Pp]rincess\b/g, 'prince'], [/\b[Hh]er\b/g, 'his']]);

const sameCapital = (word, to) => (word[0] === word[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to);

export function heroText(text, hero) {
  if (hero !== 'prince' || typeof text !== 'string') return text;
  let said = text.replace(HIM, '$1 him').replace(HIM_END, '$1 him');
  for (const [word, to] of WORDS) said = said.replace(word, (found) => sameCapital(found, to));
  return said;
}

export const heroWords = (ctx) => (text) => heroText(text, heroOf(ctx?.profile));

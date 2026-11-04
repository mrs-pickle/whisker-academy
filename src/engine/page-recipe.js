import { heroOf } from '../profile/hero.js';
import { readingOrder, scenesRead } from './story-place.js';







export const MAX_CAST = 3;
export const MAX_THINGS = 4;
const THINGS_ROW = 16;
const OPTIONS = 3;

const placePart = (id) => `place-${id}`;
const castPart = (id) => `cast-${id}`;
const thingPart = (id) => `thing-${id}`;
const isId = (s) => typeof s === 'string' && s !== '';
const isIdList = (list, least, most) => Array.isArray(list) && list.length >= least && list.length <= most && list.every(isId);
const unique = (list) => [...new Set(list)];
const turned = (list, n) => {
  const from = list.length === 0 ? 0 : ((n % list.length) + list.length) % list.length;
  return [...list.slice(from), ...list.slice(0, from)];
};

export const isRecipe = (r) => r !== null && typeof r === 'object' && isId(r.place) && isIdList(r.cast, 1, MAX_CAST)
  && isIdList(r.things, 0, MAX_THINGS) && (r.scene === null || isId(r.scene));

export const sameDrawing = (a, b) => a.place === b.place && a.cast.join() === b.cast.join() && a.things.join() === b.things.join();

export const sameRecipe = (a, b) => a.scene === b.scene && sameDrawing(a, b);

export const withPlace = (recipe, place) => (recipe.place === place ? recipe : { ...recipe, place });

export function toggleCast(recipe, id) {
  if (recipe.cast.includes(id)) return recipe.cast.length > 1 ? { ...recipe, cast: recipe.cast.filter((c) => c !== id) } : recipe;
  return recipe.cast.length < MAX_CAST ? { ...recipe, cast: [...recipe.cast, id] } : recipe;
}

export function toggleThing(recipe, id) {
  if (recipe.things.includes(id)) return { ...recipe, things: recipe.things.filter((t) => t !== id) };
  return recipe.things.length < MAX_THINGS ? { ...recipe, things: [...recipe.things, id] } : recipe;
}

export const partBody = (svg) => svg.replace(/\r\n/g, '\n').replace(/^[\s\S]*?<svg [^>]*>\s*(<!--[\s\S]*?-->\s*)?/, '').replace(/<\/svg>\s*$/, '');

function partOf(parts, id) {
  const part = parts.get(id);
  if (!part) throw new Error(`The page part ${id} is not in the library`);
  return part;
}

export const inSlot = (part, slot) => ({ x: slot.x - (part.width * slot.scale) / 2, y: slot.y - part.height * slot.scale,
  width: part.width * slot.scale, height: part.height * slot.scale });

export function placed(part, slot) {
  const { x, y } = inSlot(part, slot);
  return `<g transform="translate(${x} ${y}) scale(${slot.scale})">\n${partBody(part.svg)}</g>\n`;
}

export function composePage(recipe, parts) {
  const place = partOf(parts, placePart(recipe.place));
  const slots = (place.slots);
  const body = partBody(place.svg)
    + recipe.cast.map((id, i) => placed(partOf(parts, castPart(id)), slots.cast[i])).join('')
    + recipe.things.map((id, i) => placed(partOf(parts, thingPart(id)), slots.things[i])).join('');
  let region = 0;
  const numbered = body.replace(/<path class="fill"/g, () => `<path class="fill" data-region="r${++region}"`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${place.width}" height="${place.height}" viewBox="0 0 ${place.width} ${place.height}">\n${numbered}</svg>\n`;
}

function reachedScenes(story, profile, states, sceneId) {
  const read = scenesRead(story, profile, states);
  if (sceneId) read.add(sceneId);
  const order = readingOrder(story).map((page) => ( (page.scene)));
  const reached = order.filter((scene) => read.has(scene.id));
  return reached.length > 0 ? reached : order.slice(0, 1);
}

function wordsRead(keys) {
  const words = new Set();
  for (const key of keys) {
    const word = /^w:(.+)#/.exec(key)?.[1];
    if (word) words.add(word);
  }
  return words;
}

export const shownIn = (id) => (id.startsWith('ted-dot-') ? ['ted', 'dot'] : [id.split('-')[0]]);

function latestPoses(cast) {
  const seen = new Set();
  const kept = new Set();
  for (const id of [...cast].reverse()) {
    if (shownIn(id).some((who) => !seen.has(who))) kept.add(id);
    for (const who of shownIn(id)) seen.add(who);
  }
  return kept;
}

export function dayOptions({ content, parts, profile, states, scene, practice, day }) {
  const isCast = ( id) => parts.has(castPart(id));
  const hero = heroOf(profile);
  const cast = (id) => (id === 'princess' ? hero : id);
  const FRIENDS = [hero, 'kitten'];
  const isThing = ( id) => parts.has(thingPart(id));
  const reached = reachedScenes(content.story ?? [], profile, states, scene).filter((s) => parts.has(placePart(s.bg)));
  if (reached.length === 0) return null;
  const today = reached.find((s) => s.id === scene) ?? (reached.at(-1));
  const others = reached.filter((s) => s !== today).reverse();
  const everyone = [...FRIENDS, ...reached.flatMap((s) => s.cast.map(cast)), ...today.cast.map(cast)].filter(isCast);
  const latest = latestPoses(everyone);
  const met = unique(everyone).filter((id) => latest.has(id));
  if (met.length === 0) return null;
  const inRow = (id) => (met.includes(id) ? [id] : met.filter((m) => shownIn(m).some((who) => shownIn(id).includes(who))));
  const hers = unique(practice).filter(isThing);
  const read = wordsRead(states.keys());
  const fromWords = (content.words ?? []).map((w) => w.w).filter((w) => read.has(w) && isThing(w));
  const tricksOf = (s) => [...s.sentences.flatMap((line) => line.trick ?? []), ...(s.things ?? [])].filter(isThing);
  const recipeOf = (s, place = s.bg, who = unique(s.cast.map(cast).filter(isCast).flatMap(inRow))) => ({ place, scene: s.id,
    cast: (who.length > 0 ? who : met).slice(0, MAX_CAST),
    things: unique([...hers, ...tricksOf(s), ...fromWords]).slice(0, MAX_THINGS) });
  const options = [];
  const offer = (r) => { if (options.length < OPTIONS && !options.some((o) => sameDrawing(o, r))) options.push(r); };

  offer(recipeOf(today));
  const earlier = others.find((s) => s.bg !== today.bg) ?? others[0];
  if (earlier) offer(recipeOf(earlier));
  const places = unique(reached.map((s) => s.bg));
  const unshown = places.filter((p) => !options.some((o) => o.place === p));
  const shown = places.filter((p) => !unshown.includes(p));
  const casts = turned(met, day).flatMap((_, k) => {
    const cast = [met[0], ...turned(met.slice(1), day + k)].slice(0, MAX_CAST);
    return [cast, [...cast].reverse()];
  });
  for (const place of [...turned(unshown, day), ...turned(shown, day)]) {
    const from = (reached.findLast((s) => s.bg === place));
    for (const who of casts) offer(recipeOf(from, place, who));
  }

  const things = [...hers, ...options.flatMap((o) => o.things), ...reached.flatMap(tricksOf), ...fromWords];
  return { options, choices: { places, cast: met, things: unique(things).slice(0, THINGS_ROW) } };
}

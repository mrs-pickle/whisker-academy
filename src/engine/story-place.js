import { isDecodable, sentenceBlockers } from '../curriculum/decodable.js';
import { finishedSessions } from '../profile/profile.js';






export function chapterOpen(ch, settings) {
  return ch.lessons[0] <= settings.taughtUpTo;
}

export function readingContext(content, profile, settings) {
  const instant = profile.instant ?? {};
  const taughtUpTo = settings.taughtUpTo;
  return {
    lookup: (w) => content.byWord?.get(w) ?? null,
    knownInstant: new Set(Object.keys(instant).filter(w => instant[w] === 'known')),
    names: new Set((content.names ?? []).filter(n => isDecodable(n.segs, taughtUpTo)).map(n => String(n.display ?? n.id).toLowerCase())),
    taughtUpTo,
  };
}

export function sceneReadable(scene, reading) {
  return (scene.sentences ?? []).every(s => sentenceBlockers(s.text, reading).length === 0);
}

export function storyPlace(story, profile) {
  return {
    ci: Math.max(0, story.findIndex(ch => ch.id === profile.story?.chapter)),
    si: Number(profile.story?.scene) || 0,
  };
}

export function mainPlace(story, profile) {
  let { ci, si } = storyPlace(story, profile);
  while (ci < story.length && si >= story[ci].scenes.length) { ci++; si = 0; }
  return { ci, si };
}

export const readingOrder = (story) => story.flatMap((ch) => [
  ...ch.scenes.map((scene, index) => ({ chapterId: ch.id, scene, kind: ('main'), index })),
  ...ch.side.map((scene, index) => ({ chapterId: ch.id, scene, kind: ('side'), index })),
]);

export function scenesRead(story, profile, states) {
  const { ci, si } = storyPlace(story, profile);
  const turn = Number(profile.story?.side) || 0;
  const marked = (scene) => (scene.sentences ?? []).length > 0 && (scene.sentences ?? []).every((s) => states?.has(`s:${ (s).id}#read`));
  const read = new Set();
  for (const page of readingOrder(story)) {
    const c = story.findIndex((ch) => ch.id === page.chapterId);
    const passed = page.kind === 'main' ? c < ci || (c === ci && page.index < si) : c <= ci && page.index < turn;
    if (passed || marked(page.scene)) read.add(page.scene.id);
  }
  return read;
}

export function nextStoryScene(content, profile, settings) {
  const story = content.story ?? [];
  const reading = readingContext(content, profile, settings);
  const { ci, si } = mainPlace(story, profile);
  if (ci < story.length && chapterOpen(story[ci], settings) && sceneReadable(story[ci].scenes[si], reading)) {
    return { chapterId: story[ci].id, scene: story[ci].scenes[si], kind: 'main', index: si };
  }
  return nextSideQuest(content, profile, settings, ci);
}

export function visibleScenes(story, profile, settings) {
  const { ci, si } = mainPlace(story, profile);
  const reached = (c) => c < ci || (c === ci && (si > 0 || !settings || chapterOpen(story[c], settings)));
  return readingOrder(story).filter(({ chapterId, scene, kind, index }) => {
    const c = story.findIndex((ch) => ch.id === chapterId);
    if ( (story[c]).book === 2 && !reached(c)) return false;
    if (scene.surprise !== true) return true;
    return c < ci || (c === ci && (kind === 'side' || index <= si));
  });
}

export function pagesWon(story, profile) {
  const { ci } = mainPlace(story, profile);
  return story.slice(0, ci).filter((ch) => ch.book === 2 && typeof ch.page === 'string').map((ch) => ({ chapterId: ch.id, page: `tricks/${ch.page}` }));
}

export function nextSideQuest(content, profile, settings, upTo) {
  const story = content.story ?? [];
  const reading = readingContext(content, profile, settings);
  const turn = Number(profile.story?.side) || 0;
  for (let i = Math.min(upTo ?? storyPlace(story, profile).ci, story.length - 1); i >= 0; i--) {
    const ch = story[i];
    if (!chapterOpen(ch, settings)) continue;
    for (let k = 0; k < ch.side.length; k++) {
      const index = (turn + k) % ch.side.length;
      if (sceneReadable(ch.side[index], reading)) return { chapterId: ch.id, scene: ch.side[index], kind: 'side', index };
    }
  }
  return null;
}

export const REREAD_EVERY = 5;

export const rereadDay = (profile) => (finishedSessions(profile) + 1) % REREAD_EVERY === 0;

export function previousMainScene(content, profile, settings) {
  const story = content.story ?? [];
  let { ci, si } = storyPlace(story, profile);
  si = Math.min(si, story[ci]?.scenes.length ?? 0) - 1;
  while (ci >= 0 && si < 0) { ci--; si = (story[ci]?.scenes.length ?? 0) - 1; }
  if (ci < 0 || !chapterOpen(story[ci], settings)) return null;
  const scene = story[ci].scenes[si];
  if (!sceneReadable(scene, readingContext(content, profile, settings))) return null;
  return { chapterId: story[ci].id, scene, index: si };
}

export function againScene(content, profile, settings) {
  if (rereadDay(profile) || !nextStoryScene(content, profile, settings)) return null;
  return previousMainScene(content, profile, settings);
}

export function storyNeeds(content, profile, settings) {
  const story = content.story ?? [];
  const reading = readingContext(content, profile, settings);
  const library = new Set((content.instant ?? []).map(iw => iw.w));
  const needs = [];
  const add = (scene) => {
    for (const s of scene.sentences ?? []) {
      for (const w of sentenceBlockers(s.text, reading)) if (library.has(w) && !needs.includes(w)) needs.push(w);
    }
  };
  const place = mainPlace(story, profile);
  for (let { ci, si } = place; ci < story.length && chapterOpen(story[ci], settings); ci++, si = 0) story[ci].scenes.slice(si).forEach(add);
  const waitsAtMain = place.ci < story.length && chapterOpen(story[place.ci], settings);
  if (waitsAtMain && nextStoryScene(content, profile, settings)) return needs;
  const chapters = [];
  for (let i = Math.min(place.ci, story.length - 1); i >= 0; i--) {
    if (!chapterOpen(story[i], settings)) continue;
    chapters.unshift(story[i]);
    if (story[i].side.some(sc => sceneReadable(sc, reading))) break;
  }
  for (const ch of chapters) ch.side.forEach(add);
  return needs;
}

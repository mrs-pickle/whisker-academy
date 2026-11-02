import { isRecipe, sameRecipe } from '../engine/page-recipe.js';
import { heroOf } from './hero.js';
import { owns, withUnlocked } from './profile.js';



export const PAGES_KEY = 'pages';
export const PAGE_TYPES = Object.freeze(['image/png', 'image/jpeg', 'image/webp']);
const PICTURE_PREFIX = 'page:';
const FILL_PREFIX = 'pagefill:';
const STORY_FILL_PREFIX = 'colorin:';
export const pageBlobId = (id) => PICTURE_PREFIX + id;
export const pageFillKey = (id) => FILL_PREFIX + id;
export const storyFillKey = (id) => STORY_FILL_PREFIX + id;
export const isFillKey = (key) => key.startsWith(FILL_PREFIX) || key.startsWith(STORY_FILL_PREFIX);

const PRINCE_TWIN = '-prince';

export function pagesForHero(catalog, hero) {
  const pages = (Array.isArray(catalog) ? catalog : []);
  const idOf = (p) => (typeof p?.id === 'string' ? p.id : '');
  if (hero !== 'prince') return pages.filter((p) => !idOf(p).endsWith(PRINCE_TWIN));
  const twinned = new Set(pages.map(idOf).filter((id) => id.endsWith(PRINCE_TWIN)).map((id) => id.slice(0, -PRINCE_TWIN.length)));
  return pages.filter((p) => !twinned.has(idOf(p)));
}

export const princeTwin = (id) => id + PRINCE_TWIN;

export const madePageId = (day) => `made-${day}`;

const STORY_SIZE = Object.freeze({ w: 1280, h: 800 });
const MADE_NAME = 'A page from the story';
const FAMILY_ID = /^fam-(\d+)$/;
const NOT_A_PICTURE = "That file isn't a PNG, JPEG or WebP picture, so it wasn't added.";
const UNREADABLE = "That picture couldn't be opened, so it wasn't added. Try saving it again as a PNG or JPEG.";
const NOT_SAVED = "That picture couldn't be saved in this browser, so it wasn't added.";

const isDay = (v) => v === null || Number.isFinite(v);
const isSize = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;
const isEarned = (p) => Number.isFinite(p.earnedDay);
const byOrder = (a, b) => a.order - b.order;
const nextOrder = (pages) => pages.reduce((n, p) => Math.max(n, p.order + 1), 0);

function isPageMeta(p) {
  return p !== null && typeof p === 'object' && typeof p.id === 'string' && p.id !== ''
    && (p.source === 'family' || p.source === 'story' || (p.source === 'made' && isRecipe(p.recipe)))
    && typeof p.name === 'string' && Number.isFinite(p.order)
    && isDay(p.addedDay) && isDay(p.earnedDay) && isDay(p.printedDay) && isSize(p.w) && isSize(p.h);
}

export async function loadPages(store) {
  const stored = await store.get(PAGES_KEY);
  if (!Array.isArray(stored)) return [];
  const seen = new Set();
  const pages = [];
  for (const p of stored) {
    if (!isPageMeta(p) || seen.has(p.id)) continue;
    seen.add(p.id);
    pages.push(p);
  }
  return pages;
}

export async function savePages(store, pages) {
  await store.set(PAGES_KEY, pages);
}


export async function pagesNow(ctx) {
  return Array.isArray(ctx.pages) ? ctx.pages : loadPages(ctx.store);
}

export async function keepPages(ctx, pages) {
  if (!Array.isArray(ctx.pages)) {
    await savePages(ctx.store, pages);
    return true;
  }
  ctx.pages = pages;
  return (await ctx.save()) !== false;
}

async function nextFamilyNumber(store, pages) {
  const ids = [
    ...pages.map((p) => p.id),
    ...(await store.blobIds()).filter((b) => b.startsWith(PICTURE_PREFIX)).map((b) => b.slice(PICTURE_PREFIX.length)),
    ...(await store.keys()).filter((k) => k.startsWith(FILL_PREFIX)).map((k) => k.slice(FILL_PREFIX.length)),
  ];
  return ids.reduce((n, id) => { const m = FAMILY_ID.exec(id); return m ? Math.max(n, Number(m[1]) + 1) : n; }, 1);
}

export async function addFamilyPages(store, pages, files, day, { prepare }) {
  let number = await nextFamilyNumber(store, pages);
  let order = nextOrder(pages);
  const added = [];
  const rejected = [];
  for (const file of Array.from(files ?? [])) {
    const name = typeof file?.name === 'string' && file.name !== '' ? file.name : 'Picture';
    if (!PAGE_TYPES.includes(file?.type)) {
      rejected.push({ name, reason: NOT_A_PICTURE });
      continue;
    }
    let prepared;
    let reason = UNREADABLE;
    try {
      prepared = await prepare(file);
    } catch (err) {
      prepared = null;
      const friendly = (err)?.friendly;
      if (typeof friendly === 'string' && friendly !== '') reason = friendly;
    }
    if (!(prepared?.blob instanceof Blob) || !isSize(prepared.w) || !isSize(prepared.h)) {
      rejected.push({ name, reason });
      continue;
    }
    const id = `fam-${number++}`;
    try {
      await store.putBlob(pageBlobId(id), prepared.blob);
    } catch {
      rejected.push({ name, reason: NOT_SAVED });
      continue;
    }
    added.push({ id, source: 'family', name, order: order++, addedDay: day, earnedDay: null, printedDay: null, w: prepared.w, h: prepared.h });
  }
  const next = [...pages, ...added];
  if (added.length > 0) await savePages(store, next);
  return { pages: next, rejected };
}

export const waitingQueue = (pages) => pages.filter((p) => p.source === 'family' && !isEarned(p)).sort(byOrder);

export function movePage(pages, id, dir) {
  const queue = waitingQueue(pages);
  const at = queue.findIndex((p) => p.id === id);
  const to = at + dir;
  if (at < 0 || (dir !== -1 && dir !== 1) || to < 0 || to >= queue.length) return pages;
  const [a, b] = [queue[at], queue[to]];
  return pages.map((p) => (p === a ? { ...a, order: b.order } : p === b ? { ...b, order: a.order } : p));
}

export async function removePage(store, pages, id) {
  const left = pages.filter((p) => p.id !== id);
  await savePages(store, left);
  await store.del(pageFillKey(id));
  await store.delBlob(pageBlobId(id));
  return left;
}

export const firstWaiting = (pages) => waitingQueue(pages)[0] ?? null;

export function earnPage(pages, colorinCatalog, profile, day) {
  const none = { pages, profile, earned: null };
  if (!Number.isFinite(day) || pages.some((p) => p.earnedDay === day)) return none;
  const family = firstWaiting(pages);
  if (family) {
    const earned = { ...family, earnedDay: day };
    return { pages: pages.map((p) => (p === family ? earned : p)), profile, earned };
  }
  const listed = new Set(pages.map((p) => p.id));
  const story = pagesForHero(colorinCatalog, heroOf(profile)).find(( c) => typeof c?.id === 'string' && c.id !== ''
    && !listed.has(c.id) && !owns(profile, { type: 'colorin', id: c.id }));
  if (!story) return none;
  const earned = { id: story.id, source: 'story', name: typeof story.title === 'string' && story.title !== '' ? story.title : story.id,
    order: nextOrder(pages), addedDay: day, earnedDay: day, printedDay: null, ...STORY_SIZE };
  return { pages: [...pages, earned], profile: withUnlocked(profile, 'colorin', story.id), earned };
}

const madePage = (pages, recipe, day, words) => ({ id: madePageId(day), source: 'made', name: MADE_NAME, order: nextOrder(pages),
  addedDay: day, earnedDay: day, printedDay: null, ...STORY_SIZE, words, recipe });

export function earnMadePage(pages, recipe, day, words) {
  if (!Number.isFinite(day) || pages.some((p) => p.earnedDay === day)) return { pages, earned: null };
  const earned = madePage(pages, recipe, day, words);
  return { pages: [...pages, earned], earned };
}

export function chooseDayPage(pages, day, choice, words) {
  const madeId = madePageId(day);
  const family = 'family' in choice ? pages.find((p) => p.id === choice.family && p.source === 'family' && (!isEarned(p) || p.earnedDay === day)) : null;
  if ('family' in choice && !family) return pages;
  const rest = pages.map((p) => {
    if (p.source !== 'family' || p.earnedDay !== day || p === family) return p;
    const { words: _gone, ...waiting } = p;
    return { ...waiting, earnedDay: null, printedDay: null };
  });
  if (family) return rest.filter((p) => p.id !== madeId).map((p) => (p === family ? { ...family, earnedDay: day, words } : p));
  const { recipe } = (choice);
  const made = rest.find((p) => p.id === madeId);
  if (!made) return [...rest, madePage(rest, recipe, day, words)];
  const same = sameRecipe( (made.recipe), recipe);
  return rest.map((p) => (p === made ? { ...made, recipe, printedDay: same ? made.printedDay : null } : p));
}

export function markPrinted(pages, ids, day) {
  const printed = new Set(ids);
  return pages.map((p) => (printed.has(p.id) ? { ...p, printedDay: day } : p));
}

export function newlyEarned(pages) {
  return pages.filter((p) => isEarned(p) && !Number.isFinite(p.printedDay))
    .sort((a, b) => (a.earnedDay) - (b.earnedDay) || byOrder(a, b));
}

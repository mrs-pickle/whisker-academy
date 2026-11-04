import { isFillKey, pagesNow } from './pages.js';
import { newProfile } from './profile.js';



export const PROFILE_FATES = Object.freeze({
  princessName: 'keep',
  kittenName: 'keep',
  look: 'part',
  deck: 'keep',
  instant: 'keep',
  customInstant: 'keep',
  startLesson: 'keep',
  heartSeededTo: 'keep',
  spellTier: 'reset',
  baseline: 'reset',
  baselineDetail: 'reset',
  story: 'reset',
  unlocked: 'reset',
  sessions: 'reset',
  giftIndex: 'reset',
  wardrobeSet: 'reset',
  pendingGifts: 'reset',
  passes: 'reset',
  breaks: 'reset',
  checks: 'reset',
  rereads: 'reset',
  letters: 'keep',
  flash: 'reset',
  flashMs: 'reset',
  assessFirst: 'reset',
  assessFrom: 'reset',
  placements: 'reset',
  pointerLog: 'keep',
});

export const LOOK_FATES = Object.freeze({
  skin: 'keep',
  hair: 'keep',
  hairColor: 'keep',
  kittenFur: 'keep',
  hero: 'keep',
  outfit: 'reset',
  crown: 'reset',
  kittenAcc: 'reset',
});

function resetFields(value, fates, fresh) {
  const next = { ...value };
  for (const [field, fate] of Object.entries(fates)) {
    if (fate !== 'reset') continue;
    if (Object.hasOwn(fresh, field)) next[field] = fresh[field];
    else delete next[field];
  }
  return next;
}

export function startedOverProfile(profile) {
  const fresh = newProfile();
  return ({ ...resetFields(profile, PROFILE_FATES, fresh), look: resetFields(profile.look, LOOK_FATES, fresh.look) });
}

export const startedOverPages = (pages) => pages.filter((p) => p.source === 'family')
  .map(({ words: _gone, ...page }) => ({ ...page, earnedDay: null, printedDay: null }));

export const startedOverSettings = (settings) => ({ ...settings, tipsSeen: {} });


export async function startOver(ctx) {
  const pages = startedOverPages(await pagesNow(ctx));
  const fills = (await ctx.store.keys()).filter(isFillKey);
  const { settings, profile, states, today, pages: waiting } = ctx;
  Object.assign(ctx, { settings: startedOverSettings(settings), profile: startedOverProfile(profile), states: new Map(), today: null, pages });
  let saved = false;
  try {
    saved = (await ctx.save(fills.map((key) => [key, undefined]))) !== false;
  } finally {
    if (!saved) Object.assign(ctx, { settings, profile, states, today, pages: waiting });
  }
  if (!saved) return false;
  try {
    const blobs = (await ctx.store.blobIds()).filter(isFillKey);
    for (const id of blobs) await ctx.store.delBlob(id);
  } catch (err) {
    console.error('An old coloring could not be removed', err);
  }
  return true;
}

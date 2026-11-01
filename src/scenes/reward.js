import { shownWord } from '../activities/charm.js';
import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { pageBlobId, pagesNow } from '../profile/pages.js';
import { GIFT_COLLECTION, finishedSessions, isGiftRecord, newProfile, owns, withUnlocked } from '../profile/profile.js';
import { artUrl, bigButton, holdToActivate, layeredArt, pathStones } from '../ui/components.js';
import { createPageMaker } from '../ui/page-maker.js';
import { notePrinted, printLibraryPages } from '../ui/print-pages.js';
import { castArt } from '../ui/story-stage.js';
import { pageParam } from './colorin.js';



const CHOICE_EVERY = 3;
const CHOICE_WINDOW = 3;
const S_SH_IDEA = 'close.idea.2';

const isGift = isGiftRecord;
const same = (a, b) => a.type === b.type && a.id === b.id;
const plain = (g) => ({ type: g.type, id: g.id });
const asList = (list) => (Array.isArray(list) ? list : []);
const giftIndexOf = (profile) => (Number.isInteger(profile?.giftIndex) && profile.giftIndex > 0 ? profile.giftIndex : 0);

export { owns, withUnlocked };

function ahead(profile, list) {
  const out = [];
  for (let i = giftIndexOf(profile); i < list.length; i++) {
    const g = list[i];
    if (isGift(g) && !owns(profile, g)) out.push(plain(g));
  }
  return out;
}

function cycleCrayon(profile, list, offset) {
  const listed = [...new Set(list.filter(g => isGift(g) && g.type === 'crayon').map(g => (g).id))];
  const own = asList(profile?.unlocked?.crayons).filter(c => typeof c === 'string');
  const palette = listed.length > 0 ? listed : own.length > 0 ? (own) : newProfile().unlocked.crayons;
  const turn = Math.max(0, giftIndexOf(profile) - list.length) + offset;
  return { type: 'crayon', id: palette[turn % palette.length] };
}

export function nextGift(profile, rewardsList) {
  const list = asList(rewardsList);
  return ahead(profile, list)[0] ?? cycleCrayon(profile, list, 0);
}

export function pickGiftChoices(profile, rewardsList, rng) {
  const list = asList(rewardsList);
  const queue = ahead(profile, list);
  const first = queue[0] ?? cycleCrayon(profile, list, 0);
  if ((finishedSessions(profile) + 1) % CHOICE_EVERY !== 0) return [first];
  const later = queue.slice(1).filter(g => !same(g, first)).slice(0, CHOICE_WINDOW);
  const second = later.length > 0 ? rng.pick(later) : cycleCrayon(profile, list, queue.length > 0 ? 0 : 1);
  return same(first, second) ? [first] : [first, second];
}

export function pendingGifts(profile) {
  return asList(profile?.pendingGifts).filter(isGift).filter(g => !owns(profile, g)).slice(0, 2).map(plain);
}

export function grantGift(profile, gift, rewardsList) {
  if (!isGift(gift)) return profile;
  const list = asList(rewardsList);
  const start = giftIndexOf(profile);
  const listed = list.some((g, i) => i >= start && isGift(g) && same(g, gift));
  const next = withUnlocked(profile, GIFT_COLLECTION[gift.type], gift.id);
  let index = start;
  while (index < list.length && (!isGift(list[index]) || owns(next, (list[index])))) index++;
  if (!listed && index >= list.length) index = Math.max(index, list.length) + 1;
  const { pendingGifts: _settled, ...rest } = next;
  return { ...rest, giftIndex: index };
}

export function closeIdeas(voice, settings) {
  return Object.keys(voice ?? {}).filter(id => /^close\.idea\.\d+$/.test(id) && (settings?.sShContrast === true || id !== S_SH_IDEA));
}


const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const strings = (list) => (asList(list).filter(x => typeof x === 'string' && x !== ''));

function giftPicture(ctx, gift) {
  const look = ctx.profile?.look;
  if (gift.type === 'crayon') return h('div', { class: 'gift-crayon', style: { '--crayon': gift.id } }, h('img', { src: artUrl('ui/crayon'), alt: '', draggable: 'false' }));
  if (gift.type === 'colorin') return pagePicture(ctx, gift.id);
  const item = asList(ctx.content?.wardrobe).find(( w) => w?.id === gift.id);
  const slot = (item)?.slot ?? (gift.id.startsWith('k-') ? 'kitten-acc' : gift.id.startsWith('crown-') ? 'crown' : 'outfit');
  if (slot === 'kitten-acc') return layeredArt(castArt('kitten', { ...look, kittenAcc: gift.id }), 'gift-kitten');
  if (slot === 'crown') return layeredArt(castArt('princess', { ...look, crown: gift.id.replace(/^crown-/, '') }), 'gift-princess');
  return layeredArt(castArt('princess', { ...look, outfit: gift.id }), 'gift-princess');
}

function pagePicture(ctx, id) {
  const page = asList(ctx.content?.colorin).find(( p) => p?.id === id);
  const svg = typeof ( (page)?.svg) === 'string' ? (page).svg : `colorin/${id}`;
  return h('img', { class: 'gift-page', src: `assets/art/${svg}.svg`, alt: '', draggable: 'false' });
}

const isPage = (p) => p !== null && typeof p === 'object' && typeof ( (p).id) === 'string'
  && (p).id !== '' && ['family', 'story'].includes( (p).source);


function pageActions(ctx, { current, saved }, { go, onExit }) {
  const color = h('button', { type: 'button', class: 'reward-page-button reward-color',
    onClick: () => go('colorin', { page: pageParam(current()) }, saved) },
  h('img', { src: artUrl('ui/crayon-e63946'), alt: '', draggable: 'false' }), h('span', {}, 'Color it'));
  const print = h('button', { type: 'button', class: 'reward-page-button reward-print', 'aria-label': 'Print it: grown-ups, hold for 3 seconds' },
    h('span', { class: 'reward-print-fill', 'aria-hidden': 'true' }), h('span', { class: 'reward-print-label' }, 'Hold to print'));
  const printing = createLock();
  const hold = holdToActivate(print, () => {
    printing.run(async () => {
      await saved();
      const page = current();
      const meta = (await pagesNow(ctx)).find((p) => p.id === page.id) ?? page;
      const job = await printLibraryPages(ctx, [meta]);
      if (job.printed) await notePrinted(ctx, job.ids, ctx.day);
    }).catch((err) => console.error('The page could not be printed', err));
  });
  onExit(hold.cancel);
  return h('div', { class: 'reward-page-actions' }, color, print);
}

const pageCard = (shown, actions) => h('div', { class: 'reward-card page new-page' },
  h('p', { class: 'reward-page-title' }, 'New coloring page!'), shown, actions);

function pageShown(ctx, page, { onExit, live }) {
  let picture;
  if (page.source === 'story') picture = pagePicture(ctx, page.id);
  else {
    picture = h('img', { class: 'gift-page', alt: '', draggable: 'false' });
    Promise.resolve(ctx.store.getBlob(pageBlobId(page.id))).then(( blob) => {
      if (!live() || !(blob instanceof Blob)) return;
      const url = URL.createObjectURL(blob);
      onExit(() => URL.revokeObjectURL(url));
      (picture).src = url;
    }).catch(( err) => console.error(`The picture of ${page.id} could not be read`, err));
  }
  return picture;
}

async function giveGift(ctx, table, gifts, say, live) {
  const rewards = ctx.content?.rewards ?? [];
  const grant = async (gift) => {
    ctx.profile = grantGift(ctx.profile, gift, rewards);
    await ctx.save().catch(( err) => console.error('The gift could not be saved', err));
  };
  if (gifts.length === 0) return;
  if (gifts.length === 1) {
    await grant(gifts[0]);
    table.append(h('div', { class: 'reward-card gift' }, giftPicture(ctx, gifts[0])));
    await say(['v.reward.gift'], 2200);
    return;
  }
  const lock = createLock();
  const arrival = createArrivalGuard();
  let chosen = () => {};
  const picked = new Promise((resolve) => { chosen = () => resolve(undefined); });
  const cards = gifts.map((gift, i) => h('button', { type: 'button', class: 'reward-card gift choice', 'aria-label': `Gift ${i + 1}`,
    onClick: ( event) => arrival.allows(event) && lock.run(async () => {
      cards.forEach((c, k) => { c.disabled = true; c.classList.add(k === i ? 'chosen' : 'dim'); });
      await grant(gift);
      chosen();
    }) }, giftPicture(ctx, gift)));
  table.append(...cards);
  say(['v.reward.gift', 'v.reward.choose']);
  await picked;
  if (!live()) return;
  ctx.audio.stop();
  await wait(900);
  cards.forEach(c => { if (c.classList.contains('dim')) c.remove(); });
}

export function mount(el, ctx, params = {}) {
  const extra = params.extra === true;
  const late = params.late === true;
  const offered = asList(params.gifts).filter(isGift).slice(0, 2).map(plain);
  const gifts = extra ? [] : offered.length > 0 ? offered : pickGiftChoices(ctx.profile, ctx.content?.rewards ?? [], ctx.rng);
  const offer = !extra && (params.page)?.source === 'made' && params.maker ? params.maker : null;
  const page = offer || (!extra && isPage(params.page)) ? (params.page) : null;
  const tricks = strings(params.tricks);
  const charms = strings(params.charms);
  const sparkles = strings(params.sparkles);
  const stones = Number.isInteger(params.stones) && (params.stones) > 0 ? (params.stones) : 0;

  const kitten = layeredArt(castArt('kitten', ctx.profile?.look, 'cheer'), 'reward-kitten');
  const table = h('div', { class: 'reward-table' });
  const root = h('div', { class: 'reward' },
    h('img', { class: 'scene-bg', src: artUrl('bg/hub'), alt: '' }),
    stones > 0 ? pathStones({ total: stones, done: stones }) : null,
    table, kitten);
  el.append(root);
  const live = () => root.isConnected && !ctx.router.gone?.();
  const exits = [];
  const leaving = createLock();
  const go = (name, p, before) => {
    leaving.run(async () => {
      await before?.();
      await ctx.router.go(name, p);
    }).catch((err) => console.error(`The reward could not open "${name}"`, err));
  };
  let replay = null;
  const say = async (ids, minMs = 0) => {
    if (!live()) return;
    ctx.setReplay(ids);
    replay = ids;
    await Promise.all([ctx.audio.playSeq(ids), wait(minMs)]);
  };

  const host = { go, onExit: (fn) => { exits.push(fn); }, live };
  let maker = null;
  const dayCard = (day) => {
    const nothingToSave = () => Promise.resolve();
    if (!offer) return pageCard(pageShown(ctx, day, host), pageActions(ctx, { current: () => day, saved: nothingToSave }, host));
    const actions = pageActions(ctx, { current: () => maker?.current() ?? day, saved: () => maker?.saved() ?? nothingToSave() }, host);
    const sayOnTop = (ids) => {
      const before = replay;
      const said = say(ids);
      replay = before;
      return said;
    };
    maker = createPageMaker(ctx, day, offer, { root, table, actions, say: sayOnTop, said: () => replay, ...host });
    return pageCard(maker.tiles, actions);
  };
  const goesOn = async () => {
    await maker?.closed();
    return live();
  };

  const play = async () => {
    if (stones > 0) await say(['v.session.done'], 1500);
    if (!live()) return;
    await giveGift(ctx, table, gifts, say, live);
    if (!live()) return;
    if (late) {
      showHome();
      return;
    }
    if (page) {
      table.append(dayCard(page));
      await say(offer ? ['v.reward.colorin', 'v.colorin.pick'] : ['v.reward.colorin'], 2000);
    }
    if (!(await goesOn())) return;
    if ((tricks.length > 0 || sparkles.length > 0) && live()) {
      const words = (n) => h('div', { class: 'reward-sparkles', lang: 'en' }, sparkles.slice(0, n).map(w => h('span', {}, w)));
      if (tricks.length > 0) {
        table.append(h('div', { class: ['reward-card tricks', sparkles.length > 0 && 'with-sparkles'] },
          h('img', { class: 'reward-bag', src: artUrl('ui/bag'), alt: '', draggable: 'false' }),
          h('div', { class: 'reward-tricks' }, tricks.slice(0, sparkles.length > 0 ? 2 : 6).map(t => h('img', { src: artUrl(`tricks/${t}`), alt: '', draggable: 'false' }))),
          sparkles.length > 0 ? words(2) : null));
        await say(['v.reward.trick'], 2000);
      } else {
        table.append(h('div', { class: 'reward-card sparkles' },
          h('img', { class: 'reward-sparkle', src: artUrl('ui/sparkle'), alt: '', draggable: 'false' }), words(3)));
        await wait(2000);
      }
    }
    if (!(await goesOn())) return;
    if (charms.length > 0) {
      table.append(h('div', { class: 'reward-card charms' },
        h('img', { class: 'reward-bracelet', src: artUrl('ui/bracelet'), alt: '', draggable: 'false' }),
        h('div', { class: 'reward-charms', lang: 'en' }, charms.slice(0, 3).map(w => h('span', {}, shownWord(w))))));
      await say(['v.reward.charm'], 2000);
    }
    await wait(600);
    if (!(await goesOn())) return;
    kitten.replaceWith(layeredArt(castArt('kitten', ctx.profile?.look, 'sit'), 'reward-kitten sleepy'));
    const ideas = closeIdeas(ctx.content?.voice, ctx.settings);
    const idea = ideas.length > 0 ? ctx.rng.pick(ideas) : null;
    await say(['v.close.sleepy', ...(idea ? [`v.${idea}`] : [])], 2500);
    if (!(await goesOn())) return;
    showHome();
  };
  const showHome = () => {
    root.append(h('div', { class: 'reward-home' }, bigButton({ label: 'Back to the castle', icon: 'ui/door-button',
      onClick: () => go('hub', { from: 'reward' }) })));
    say(['v.reward.home']).catch((err) => console.error('The reward could not say the way home', err));
  };
  play().catch((err) => console.error('The reward stopped', err));
  return () => {
    for (const exit of exits) exit();
  };
}

import { CORRESPONDENCES } from '../curriculum/correspondences.js';
import { canDictate } from '../curriculum/dictation.js';
import { isDecodable } from '../curriculum/decodable.js';
import { hasShortIE } from '../curriculum/ie-nasal.js';
import { isRControlled, shapeTier } from '../curriculum/tiers.js';
import { finishedSessions, isExtraPractice } from '../profile/profile.js';
import { isDue, isOverdue } from './itemstate.js';
import { waitingPasses } from './passes.js';
import { REHEARSAL_NEXT_START, REHEARSAL_OFFSETS } from './rehearsal.js';
import { againScene, chapterOpen, nextStoryScene, readingContext, sceneReadable } from './story-place.js';













const ROUND_SIZES = Object.freeze({
  10: Object.freeze({ warmup: 4, cards: 6, spell: 4, chain: 1, charm: 1, story: 1 }),
  15: Object.freeze({ warmup: 6, cards: 12, spell: 6, chain: 1, charm: 1, story: 2 }),
  20: Object.freeze({ warmup: 6, cards: 16, spell: 6, chain: 2, charm: 2, story: 2 }),
});
const DEFAULT_MINUTES = 15;

const PENCIL_TRIM = Object.freeze({ 15: Object.freeze({ warmup: 4, cards: 8 }), 20: Object.freeze({ cards: 12 }) });
const PENCIL_LETTERS = 2;
const PENCIL_DICTATED = 2;
export const LETTER_SECURE_BOX = 3;
const LETTER_TWINS = Object.freeze({ b: 'd', d: 'b' });
const DICTATED_TIER_MAX = 2;

const OVERDUE_SHARE = 0.3;
const PAIRS_PER_KIND = 2;
const SSH_MIN_LESSON = 45;
const IE_WEIGHT = 2;
const RECENT_WEIGHT = 2;
const RECENT_LESSONS = 7;
const TRICK_WEIGHT = 3;
const WORD_CARD_PART = 3;
const PASS_PART = 3;
const BACKFILL_WORDS = 2;
export const PACES = Object.freeze({
  gentle: Object.freeze({ quotaShift: -1, backfill: 1, wordPart: WORD_CARD_PART }),
  steady: Object.freeze({ quotaShift: 0, backfill: BACKFILL_WORDS, wordPart: WORD_CARD_PART }),
  quick: Object.freeze({ quotaShift: 1, backfill: 4, wordPart: 2 }),
});
const BIG_LESSON_WORDS = 25;
const CATCH_UP = Object.freeze({
  gentle: Object.freeze({ words: 12, max: 3, spell: 1 }),
  steady: Object.freeze({ words: 6, max: 7, spell: 3 }),
  quick: Object.freeze({ words: 4, max: 8, spell: 5 }),
});
const HOLD_BACK = 0.8;

export function paceOf(settings, content, unmet = 0, lastAccuracy = null) {
  const name = (Object.hasOwn(PACES, settings.newWordPace ?? '') ? settings.newWordPace : 'steady');
  const pace = PACES[name];
  const rule = CATCH_UP[name];
  const heldBack = lastAccuracy !== null && lastAccuracy < HOLD_BACK;
  const catchUp = heldBack ? 0 : Math.min(rule.max, Math.max(0, Math.floor(unmet / rule.words) - 1));
  const spellLow = Math.min(rule.spell, catchUp);
  const big = name === 'quick' ? Math.floor(content.words.filter(w => w.lesson === settings.taughtUpTo && w.real !== false).length / BIG_LESSON_WORDS) : 0;
  return {
    ...pace, quotaShift: pace.quotaShift + big + spellLow, backfill: pace.backfill + Math.max(big, catchUp),
    morePlaces: catchUp, spellLow,
  };
}
const R_WORD_SESSIONS = 10;
export const R_WORD_TIER = 4;
const NONSENSE_CARDS = Object.freeze({ 10: 1, 15: 1, 20: 2 });
const MIN_SOUND_CARDS = 2;
const CURRENT_TIER_SHARE = 0.5;
const LEARNING_CARD_WEIGHT = 3;
const CARD_MODES = Object.freeze(['see', 'hear']);

export const CONFUSION_PAIRS = Object.freeze([['from', 'for'], ['the', 'they'], ['his', 'this'], ['went', 'what']]);
const PARTNER = new Map(CONFUSION_PAIRS.flatMap(([a, b]) => [[a, b], [b, a]]));

export const needsSAndSh = (segs) => segs.some(([g]) => g === 'sh') && segs.some(([g]) => g === 's' || g === 'ss');

export function eligibleWords(content, settings, profile, mode) {
  const n = settings.taughtUpTo;
  const spellable = (w) => w.tier <= profile.spellTier && (settings.sShContrast || !needsSAndSh(w.segs)) && rSpellAllowed(profile, w.segs);
  return content.words.filter(w => w.lesson <= n && isDecodable(w.segs, n, w) && (mode !== 'spell' || spellable(w)));
}

export function rWordsOpen(profile) {
  return profile.spellTier >= R_WORD_TIER || finishedSessions(profile) >= R_WORD_SESSIONS;
}

export const rWordAllowed = (profile, tier) => tier < R_WORD_TIER || rWordsOpen(profile);

export const rSpellAllowed = (profile, segs) => !isRControlled(segs) || rWordsOpen(profile);

const warmupTier = (item) => (Array.isArray(item.sounds) && item.sounds.includes('r') ? R_WORD_TIER : 1);

export function swapsSForSh(a, b) {
  if (a.length !== b.length) return false;
  const changed = a.flatMap((seg, i) => (seg[1] === b[i][1] ? [] : [i]));
  if (changed.length !== 1) return false;
  const sounds = new Set([a[changed[0]][1], b[changed[0]][1]]);
  return sounds.has('s') && sounds.has('sh');
}

export function eligibleChains(content, settings, profile, spellWords = eligibleWords(content, settings, profile, 'spell')) {
  const spellable = new Map(spellWords.map(w => [w.w, w]));
  const sShStep = (steps) => steps.some((w, i) => i > 0 && swapsSForSh(spellable.get(steps[i - 1]).segs, spellable.get(w).segs));
  return (content.chains ?? []).filter(ch => ch.lesson <= settings.taughtUpTo && ch.steps.every(w => spellable.has(w))
    && (settings.sShContrast || !sShStep(ch.steps)));
}

export function ieWeight(segs, settings) {
  return settings.ieEmphasis && hasShortIE(segs) ? IE_WEIGHT : 1;
}

const since = (s) => s.was ?? (s.due);

export function respreadOverdue(states, day, maxPerDay, rng) {
  const perDay = Math.max(1, Math.floor(maxPerDay));
  const pile = [...states].filter(([, s]) => isOverdue(s, day)).map(([key, s]) => ({ key, s, tie: rng.next() }))
    .sort((a, b) => since(a.s) - since(b.s) || a.s.box - b.s.box || a.tie - b.tie);
  const out = new Map(states);
  pile.slice(perDay).forEach(({ key, s }, i) => out.set(key, { ...s, was: since(s), due: day + 1 + Math.floor(i / perDay) }));
  return out;
}

function isFirstSessionBack(states, day) {
  let latest = -Infinity;
  for (const s of states.values()) if (typeof s.last === 'number' && s.last > latest) latest = s.last;
  return Number.isFinite(latest) && day - latest >= 2;
}

export function buildSession({ content, states, settings, profile, day, rng, lastAccuracy }) {
  const sizes = ROUND_SIZES[settings.sessionMinutes] ?? ROUND_SIZES[DEFAULT_MINUTES];
  const slots = Object.values(sizes).reduce((sum, n) => sum + n, 0);
  const extra = isExtraPractice(profile, day);
  const pools = gatherPools(content, settings, profile, { again: sizes.story > 1 && !extra });
  const waiting = extra ? [] : waitingPasses(profile, day);
  const waitingKeys = new Set(waiting.map(w => `${w.id}#${w.mode}`));
  const passedIn = (pool, size) => {
    const ids = new Set();
    return waiting.flatMap(w => pool.filter(c => c.id === w.id && c.mode === w.mode))
      .filter(c => !ids.has(c.id) && ids.add(c.id)).slice(0, passRoom(size));
  };

  const back = isFirstSessionBack(states, day);
  if (back) {
    const inPlay = new Set(Object.values(pools).flat().map(c => c.key));
    const pending = new Map([...states].filter(([key]) => inPlay.has(key)));
    for (const [key, s] of respreadOverdue(pending, day, slots * OVERDUE_SHARE, rng)) {
      if (s !== pending.get(key)) states.set(key, s);
    }
  }

  const attach = (list) => list.map(c => ({ ...c, state: states.get(c.key) }));
  const attached = Object.fromEntries(Object.entries(pools).map(([name, list]) => [name, attach(list)]));
  const storyPassed = waiting.some(w => /^[sq]:/.test(w.id)) ? storyCandidates(content, settings, profile, states) : [];
  const passing = {
    warmup: passedIn(attached.warmup, sizes.warmup),
    cards: passedIn([...attached.read, ...attached.nonsense, ...attached.iePairs, ...attached.sshPairs, ...attached.cards, ...storyPassed], sizes.cards),
    spell: passedIn(attached.spell, sizes.spell),
    chain: passedIn(attached.chains, sizes.chain),
    charm: passedIn(attached.instant, sizes.charm),
  };
  const placedKeys = new Set(Object.values(passing).flat().map(c => c.key));
  const p = Object.fromEntries(Object.entries(attached).map(([name, list]) =>
    [name, name === 'story' ? list : list.filter(c => !waitingKeys.has(c.key) || placedKeys.has(c.key))]));
  const due = (c) => c.state !== undefined && isDue(c.state, day);
  const late = (c) => back && c.state !== undefined && isOverdue(c.state, day);
  const knows = (c) => c.state !== undefined && !due(c) && (c.state.mastered || c.state.box >= 2);
  const dueFirst = (list) => weightedOrder(list.filter(due), rng)
    .sort((a, b) => since( (a.state)) - since( (b.state))
      || (a.state).box - (b.state).box);
  const fillers = (list) => {
    const rest = list.filter(c => !due(c) && c.state?.was === undefined);
    return back ? [...weightedOrder(rest.filter(knows), rng), ...weightedOrder(rest.filter(c => !knows(c)), rng)] : weightedOrder(rest, rng);
  };
  const byPriority = (list) => [...dueFirst(list), ...fillers(list)];
  const dueRoom = (list, size) => {
    const ready = list.filter(due);
    const capped = ready.filter(late).length;
    return ready.length - capped + Math.min(capped, reviewCap(size));
  };
  const start = profile.startLesson;
  const isNewWord = (c) => c.state === undefined && (c.lesson) > start;
  const headWith = (round, list, isNew = isNewWord) => {
    for (const c of list) round.add(c, isNew(c));
    return round.filled();
  };

  const mastered = p.spell.filter(c => c.state?.mastered);
  const easy = mastered.filter(c => !due(c));
  const first = weightedOrder(easy.length > 0 ? easy : mastered, rng)
    .sort((a, b) => (b.state).box - (a.state).box)[0];

  const pace = paceOf(settings, content, back ? 0 : p.read.filter(isNewWord).length, lastAccuracy);
  const pairMax = Math.floor(sizes.cards / 2);
  const pencilCards = pencilPlanned(profile, settings, day) ? PENCIL_TRIM[ (settings.sessionMinutes)].cards : undefined;
  const wordBase = Math.ceil(sizes.cards / pace.wordPart);
  const wordCap = (pencilCards ?? sizes.cards) - MIN_SOUND_CARDS;
  const wordMax = wordBase + Math.max(0, Math.min(pace.morePlaces, wordCap - wordBase));
  const spellSet = new Set(p.spell.map(c => c.id));
  const spellPassed = passing.spell.filter(c => c !== first);
  const charmPassed = passing.charm;
  const spellFree = Math.max(0, sizes.spell - (first ? 1 : 0) - spellPassed.length);
  const spellDue = new Set(p.spell.filter(due).map(c => c.id));
  const metLearning = p.instant.filter(c => c.status === 'learning' && c.state !== undefined).length;
  const newReading = new Map(p.read.filter(isNewWord).map(c => [c.id, c]));
  const unmet = back ? [] : p.read.filter(c => isNewWord(c) && (c.lesson) < settings.taughtUpTo);
  const held = heldPlaces(wordMax, unmet.length, pace.backfill);
  const spellRoom = Math.max(Math.min(1, spellFree), spellFree - dueRoom(p.spell.filter(c => c !== first), sizes.spell));
  const fresh = chooseNew([
    ...p.spell.filter(isNewWord).map(c => {
      const read = newReading.get(c.id);
      const own = { c, round: 'spell', ...(read ? { alt: { c: read, round: 'cards' } } : {}) };
      return (c.tier) < profile.spellTier ? { c, round: 'spellLow', alt: own } : own;
    }),
    ...p.read.filter(c => isNewWord(c) && !spellSet.has(c.id)).map(c => ({ c, round: 'cards' })),
    ...p.instant.filter(c => c.status === 'learning' && c.state === undefined).map(c => ({ c, round: 'charm' })),
  ], newQuota(lastAccuracy, pace.quotaShift), {
    spell: spellRoom,
    spellLow: Math.max(0, Math.min(pace.spellLow, spellFree - spellRoom)),
    cards: Math.max(0, Math.min(Math.max(wordMax - held - dueRoom(p.read.filter(c => !spellDue.has(c.id)), sizes.cards),
      Math.min(pace.morePlaces, wordMax - 1 - held)),
      pencilCards !== undefined && pace.morePlaces > 0 ? Math.floor((wordCap - held) / REHEARSAL_OFFSETS.length) : Infinity)),
    charm: Math.max(0, sizes.charm - charmPassed.length),
  }, metLearning < sizes.charm ? 'charm' : null, rng);
  const freshFor = (round) => fresh.filter(f => f.round === round || (round === 'spell' && f.round === 'spellLow')).map(f => f.c);
  const newRound = (size) => createRound(size, due, late);

  const warmup = newRound(sizes.warmup);
  const warmupHead = headWith(warmup, passing.warmup);
  for (const c of byPriority(p.warmup)) warmup.add(c);

  const spell = newRound(sizes.spell);
  if (first) spell.add(first);
  const spellHead = headWith(spell, spellPassed);
  for (const c of freshFor('spell')) spell.add(c, true);
  const spellable = p.spell.filter(c => c.state !== undefined || c.lesson <= start);
  for (const c of dueFirst(spellable)) spell.add(c);
  const spellFillers = fillers(spellable);
  const tierPlaces = Math.ceil((sizes.spell - spell.filled()) * CURRENT_TIER_SHARE);
  let tierFilled = 0;
  for (const c of spellFillers) {
    if (tierFilled >= tierPlaces) break;
    if (c.tier === profile.spellTier && spell.add(c)) tierFilled++;
  }
  for (const c of spellFillers) spell.add(c);
  const spelled = new Set(spell.finish(spellHead).map(i => i.id));

  const cards = newRound(sizes.cards);
  const cardsHead = headWith(cards, passing.cards, c => !c.id.startsWith('n:') && isNewWord(c));
  let words = 0;
  const addWord = (c, isNew = false, model = false) => {
    if (words >= wordMax || !cards.add(c, isNew, model)) return false;
    words++;
    return true;
  };
  for (const c of freshFor('cards')) addWord(c, true);
  let pairs = 0;
  for (const kind of [p.iePairs, p.sshPairs]) {
    let n = 0;
    for (const c of byPriority(kind)) {
      if (n >= PAIRS_PER_KIND || pairs >= pairMax) break;
      if (cards.add(c)) { n++; pairs++; }
    }
  }
  const toRead = p.read.filter(c => !spelled.has(c.id));
  const toMeet = weightedOrder(unmet.filter(c => !spelled.has(c.id)), rng)
    .sort((a, b) => (a.lesson) - (b.lesson) || (a.tier) - (b.tier));
  let meeting = 0;
  for (const c of toMeet) {
    if (meeting >= held) break;
    if (addWord(c, false, true)) meeting++;
  }
  for (const c of dueFirst(toRead)) addWord(c);
  const review = toRead.filter(c => (c.state === undefined ? (c.lesson) <= start : back && knows(c)));
  const reviewOrder = [...fillers(review.filter(c => !spellSet.has(c.id))), ...fillers(review.filter(c => spellSet.has(c.id)))];
  for (const c of back ? [...reviewOrder.filter(knows), ...reviewOrder.filter(c => !knows(c))] : reviewOrder) addWord(c);
  const nonsenseMax = NONSENSE_CARDS[ (settings.sessionMinutes)] ?? NONSENSE_CARDS[DEFAULT_MINUTES];
  let nonsense = 0;
  for (const c of byPriority(p.nonsense)) {
    if (nonsense >= nonsenseMax || sizes.cards - cards.filled() - 1 < MIN_SOUND_CARDS) break;
    if (cards.add(c)) nonsense++;
  }
  for (const c of byPriority(p.cards)) cards.add(c);

  const chain = newRound(sizes.chain);
  const chainHead = headWith(chain, passing.chain);
  for (const c of byPriority(p.chains)) chain.add(c);

  const charm = newRound(sizes.charm);
  const charmHead = headWith(charm, charmPassed, c => c.status === 'learning' && c.state === undefined);
  for (const c of freshFor('charm')) charm.add(c, true);
  const met = p.instant.filter(c => c.state !== undefined || c.status === 'known');
  for (const c of dueFirst(met)) charm.add(c);
  for (const c of fillers(met.filter(c => c.status === 'learning'))) charm.add(c);
  for (const c of fillers(met.filter(c => c.status === 'known'))) charm.add(c);

  const story = newRound(sizes.story);
  for (const c of p.story) story.add(c);

  const parts = [
    { activity: 'warmup', round: warmup, head: warmupHead }, { activity: 'cards', round: cards, head: cardsHead },
    { activity: 'spell', round: spell, head: spellHead }, { activity: 'chain', round: chain, head: chainHead },
    { activity: 'charm', round: charm, head: charmHead }, { activity: 'story', round: story, head: sizes.story },
  ];
  const built = parts.map(part => ({ ...part, items: part.round.finish(part.head) }));
  const carded = new Set(cards.finish(cardsHead).map(i => i.id));
  capSessionReviews(built, (activity) => (activity === 'spell' ? carded : new Set()));
  if (waiting.length > 0) for (const b of built) if (b.activity !== 'story') holdPassesToRoom(b, waitingKeys);
  const rounds = built.filter(b => b.items.length > 0)
    .map(b => ({ activity: b.activity, items: arrange(b.items, b.head, rng) }));
  const pencil = pencilPlanned(profile, settings, day) ? pencilItems(content, settings, profile, states, day, rng) : [];
  if (pencil.length === 0) return { day, rounds };
  const trim = (PENCIL_TRIM[ (settings.sessionMinutes)]);
  const heads = new Map(built.map(b => [b.activity, b.head]));
  const trimmed = rounds.map(r => (r.activity === 'warmup' || r.activity === 'cards')
    ? { ...r, items: trimRound(r.items, trim[r.activity] ?? r.items.length, heads.get(r.activity) ?? 0) } : r);
  const at = trimmed.findIndex(r => r.activity !== 'warmup' && r.activity !== 'cards');
  trimmed.splice(at < 0 ? trimmed.length : at, 0, { activity: 'pencil', items: pencil });
  return { day, rounds: trimmed };
}

export const isPencilDay = (plan) => plan.rounds.some(r => r.activity === 'pencil' && r.items.length > 0);

export const pencilPlanned = (profile, settings, day) => Object.hasOwn(PENCIL_TRIM, settings.sessionMinutes)
  && settings.copilot !== false && !isExtraPractice(profile, day) && finishedSessions(profile) % 2 === 0;

export function pencilLetters(content, profile, states, day) {
  const marks = ( (profile).letters ?? {});
  const letters = (content.letters ?? []).map(l => l.id).filter(id => marks[id] !== 'fine');
  const state = (id) => states.get(`lf:${id}#paper`);
  const secure = (id) => (state(id)?.box ?? 0) >= LETTER_SECURE_BOX;
  const due = letters.filter(id => { const s = state(id); return s !== undefined && isDue(s, day); });
  const fresh = letters.filter(id => state(id) === undefined);
  const picked = [];
  for (const id of [...due, ...fresh]) {
    if (picked.length >= PENCIL_LETTERS) break;
    const twin = LETTER_TWINS[ (id)];
    if (twin && picked.includes(twin) && !(secure(id) && secure(twin))) continue;
    picked.push(id);
  }
  return picked;
}

export function dictatedItems(content, settings, profile, rng) {
  const n = settings.taughtUpTo;
  const item = (id) => ({ id, mode: 'write', isNew: false, isReview: false });
  const digraphs = CORRESPONDENCES.filter(c => c.g.length === 2 && c.g[0] !== c.g[1] && c.before === undefined && c.after === undefined && c.lesson <= n
    && canDictate({ segs: [[c.g, c.p]] }) && rSpellAllowed(profile, [[c.g, c.p]]));
  let newest;
  for (const c of digraphs) if (!newest || c.lesson > newest.lesson) newest = c;
  const words = eligibleWords(content, settings, profile, 'read')
    .filter(w => shapeTier(w.segs, w) <= DICTATED_TIER_MAX && rWordAllowed(profile, w.tier) && rSpellAllowed(profile, w.segs) && canDictate(w) && (settings.sShContrast || !needsSAndSh(w.segs)));
  const current = words.filter(w => w.lesson === n);
  const pool = rng.shuffle([...(current.length > 0 ? current : words)]);
  const out = newest ? [item(`g:${newest.g}`)] : [];
  for (const w of pool) {
    if (out.length >= PENCIL_DICTATED) break;
    out.push(item(`w:${w.w}`));
  }
  return out;
}

function pencilItems(content, settings, profile, states, day, rng) {
  const letters = pencilLetters(content, profile, states, day);
  if (letters.length === 0) return [];
  return [
    ...letters.map(id => {
      const s = states.get(`lf:${id}#paper`);
      return { id: `lf:${id}`, mode: 'paper', isNew: s === undefined, isReview: s !== undefined && isDue(s, day) };
    }),
    ...dictatedItems(content, settings, profile, rng),
  ];
}

export function trimRound(items, size, head) {
  const out = [...items];
  const sound = (i) => i.id.startsWith('g:');
  const cut = (may) => {
    for (let at = out.length - 1; at >= head && out.length > size; at--) {
      const i = out[at];
      if (i.isNew || i.model || !may(i)) continue;
      if (sound(i) && out.filter(sound).length <= MIN_SOUND_CARDS) continue;
      out.splice(at, 1);
    }
  };
  const madeUp = (i) => i.id.startsWith('n:');
  cut(i => !i.isReview && !sound(i) && !madeUp(i));
  cut(i => !i.isReview && !madeUp(i));
  cut(i => !i.isReview);
  cut(() => true);
  return out;
}

function capSessionReviews(built, avoid) {
  const order = [...built].reverse().sort((a, b) => Number(a.round.size === 1) - Number(b.round.size === 1));
  const total = () => built.reduce((n, b) => n + b.items.length, 0);
  const overdue = () => built.reduce((n, b) => n + b.round.overdue(0).length, 0);
  const demoteWorst = (from, replaceOnly) => {
    const options = order.flatMap((b, rank) => b.round.overdue(from(b))
      .filter(({ at }) => !replaceOnly || b.round.canSwap(at, avoid(b.activity)))
      .map(({ at, state }) => ({ b, at, state, rank })));
    if (options.length === 0) return false;
    const { b, at } = worst(options);
    b.round.demote(at, avoid(b.activity));
    return true;
  };
  while (overdue() > Math.floor(total() * OVERDUE_SHARE)) {
    if (!(demoteWorst(b => b.head, true) || demoteWorst(b => b.head, false) || demoteWorst(() => 0, false))) break;
  }
}

function holdPassesToRoom(built, open) {
  const { items } = built;
  let over = items.filter(i => open.has(`${i.id}#${i.mode}`)).length - passRoom(items.length);
  for (let at = items.length - 1; at >= 0 && over > 0; at--) {
    if (!open.has(`${items[at].id}#${items[at].mode}`)) continue;
    items.splice(at, 1);
    if (at < built.head) built.head--;
    over = items.filter(i => open.has(`${i.id}#${i.mode}`)).length - passRoom(items.length);
  }
}

function storyCandidates(content, settings, profile, states = new Map()) {
  const reading = readingContext(content, profile, settings);
  const cand = (id, mode) => ({ id, mode, key: `${id}#${mode}`, weight: 1, state: states.get(`${id}#${mode}`) });
  return (content.story ?? []).filter(ch => chapterOpen(ch, settings)).flatMap(ch => [...ch.scenes, ...ch.side])
    .filter(scene => sceneReadable(scene, reading))
    .flatMap(scene => [
      ...(scene.sentences ?? []).map(s => cand(`s:${s.id}`, 'read')),
      ...(scene.question ? [cand(`q:${scene.id}`, 'pick')] : []),
    ]);
}

export function openToHer(content, settings, profile) {
  let open;
  return ({ id, mode }) => {
    open ??= new Set([...Object.values(gatherPools(content, settings, profile, { again: false })).flat(), ...storyCandidates(content, settings, profile)].map(c => c.key));
    return open.has(`${id}#${mode}`);
  };
}

const passRoom = (length) => Math.ceil(length / PASS_PART);

function newQuota(lastAccuracy, shift = 0) {
  const a = lastAccuracy ?? 0;
  return Math.max(1, (a >= 0.9 ? 3 : a >= 0.8 ? 2 : 1) + shift);
}

const reviewCap = (size) => Math.max(1, Math.floor(size * OVERDUE_SHARE));

export const heldPlaces = (wordMax, unmet, backfill = BACKFILL_WORDS) => Math.min(backfill, wordMax - 1, unmet);

function gatherPools(content, settings, profile, { again }) {
  const { taughtUpTo, sShContrast, ieEmphasis } = settings;
  const cand = (id, mode, extra = {}) => ({ id, mode, key: `${id}#${mode}`, weight: 1, ...extra });
  const wordCand = (w, mode, weight = 1) =>
    cand(`w:${w.w}`, mode, { text: w.w, lesson: w.lesson, tier: w.tier, weight: weight * ieWeight(w.segs, settings) });
  const start = profile.startLesson;
  const recent = (w) => (w.lesson > start - RECENT_LESSONS && w.lesson <= start ? RECENT_WEIGHT : 1);
  const earned = new Set(Array.isArray(profile.unlocked?.tricks) ? profile.unlocked.tricks : []);
  const unearned = (w) => (w.trick && !earned.has(w.trick) ? TRICK_WEIGHT : 1);

  const readWords = eligibleWords(content, settings, profile, 'read').filter(w => rWordAllowed(profile, w.tier));
  const spellWords = eligibleWords(content, settings, profile, 'spell');
  const readable = new Set(readWords.map(w => w.w));
  const pairCand = ([a, b], kind) => cand(`pr:${kind}:${a}/${b}`, 'listen');
  const sshReadable = (w) => readable.has(w) || !content.byWord.has(w);

  return {
    warmup: content.warmup
      .filter(it => it.minLesson <= taughtUpTo && (sShContrast || !(it.choices?.includes('s') && it.choices.includes('sh'))) && rWordAllowed(profile, warmupTier(it)))
      .map(it => cand(`pa:${it.id}`, 'pa')),
    cards: profile.deck.flatMap(card => CARD_MODES.map(mode =>
      cand(`g:${card.g}`, mode, { weight: card.status === 'learning' ? LEARNING_CARD_WEIGHT : 1 }))),
    iePairs: ieEmphasis ? content.pairs.ie.filter(pr => pr.every(w => readable.has(w))).map(pr => pairCand(pr, 'ie')) : [],
    sshPairs: sShContrast && taughtUpTo >= SSH_MIN_LESSON
      ? content.pairs.ssh.filter(pr => pr.every(sshReadable)).map(pr => pairCand(pr, 'ssh')) : [],
    read: readWords.map(w => wordCand(w, 'read', recent(w))),
    nonsense: (content.nonsense ?? [])
      .filter(w => w.lesson <= taughtUpTo && isDecodable(w.segs, taughtUpTo, w) && rWordAllowed(profile, w.tier))
      .map(w => cand(`n:${w.w}`, 'read', { text: w.w, lesson: w.lesson, tier: w.tier })),
    spell: spellWords.map(w => wordCand(w, 'spell', unearned(w))),
    chains: eligibleChains(content, settings, profile, spellWords).map(ch => cand(`ch:${ch.id}`, 'spell')),
    instant: content.instant
      .filter(iw => profile.instant[iw.w] === 'learning' || profile.instant[iw.w] === 'known')
      .map(iw => cand(`iw:${iw.w}`, 'read', { text: iw.w, lesson: iw.ufli ?? taughtUpTo, status: profile.instant[iw.w] })),
    story: [
      ...[nextStoryScene(content, profile, settings)].flatMap(pick => (pick ? [cand(`s:${pick.scene.id}`, 'read')] : [])),
      ...[again ? againScene(content, profile, settings) : null].flatMap(pick => (pick ? [cand(`s:${pick.scene.id}`, 'again')] : [])),
    ],
  };
}


function chooseNew(options, quota, room, reserve, rng) {
  const tierRank = (c) => c.tier ?? 1;
  const ranked = weightedOrder(options.map(o => ({ ...o, weight: o.c.weight })), rng)
    .sort((a, b) => (b.c.lesson) - (a.c.lesson) || tierRank(a.c) - tierRank(b.c));
  const chosen = [];
  const words = new Set();
  const placed = (o) => (o === undefined ? null : room[o.round] > 0 ? o : placed(o.alt));
  const fits = (o) => {
    const text = (o.c.text);
    return placed(o) !== null && !words.has(text) && !words.has(PARTNER.get(text));
  };
  const pick = (o) => {
    const into = (placed(o));
    chosen.push({ c: into.c, round: into.round });
    words.add(o.c.text);
    room[into.round]--;
  };
  let held = ranked.some(o => o.round === reserve) ? 1 : 0;
  for (const o of ranked) {
    const own = held > 0 && o.round === reserve;
    if (chosen.length + (own ? 0 : held) >= quota || !fits(o)) continue;
    pick(o);
    if (own) held = 0;
  }
  if (held > 0) for (const o of ranked) if (chosen.length < quota && fits(o)) pick(o);
  return chosen;
}

function weightedOrder(list, rng) {
  return list.map(item => ({ item, rank: rng.next() ** (1 / item.weight) })).sort((a, b) => b.rank - a.rank).map(x => x.item);
}


function createRound(size, due, late) {
  const items = [];
  const spares = [];
  const lateStates = new Map();
  const cap = reviewCap(size);
  const lateFrom = (from) => items.flatMap((it, at) => {
    const state = lateStates.get(it.id);
    return at >= from && state !== undefined ? [{ at, state }] : [];
  });
  const spareFor = (at, avoid) => spares.findIndex(c => !avoid.has(c.id) && !items.some((it, i) => i !== at && it.id === c.id));
  return {
    size,
    filled: () => items.length,
    add(c, isNew = false, model = false) {
      if (items.some(i => i.id === c.id)) return false;
      const isReview = !isNew && due(c);
      if (items.length >= size) {
        if (!isNew && !isReview) spares.push(c);
        return false;
      }
      const capped = isReview && late(c);
      if (capped && lateStates.size >= cap) return false;
      if (capped) lateStates.set(c.id, (c.state));
      items.push({ id: c.id, mode: c.mode, isNew, isReview, ...(model ? { model: (true) } : {}) });
      return true;
    },
    finish(head = 0) {
      while (lateStates.size > reviewCap(items.length)) {
        const options = lateFrom(head);
        const { at } = worst(options.length > 0 ? options : lateFrom(0));
        lateStates.delete(items[at].id);
        items.splice(at, 1);
      }
      return items;
    },
    overdue: lateFrom,
    canSwap: (at, avoid) => spareFor(at, avoid) >= 0,
    demote(at, avoid) {
      const s = spareFor(at, avoid);
      const filler = s < 0 ? [] : spares.splice(s, 1).map(c => ({ id: c.id, mode: c.mode, isNew: false, isReview: false }));
      lateStates.delete(items[at].id);
      items.splice(at, 1, ...filler);
    },
  };
}

function worst(options) {
  return [...options].sort((x, y) => since(y.state) - since(x.state) || y.state.box - x.state.box
    || (x.rank ?? 0) - (y.rank ?? 0) || y.at - x.at)[0];
}

export function arrange(items, head, rng) {
  const rest = items.slice(head);
  const fresh = rest.filter(i => i.isNew);
  const fillersLast = rest.filter(i => !i.isNew && !i.isReview && !i.model).reverse();
  const length = rest.length;
  let budget = fillersLast.length;
  const placed = new Map();
  const fits = (at, item) => at < length && !placed.has(at) && placed.get(at - 1)?.id !== item.id && placed.get(at + 1)?.id !== item.id;
  let cursor = 0;
  for (const item of fresh) {
    let start = cursor;
    while (start < length && REHEARSAL_OFFSETS.some(offset => start + offset < length && placed.has(start + offset))) start++;
    if (start >= length) start = [...Array(length).keys()].find(at => !placed.has(at)) ?? length;
    placed.set(start, item);
    for (const offset of REHEARSAL_OFFSETS.slice(1)) {
      if (budget > 0 && fits(start + offset, item)) {
        placed.set(start + offset, item);
        budget--;
      }
    }
    cursor = start + REHEARSAL_NEXT_START;
  }
  const gave = new Set(fillersLast.slice(0, fillersLast.length - budget));
  const known = rng.shuffle(rest.filter(i => !i.isNew && !gave.has(i)));
  const order = [];
  for (let at = 0; at < length; at++) {
    const item = placed.get(at) ?? known.shift();
    if (item) order.push(item);
  }
  return [...items.slice(0, head), ...order];
}

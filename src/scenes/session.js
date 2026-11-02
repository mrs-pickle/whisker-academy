import { advanceStory } from '../activities/story.js';
import { h } from '../core/dom.js';
import { createArrivalGuard } from '../core/lock.js';
import { buildSession, openToHer } from '../engine/session-builder.js';
import { createMonitor } from '../engine/frustration.js';
import { applyResult, newItemState } from '../engine/itemstate.js';
import { dayOptions } from '../engine/page-recipe.js';
import { closedPass, howOf, markedBack, passesToReturn, reopenedPass, reviewRounds, withBackResult, withPass } from '../engine/passes.js';
import { nextSpellTier } from '../engine/spell-tier.js';
import { heroOf } from '../profile/hero.js';
import { earnMadePage, earnPage, firstWaiting, pagesNow, princeTwin } from '../profile/pages.js';
import { isExtraPractice, latestAccuracy } from '../profile/profile.js';
import { artUrl, bigButton, layeredArt, lessonBar, pathStones, setLessonBar } from '../ui/components.js';
import { wordsBuilt, wordsForStrip } from '../ui/print-pages.js';
import { castArt } from '../ui/story-stage.js';
import { nextBreak, runBreak, runCuddle } from './break.js';
import { dressUpButton } from './dressup.js';
import { pickGiftChoices } from './reward.js';

export { nextGift, pickGiftChoices } from './reward.js';


const PATH = Object.freeze([['warmup', 'cards'], ['spell'], ['chain', 'charm'], ['story']]);
const ACTIVE_MS = 60000;
const NEXT_MS = 1600;
const SAVE_EVERY_MS = 2000;



const wholeCount = (n) => (Number.isInteger(n) && (n) >= 0 ? (n) : 0);

export function createRecorder(states, day, from = {}) {
  const applied = new Set(Array.isArray(from.applied) ? from.applied : []);
  let answered = wholeCount(from.answered);
  let right = Math.min(wholeCount(from.right), answered);
  const history = [];
  return {
    record(id, mode, { correct, helped, ms }, { monitor = true, scored = true } = {}) {
      if (!scored) return;
      const key = `${id}#${mode}`;
      const entry = { id, mode, key, applied: false, changed: false, had: states.has(key), before: states.get(key), counted: monitor, right: monitor && correct && !helped };
      history.push(entry);
      if (!applied.has(key)) {
        applied.add(key);
        entry.applied = true;
        const before = states.get(key);
        if (before?.last !== day) {
          states.set(key, applyResult(before ?? newItemState(key), { day, correct, helped, ms }));
          entry.changed = true;
        }
      }
      if (!monitor) return;
      answered++;
      if (entry.right) right++;
    },
    accuracy: () => (answered === 0 ? 0 : right / answered),
    count: () => answered,
    snapshot: () => ({ applied: [...applied], answered, right }),
    undoLast() {
      const last = history.pop();
      if (!last) return null;
      if (last.applied) applied.delete(last.key);
      if (last.changed) {
        if (last.had) states.set(last.key, (last.before));
        else states.delete(last.key);
      }
      if (last.counted) answered--;
      if (last.right) right--;
      return { id: last.id, mode: last.mode };
    },
  };
}


export function createSessionHooks(recorder, monitor) {
  let asked = false;
  let askedAfter = 0;
  const watched = [];
  return {
    record(id, mode, answer, options = {}) {
      recorder.record(id, mode, answer, options);
      if (options.scored === false) return;
      const seen = options.monitor !== false;
      watched.push(seen);
      if (seen) monitor.record({ correct: answer.correct, ms: answer.ms });
    },
    undo() {
      const undone = recorder.undoLast();
      if (undone && watched.pop()) monitor.undo();
      if (undone && watched.length < askedAfter) asked = false;
      return undone;
    },
    monitor: {
      signal() {
        const signal = monitor.signal();
        if (signal === 'break') {
          asked = true;
          askedAfter = watched.length;
        }
        return signal;
      },
      fast: () => monitor.fast(),
    },
    breakSignalled() {
      const was = asked;
      asked = false;
      if (was) monitor.reset();
      return was;
    },
  };
}

export function sessionRounds(plan) {
  return PATH
    .map(group => group.map(activity => plan.rounds.find(r => r.activity === activity)).filter(r => r !== undefined && r.items.length > 0))
    .filter(group => group.length > 0)
    .map(group => (group));
}

const copy = (list) => (Array.isArray(list) ? [...list] : []);
const strings = (list) => copy(list).filter(x => typeof x === 'string');
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isWhole = (n) => Number.isInteger(n) && (n) >= 0;

export function lessonPercent(groups, at, part = 0, fraction = 0) {
  if (at >= groups.length) return 100;
  const sizes = groups[at].map((r) => Math.max(1, r.items.length));
  const before = sizes.slice(0, part).reduce((a, b) => a + b, 0);
  const whole = sizes.reduce((a, b) => a + b, 0);
  const within = (before + sizes[part] * Math.min(1, Math.max(0, fraction))) / whole;
  return Math.min(99, Math.floor((100 * (at + within)) / groups.length));
}

function recordSession(profile, record, replace) {
  const sessions = copy(profile.sessions);
  const last = sessions.at(-1);
  if (replace && isPlainObject(last) && last.day === record.day && last.complete === false) sessions[sessions.length - 1] = record;
  else sessions.push(record);
  return { ...profile, sessions };
}

export function profileAfterSession(profile, record, states, content, replace = false) {
  return { ...recordSession(profile, record, replace), spellTier: nextSpellTier(profile, states, content) };
}

export { isExtraPractice };





export function startToday(plan, day, profile, settings) {
  return {
    day, taughtUpTo: settings.taughtUpTo, sShContrast: settings.sShContrast, plan,
    done: 0, answered: 0, right: 0, ms: 0, applied: [],
    before: { tricks: strings(profile.unlocked?.tricks), charms: strings(profile.unlocked?.charms), sparkles: strings(profile.unlocked?.sparkles) },
    colorin: null, scene: null, recorded: false, copilot: null, peak: 0, answersIn: null,
  };
}

export function madeToday(profile, today) {
  const now = profile.unlocked ?? {};
  const fresh = (kind) => strings(now[kind]).filter(x => !today.before[kind].includes(x));
  return { tricks: fresh('tricks'), charms: fresh('charms'), sparkles: fresh('sparkles') };
}

function planFrom(raw) {
  if (!isPlainObject(raw) || !Array.isArray(raw.rounds)) return null;
  const rounds = [];
  for (const r of raw.rounds) {
    if (!isPlainObject(r) || typeof r.activity !== 'string' || !Array.isArray(r.items)) return null;
    const items = [];
    for (const i of r.items) {
      if (!isPlainObject(i) || typeof i.id !== 'string' || typeof i.mode !== 'string') return null;
      items.push({ id: i.id, mode: i.mode, isNew: i.isNew === true, isReview: i.isReview === true });
    }
    rounds.push({ activity: (r.activity), items });
  }
  return { day: raw.day, rounds };
}

const storyMove = (pick) => (pick ? { chapterId: pick.chapterId, kind: pick.kind, index: pick.index, forced: pick.forced === true,
  scene: { id: pick.scene.id, reward: { colorin: pick.scene.reward?.colorin ?? null } } } : null);

const isStoryMove = (move) => isPlainObject(move) && typeof move.chapterId === 'string' && ['main', 'side', 'reread', 'again'].includes(move.kind)
  && isWhole(move.index) && typeof move.forced === 'boolean' && isPlainObject(move.scene) && typeof move.scene.id === 'string'
  && isPlainObject(move.scene.reward) && (move.scene.reward.colorin == null || typeof move.scene.reward.colorin === 'string');

function answersInFrom(stored) {
  if (!isPlainObject(stored)) return null;
  const { round, answered, right, story } = stored;
  if (!isWhole(round) || !isWhole(answered) || !isWhole(right) || right > answered) return null;
  return story === null || isStoryMove(story) ? { round, answered, right, story } : null;
}

export function resumeToday(stored, day, settings) {
  if (!isPlainObject(stored) || stored.day !== day) return null;
  if (stored.taughtUpTo !== settings.taughtUpTo || stored.sShContrast !== settings.sShContrast) return null;
  const plan = planFrom(stored.plan);
  if (!plan) return null;
  const done = stored.done;
  if (!Number.isInteger(done) || done < 0 || done > sessionRounds(plan).length) return null;
  const answered = wholeCount(stored.answered);
  return {
    day, taughtUpTo: settings.taughtUpTo, sShContrast: settings.sShContrast, plan, done,
    answered, right: Math.min(wholeCount(stored.right), answered),
    ms: Number.isFinite(stored.ms) && stored.ms > 0 ? stored.ms : 0,
    applied: strings(stored.applied),
    before: { tricks: strings(stored.before?.tricks), charms: strings(stored.before?.charms), sparkles: strings(stored.before?.sparkles) },
    colorin: typeof stored.colorin === 'string' && stored.colorin !== '' ? stored.colorin : null,
    scene: typeof stored.scene === 'string' && stored.scene !== '' ? stored.scene : null,
    recorded: stored.recorded === true,
    copilot: typeof stored.copilot === 'boolean' ? stored.copilot : null,
    peak: Number.isInteger(stored.peak) && stored.peak >= 0 && stored.peak <= 100 ? stored.peak : 0,
    answersIn: answersInFrom(stored.answersIn),
  };
}

export function restartToday(stored, plan, day, profile, settings) {
  const fresh = startToday(plan, day, profile, settings);
  if (!isPlainObject(stored) || stored.day !== day) return fresh;
  const before = isPlainObject(stored.before)
    ? { tricks: strings(stored.before.tricks), charms: strings(stored.before.charms), sparkles: strings(stored.before.sparkles) }
    : fresh.before;
  return {
    ...fresh,
    applied: strings(stored.applied),
    recorded: stored.recorded === true,
    ms: Number.isFinite(stored.ms) && stored.ms > 0 ? stored.ms : 0,
    before,
    scene: typeof stored.scene === 'string' && stored.scene !== '' ? stored.scene : null,
    copilot: typeof stored.copilot === 'boolean' ? stored.copilot : null,
  };
}

const sessionRecord = (today, copilot, complete) => ({
  day: today.day,
  minutes: Math.round(today.ms / 6000) / 10,
  rounds: today.done,
  ...(today.answered === 0 ? {} : { accuracy: today.right / today.answered }),
  copilot,
  complete,
});

export function afterRound(profile, today, { ms, answered, right, applied, copilot }) {
  const next = { ...today, done: today.done + 1, answered, right, ms, applied: [...applied], recorded: true };
  return { today: next, profile: recordSession(profile, sessionRecord(next, copilot, false), today.recorded) };
}

export function noteScene(today, pick) {
  const page = pick?.kind === 'reread' ? null : pick?.scene?.reward?.colorin;
  const scene = pick?.scene?.id;
  return { ...today, ...(typeof page === 'string' && page !== '' ? { colorin: page } : {}), ...(typeof scene === 'string' && scene !== '' ? { scene } : {}) };
}

export function spelledToday(plan, states, day) {
  return copy(plan?.rounds).filter((r) => r?.activity === 'spell').flatMap((r) => copy(r.items))
    .filter((item) => item?.mode === 'spell' && copy(states.get(`${item.id}#spell`)?.hist).some((a) => a?.day === day && a.correct === true))
    .map((item) => item.id);
}

export function answeredToday(applied, states, day) {
  return copy(applied).filter((key) => typeof key === 'string' && key.startsWith('w:') && key.endsWith('#spell')
    && copy(states.get(key)?.hist).some((a) => a?.day === day))
    .map((key) => key.slice(0, -'#spell'.length));
}

function preferring(catalog, first, hero) {
  const pages = copy(catalog);
  const twin = hero === 'prince' && typeof first === 'string' ? pages.find((p) => p?.id === princeTwin(first)) : undefined;
  const page = twin ?? pages.find((p) => p?.id === first);
  return page ? [page, ...pages.filter((p) => p !== page)] : pages;
}

export function finishSession(profile, today, { ms, answered, right, copilot, applied }, { states, content, rng, pages = null, parts = null }) {
  const extra = isExtraPractice(profile, today.day);
  const gifts = extra ? [] : pickGiftChoices(profile, content.rewards ?? [], rng);
  const record = sessionRecord({ ...today, ms, answered, right }, copilot, true);
  const after = profileAfterSession(profile, record, states, content, today.recorded);
  const kept = gifts.length > 0 ? { ...after, pendingGifts: gifts } : after;
  const none = { gifts, profile: kept, pages: null, page: null };
  if (extra || !Array.isArray(pages)) return none;
  const strip = { spelled: spelledToday(today.plan, states, today.day), answered: answeredToday(applied ?? today.applied, states, today.day) };
  const words = wordsForStrip(strip, content);
  const offer = parts && dayOptions({ content, parts, profile: kept, states, scene: today.scene, practice: wordsBuilt(strip, content), day: today.day });
  if (parts && offer) {
    const made = earnMadePage(pages, offer.options[0], today.day, words);
    if (!made.earned) return none;
    return { gifts, profile: kept, pages: made.pages, page: made.earned, maker: { ...offer, family: firstWaiting(pages), parts } };
  }
  const day = earnPage(pages, preferring(content.colorin, today.colorin, heroOf(kept)), kept, today.day);
  if (!day.earned) return none;
  const earned = day.earned;
  const page = { ...earned, words };
  return { gifts, profile: day.profile, pages: day.pages.map((p) => (p === earned ? page : p)), page };
}

export async function libraryForTheDay(ctx) {
  for (let tries = 1; ; tries++) {
    try {
      return await pagesNow(ctx);
    } catch (err) {
      if (tries >= 2) {
        console.error('The coloring pages could not be read, so no page is earned today', err);
        return null;
      }
      console.error('The coloring pages could not be read; trying again', err);
    }
  }
}

export async function partsForTheDay(ctx) {
  try {
    return (await ctx.readParts?.()) ?? null;
  } catch (err) {
    console.error('The page parts could not be read, so the day earns a built-in page', err);
    return null;
  }
}

export function cutOffDay(stored, settings) {
  if (!isPlainObject(stored) || !Number.isInteger(stored.day)) return null;
  const today = resumeToday(stored, stored.day, settings);
  if (!today) return null;
  const rounds = sessionRounds(today.plan).length;
  if (rounds === 0) return null;
  if (today.done === rounds) return today;
  return today.done === rounds - 1 && today.answersIn?.round === rounds - 1 ? today : null;
}

export async function finishCutOffDay(ctx) {
  const cut = cutOffDay(ctx.today, ctx.settings);
  if (!cut) return false;
  const copilot = cut.copilot ?? ctx.settings.copilot !== false;
  let { profile } = ctx;
  let today = cut;
  let score = { ms: cut.ms, answered: cut.answered, right: cut.right, applied: cut.applied, copilot };
  if (cut.done < sessionRounds(cut.plan).length) {
    const { answered, right, story } = (cut.answersIn);
    score = { ...score, answered, right };
    if (story) {
      profile = advanceStory(profile, story);
      today = noteScene(today, story);
    }
    ({ profile, today } = afterRound(profile, today, score));
  }
  const library = isExtraPractice(profile, today.day) ? null : await libraryForTheDay(ctx);
  const parts = library ? await partsForTheDay(ctx) : null;
  const end = finishSession(profile, today, score, { states: ctx.states, content: ctx.content, rng: ctx.rng, pages: library, parts });
  ctx.profile = end.profile;
  if (end.pages) ctx.pages = end.pages;
  ctx.today = null;
  await ctx.save();
  return true;
}

export function createThrottle(run, ms, { now = () => Date.now(), setTimer = (fn, wait) => setTimeout(fn, wait), clearTimer = (id) => clearTimeout(id) } = {}) {
  let last = -Infinity;
  let timer = null;
  const fire = () => {
    timer = null;
    last = now();
    run();
  };
  return {
    poke() {
      if (timer !== null) return;
      const wait = last + ms - now();
      if (wait <= 0) fire();
      else timer = setTimer(fire, wait);
    },
    cancel() {
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}

export function createActiveClock(now = () => Date.now()) {
  let total = 0;
  let from = null;
  let until = 0;
  return {
    input() {
      const t = now();
      if (from !== null && t <= until) { until = t + ACTIVE_MS; return; }
      if (from !== null) total += until - from;
      from = t;
      until = t + ACTIVE_MS;
    },
    ms: () => (from === null ? total : total + Math.max(0, Math.min(now(), until) - from)),
  };
}


const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));


function askCopilot(host, ctx) {
  return new Promise((resolve) => {
    const arrival = createArrivalGuard();
    let chosen = false;
    const onClick = (fn) => (event) => { if (!chosen && arrival.allows(event)) fn(); };
    const choose = (answer) => {
      chosen = true;
      ctx.audio.stop();
      resolve(answer);
    };
    let copilot = ctx.today?.copilot ?? ctx.settings.copilot !== false;
    const choice = (label, value) => h('button', { type: 'button', class: 'copilot-toggle-choice', onClick: onClick(() => set(value)) }, label);
    const yes = choice('Yes', true);
    const no = choice('No', false);
    const set = (value) => {
      copilot = value;
      yes.setAttribute('aria-pressed', String(value));
      no.setAttribute('aria-pressed', String(!value));
    };
    set(copilot);
    const screen = h('div', { class: 'session-start' },
      h('img', { class: 'scene-bg', src: artUrl('bg/hub'), alt: '' }),
      layeredArt(castArt('kitten', ctx.profile?.look, 'sit'), 'session-kitten'),
      h('div', { class: 'session-go' }, bigButton({ label: "Let's go!", icon: 'ui/paw', onClick: onClick(() => {
        screen.remove();
        choose({ walk: true, copilot });
      }) })),
      h('div', { class: 'session-leave' },
        bigButton({ label: 'Back to the castle', icon: 'ui/door-button', onClick: onClick(() => choose({ walk: false, to: 'hub' })) }),
        dressUpButton(ctx.profile?.look, onClick(() => choose({ walk: false, to: 'dressup' })))),
      h('div', { class: 'copilot-toggle', role: 'group', 'aria-label': 'Is a grown-up playing with you today?' },
        h('span', { class: 'copilot-toggle-label' }, 'Grown-up playing today?'), yes, no));
    host.append(screen);
    const lines = ['v.session.path', 'v.session.copilot', 'v.session.go'];
    ctx.setReplay(lines);
    ctx.audio.playSeq(lines);
  });
}

async function kittenMoment(host, ctx, say) {
  const screen = h('div', { class: 'session-next' },
    h('img', { class: 'scene-bg', src: artUrl('bg/hub'), alt: '' }),
    layeredArt(castArt('kitten', ctx.profile?.look, 'cheer'), 'session-kitten cheer'));
  host.append(screen);
  await Promise.all([say(), wait(NEXT_MS)]);
  screen.remove();
}

export function mount(el, ctx) {
  let live = true;
  let started = false;
  let finished = false;
  const doc = el.ownerDocument;
  const clock = createActiveClock();
  const onInput = () => clock.input();
  let stopCatchUp = null;
  let saveSoon = null;
  let saveNow = () => Promise.resolve();

  const day = ctx.day;
  const extra = isExtraPractice(ctx.profile, day);
  const resumed = resumeToday(ctx.today, day, ctx.settings);
  let plan;
  try {
    plan = resumed?.plan ?? buildSession({
      content: ctx.content,
      states: ctx.states,
      settings: ctx.settings,
      profile: ctx.profile,
      day,
      rng: ctx.rng,
      lastAccuracy: latestAccuracy(ctx.profile),
    });
  } catch (err) {
    console.error("Today's plan could not be made", err);
    ctx.router.go('hub').catch(( e) => console.error('The session could not go back to the castle', e));
    return () => {};
  }
  let today = resumed ?? restartToday(ctx.today, plan, day, ctx.profile, ctx.settings);
  ctx.today = today;
  const earlierMs = today.ms;
  const groups = sessionRounds(plan);
  const total = groups.length + 1;
  const host = h('div', { class: 'session-host' });
  const path = h('div', { class: 'session-path' });
  const showPath = (done, fresh = false) => {
    path.replaceChildren(pathStones({ total, done }));
    if (fresh) path.querySelectorAll('.stone')[done - 1]?.classList.add('fresh');
  };
  showPath(today.done);
  const bar = lessonBar();
  const showBar = (percent) => {
    today = { ...today, peak: Math.max(today.peak, percent) };
    setLessonBar(bar, today.peak);
  };
  showBar(lessonPercent(groups, today.done));
  el.append(h('div', { class: 'session' }, host, path, bar));

  const save = () => ctx.save().catch(( err) => console.error('The session could not be saved', err));
  const leaveTo = (to) => {
    ctx.router.go(to, to === 'dressup' ? { from: 'session' } : {}).catch(( err) => console.error(`The session could not open "${to}"`, err));
  };

  const walk = async () => {
    const start = await askCopilot(host, ctx);
    if (!live) return;
    if (!start.walk) {
      leaveTo(start.to);
      return;
    }
    const { copilot } = start;
    today = { ...today, copilot };
    ctx.today = today;
    started = true;
    clock.input();
    doc.addEventListener('pointerdown', onInput, true);
    doc.addEventListener('keydown', onInput, true);
    const recorder = createRecorder(ctx.states, day, today);
    const hooks = createSessionHooks(recorder, createMonitor());
    const score = () => ({ ms: earlierMs + clock.ms(), ...recorder.snapshot(), copilot });
    const catchUp = () => {
      if (finished) return;
      const { ms, applied } = score();
      ctx.today = { ...today, ms, applied };
    };
    saveNow = () => {
      if (finished) return Promise.resolve();
      catchUp();
      return save();
    };
    const throttle = createThrottle(() => { saveNow(); }, SAVE_EVERY_MS);
    saveSoon = throttle;
    stopCatchUp = ctx.onLeave?.(catchUp) ?? null;
    const record = (id, mode, answer, options) => {
      hooks.record(id, mode, answer, options);
      ctx.profile = closedPass(ctx.profile, id, mode, day, howOf(answer, options));
      throttle.poke();
    };
    const undo = () => {
      const undone = hooks.undo();
      if (undone) ctx.profile = reopenedPass(ctx.profile, undone.id, undone.mode, day);
      throttle.poke();
      return undone;
    };
    const pass = (id, mode) => {
      ctx.profile = withPass(ctx.profile, id, mode, day);
      throttle.poke();
    };
    const third = groups.flat().map(r => r.activity).filter(a => a === 'chain' || a === 'charm');
    const protegeIn = third.length > 0 ? ctx.rng.pick(third) : null;
    const first = today.done;
    let cuddle = false;

    const onScene = (pick) => {
      today = noteScene(today, pick);
      throttle.poke();
    };
    const run = async (round, roundHooks) => {
      try {
        const activity = await import(`../activities/${round.activity}.js`);
        await activity.run(host, ctx, round, roundHooks);
      } catch (err) {
        console.error(`The ${round.activity} round stopped`, err);
      }
    };
    const answersIn = (pick) => {
      const { answered, right } = recorder.snapshot();
      today = { ...today, answersIn: { round: groups.length - 1, answered, right, story: storyMove(pick) } };
      saveNow();
    };
    const play = (round, i, part) => run(round, { record, undo, pass, monitor: hooks.monitor, copilot, protege: round.activity === protegeIn, extra, onScene,
      progress: (fraction) => showBar(lessonPercent(groups, i, part, fraction)),
      answersIn: i === groups.length - 1 && part === groups[i].length - 1 ? answersIn : undefined });

    for (let i = first; i < groups.length; i++) {
      if (i > first) {
        let exit;
        if (cuddle) exit = await runCuddle(host, ctx, { dressUp: true });
        else {
          await kittenMoment(host, ctx, () => ctx.say('session.next'));
          if (!live) return;
          exit = await runBreak(host, ctx, { style: nextBreak(ctx), dressUp: true });
        }
        if (!live) return;
        if (exit === 'dressup') {
          leaveTo('dressup');
          return;
        }
      }
      cuddle = false;
      for (const [part, round] of groups[i].entries()) {
        await play(round, i, part);
        if (!live) return;
        if (hooks.breakSignalled()) { cuddle = true; break; }
      }
      ({ profile: ctx.profile, today } = afterRound(ctx.profile, today, score()));
      showBar(lessonPercent(groups, today.done));
      ctx.today = today;
      showPath(today.done, true);
      if (today.done === groups.length) break;
      await save();
      if (!live) return;
    }

    const endDay = async () => {
      await save();
      const library = extra ? null : await libraryForTheDay(ctx);
      const parts = library ? await partsForTheDay(ctx) : null;
      const end = finishSession(ctx.profile, today, score(), { states: ctx.states, content: ctx.content, rng: ctx.rng, pages: library, parts });
      ctx.profile = end.profile;
      if (end.pages) ctx.pages = end.pages;
      ctx.today = null;
      finished = true;
      throttle.cancel();
      await save();
      return end;
    };
    const ending = endDay();
    const ended = ending.then(() => {}, () => {}).then(() => { if (ctx.dayEnding === ended) ctx.dayEnding = null; });
    ctx.dayEnding = ended;
    const end = await ending;
    if (!live) return;

    const passesBack = async () => {
      const items = passesToReturn(ctx.profile, day, openToHer(ctx.content, ctx.settings, ctx.profile));
      if (items.length === 0) return;
      ctx.profile = markedBack(ctx.profile, items, day);
      await save();
      if (!live) return;
      await kittenMoment(host, ctx, () => ctx.say('pass.back'));
      if (!live) return;
      const backHooks = {
        record(id, mode, answer, options) {
          hooks.record(id, mode, answer, options);
          ctx.profile = withBackResult(ctx.profile, id, mode, howOf(answer, options));
          save();
        },
        undo() {
          const undone = hooks.undo();
          save();
          return undone;
        },
        pass(id, mode) {
          ctx.profile = withPass(ctx.profile, id, mode, day);
          save();
        },
        monitor: hooks.monitor, copilot, protege: false, extra, review: true,
      };
      for (const round of reviewRounds(items)) {
        await run(round, backHooks);
        if (!live || hooks.breakSignalled()) return;
      }
    };
    if (!cuddle) await passesBack();
    if (!live) return;
    await ctx.router.go('reward', { gifts: end.gifts, extra, page: end.page, maker: end.maker, ...madeToday(ctx.profile, today), stones: total });
  };
  walk().catch((err) => console.error('The session stopped', err));

  return () => {
    live = false;
    doc.removeEventListener('pointerdown', onInput, true);
    doc.removeEventListener('keydown', onInput, true);
    saveSoon?.cancel();
    stopCatchUp?.();
    if (started && !finished) saveNow();
  };
}

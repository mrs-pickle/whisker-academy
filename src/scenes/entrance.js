import { h } from '../core/dom.js';
import { sentenceBlockers } from '../curriculum/decodable.js';
import { soundKind } from '../curriculum/phonemes.js';
import { applyResult, newItemState } from '../engine/itemstate.js';
import { itemKey, LINE_MISSES, questDetail, questSelection } from '../engine/quest-results.js';
import { createActivityView, holdForUndo, listenDisc, now, showNext, typeToPick, wait } from '../activities/cards.js';
import { phraseClips } from '../activities/spell.js';
import { buildTray } from '../activities/spell-controller.js';
import { COPILOT_HELP, copilotBanner, layeredArt, setUndo, soundBoxes, takeBackButton, tile } from '../ui/components.js';
import { castArt } from '../ui/story-stage.js';
import { HELP_TIPS, offerTips, TIMING_TIPS, TURN_TIPS } from '../ui/tips.js';
import { passageLines, passageTimer, wordsCorrectPerMinute } from './passage-timer.js';
import { earnPage } from '../profile/pages.js';
import { wordsForStrip } from '../ui/print-pages.js';
import { createActiveClock, libraryForTheDay } from './session.js';

export { isTooFast, MAX_PLAUSIBLE_WCPM, passageLines, wordsCorrectPerMinute } from './passage-timer.js';




const SECURE = 0.8;
const MAX_START_TIER = 3;

export const QUEST_DEADLINES = Object.freeze({ real: 3.5 * 60000, nonsense: 6 * 60000, dictation: 9 * 60000 });


export function scoreLine(marks) {
  let correct = 0;
  let misses = 0;
  for (const mark of marks) {
    if (mark) correct++;
    else if (++misses >= LINE_MISSES) return { correct, stopped: true };
  }
  return { correct, stopped: false };
}


export function undoMark(line) {
  const marks = line.marks.slice(0, -1);
  return { ...line, marks, stopped: scoreLine(marks).stopped };
}

export function spellTierFromDictation(results) {
  const byTier = new Map();
  for (const { word, correct } of results) {
    const t = byTier.get(word.tier) ?? { right: 0, total: 0 };
    t.total++;
    if (correct) t.right++;
    byTier.set(word.tier, t);
  }
  let highestSecure = 0;
  for (const t of [1, 2, 3, 4]) {
    const score = byTier.get(t);
    if (!score) continue;
    if (score.right / score.total < SECURE) break;
    highestSecure = t;
  }
  return (Math.min(MAX_START_TIER, highestSecure + 1));
}

const vowelGraphemes = (word) => [...new Set(word.segs.filter(([, p]) => soundKind(p) === 'vowel').map(([g]) => g))];

export function seedWeakItems(results, states, day) {
  const out = new Map(states);
  const applied = new Set();
  const seed = (key, helped, ms) => {
    if (applied.has(key)) return;
    applied.add(key);
    out.set(key, applyResult(states.get(key) ?? newItemState(key), { day, correct: false, helped, ms }));
  };
  for (const { word, mode, correct, helped = false, ms = 0 } of results) {
    if (correct) continue;
    seed(itemKey(word, mode), helped, ms);
    for (const g of vowelGraphemes(word)) seed(`g:${g}#${mode === 'spell' ? 'hear' : 'see'}`, false, ms);
  }
  return out;
}

export function buildBaseline({ day, lines, dictation, passage }) {
  const part = (kind) => lines.filter(l => l.kind === kind)
    .reduce((sum, l) => ({ correct: sum.correct + scoreLine(l.marks).correct, total: sum.total + l.size }), { correct: 0, total: 0 });
  return {
    day,
    real: part('real'),
    nonsense: part('nonsense'),
    dictation: { correct: dictation.filter(r => r.correct).length, total: dictation.length, tier: spellTierFromDictation(dictation) },
    passage: passage ? { wcpm: passage.wcpm, errors: passage.errors } : { wcpm: null, errors: null },
  };
}

export const sectionOpen = (part, activeMs) => activeMs < QUEST_DEADLINES[part];

export function questPlan(content, settings, profile) {
  const n = settings.taughtUpTo;
  const { lines, dictation } = questSelection(content, n);
  const words = new Map((content.words ?? []).map(w => [w.w, w]));
  const entrance = content.entrance ?? {};
  const known = new Set(Object.keys(profile.instant ?? {}).filter(w => profile.instant[w] === 'known'));
  const passage = entrance.passage && sentenceBlockers(entrance.passage.text,
    { lookup: (w) => words.get(w)?.segs ?? null, knownInstant: known, names: new Set(), taughtUpTo: n }).length === 0
    ? entrance.passage : null;
  return { lines, dictation, passage };
}


const ADVANCE_MS = 300;
const PLACE_MS = 250;
const PHRASE_GAP_MS = 80;
const TILE_SIZE = 110;
export const questEndLines = (audio) => ['v.entrance.done', ...(audio.has('name.kitten') ? ['name.kitten'] : [])];

const JOIN_MS = 1800;
const CLOSE_PAUSE_MS = 800;

const LEAVE_QUESTION = 'Leave the Entrance Quest? It starts again next time.';

const ENTRANCE_HELP = `${COPILOT_HELP} Today: one mark per word (Try again means not yet). A line stops after 3 misses; Help counts as a miss.`;


async function readLines(view, lines, { open }) {
  const log = [];
  const at = [];
  const results = [];
  if (lines.length === 0 || !view.live()) return { lines: log, results };
  let current = null;
  let answer = null;
  let helpTips = false;
  const waiting = () => {
    answer = null;
    banner.classList.add('waiting');
    view.choosing(false);
  };
  const mark = (correct, helped) => view.lock.run(async () => {
    const give = answer;
    if (!give || !current) return;
    waiting();
    if (!correct && !helpTips) {
      helpTips = true;
      offerTips(view.ctx, banner, HELP_TIPS);
    }
    if (helped) await view.say([`w.${current.w}`], 600);
    give({ correct, helped });
  });
  const undo = () => view.lock.run(async () => {
    const give = answer;
    if (!give || results.length === 0) return;
    waiting();
    give({ undo: true });
  });
  const pause = async (on) => {
    for (const word of on?.children ?? []) word.classList.remove('current');
    await wait(ADVANCE_MS);
  };
  const banner = copilotBanner({ onYes: () => mark(true, false), onAgain: () => mark(false, false), onHelp: () => mark(false, true), onUndo: undo, helpText: ENTRANCE_HELP });
  banner.classList.add('waiting');
  const showLine = (n) => {
    const row = h('div', { class: 'entrance-line', lang: 'en' }, lines[n].words.map(w => h('span', { class: 'entrance-word' }, w.w)));
    view.show(row);
    return row;
  };

  let row = null;
  let next = 0;
  const takeBackLast = () => {
    if ( (log.at(-1)).marks.length === 0) {
      log.pop();
      next = (at.pop());
      row = showLine( (at.at(-1)));
    }
    log[log.length - 1] = undoMark( (log.at(-1)));
    results.pop();
    setUndo(banner, results.length > 0);
  };
  const hold = async () => {
    banner.hidden = true;
    const again = await holdForUndo(view);
    banner.hidden = false;
    return again;
  };
  while (view.live()) {
    let line = log.at(-1);
    if (!line || line.stopped || line.marks.length === line.size) {
      while (next < lines.length && !open(lines[next].kind)) next++;
      if (next >= lines.length) {
        if (results.length > 0 && await hold()) {
          waiting();
          takeBackLast();
          await pause(row);
          continue;
        }
        break;
      }
      const { kind, words } = lines[next];
      const first = log.length === 0;
      row = showLine(next);
      if (first) {
        view.root.append(banner);
        offerTips(view.ctx, banner, TURN_TIPS.read);
      }
      if (first || kind !== log.at(-1)?.kind) await view.prompt([kind === 'real' ? 'v.entrance.real' : 'v.entrance.nonsense']);
      else await view.say(['v.entrance.next']);
      line = { kind, size: words.length, words: words.map(w => w.w), marks: [], stopped: false };
      log.push(line);
      at.push(next++);
      if (!view.live()) break;
    }
    const j = line.marks.length;
    for (const [k, word] of [... (row).children].entries()) word.classList.toggle('current', k === j);
    current = lines[ (at.at(-1))].words[j];
    const start = now();
    const got = await new Promise((resolve) => { answer = resolve; banner.classList.remove('waiting'); view.choosing(true); });
    if ('undo' in got) {
      takeBackLast();
      await pause(row);
      continue;
    }
    const marks = [...line.marks, got.correct];
    log[log.length - 1] = { ...line, marks, stopped: scoreLine(marks).stopped };
    results.push({ word: current, mode: 'read', correct: got.correct, helped: got.helped, ms: Math.round(now() - start) });
    setUndo(banner, true);
    await pause(row);
  }
  banner.remove();
  return { lines: log, results };
}

async function dictateWord(view, word) {
  const { ctx } = view;
  const clip = `w.${word.w}`;
  const phrase = phraseClips(word);
  const built = [];
  const board = h('div', { class: 'spell-board' });
  const bottom = h('div', { class: 'spell-bottom' });
  let takeBack = () => {};
  const back = takeBackButton({ onBack: () => takeBack() });
  back.disabled = true;
  const draw = (placed) => {
    const boxes = soundBoxes({ count: word.segs.length, filled: word.segs.map((_, i) => built[i] ?? null) });
    boxes.children[built.length]?.classList.add('current');
    if (placed !== undefined) boxes.children[placed].classList.add('placed');
    board.replaceChildren(boxes, back);
  };
  draw();
  view.show(h('div', { class: 'spell-top' }, listenDisc(view, [clip, ...phrase]), board), bottom);
  await view.prompt([clip, ...phrase], { play: [clip] });
  await wait(250);
  await view.play(phrase, PHRASE_GAP_MS);

  const start = now();
  let ms = null;
  const tray = buildTray(word, ctx.settings, ctx.rng);
  await new Promise((resolve) => {
    let stopKeys = () => {};
    let done = false;
    let next = null;
    const finish = () => {
      done = true;
      stopKeys();
      back.remove();
      resolve(undefined);
    };
    const pick = (g) => view.lock.run(async () => {
      if (done || built.length >= word.segs.length) return;
      ms ??= Math.round(now() - start);
      built.push(g);
      draw(built.length - 1);
      if (built.length === word.segs.length) {
        back.disabled = false;
        next = showNext(view);
        next.pressed.then(finish);
        return;
      }
      view.choosing(false);
      back.disabled = true;
      await wait(PLACE_MS);
      back.disabled = false;
      view.choosing(true);
    });
    takeBack = () => view.lock.run(async () => {
      if (done || built.length === 0) return;
      next?.hide();
      next = null;
      built.pop();
      draw();
      back.disabled = built.length === 0;
    });
    bottom.replaceChildren(h('div', { class: 'spell-tray' }, tray.map(g => tile({ label: g, onPick: pick, size: TILE_SIZE }))));
    stopKeys = typeToPick(tray, pick, view.root, view.lock.locked, takeBack);
    view.choosing(true);
  });
  return { word, mode: 'spell', correct: built.join('') === word.w, helped: false, ms: ms ?? 0, built: [...built] };
}

async function readPassage(view, passage) {
  view.root.classList.add('activity-passage');
  view.show(h('div', { class: 'story-page entrance-passage passage-page', lang: 'en' }, passageLines(passage.text).map(line => h('p', { class: 'story-line' }, line))));
  const { wcpm, errors } = await new Promise((resolve) => {
    const timer = passageTimer({ wordCount: passage.wordCount, onFinish: ({ wcpm: score, errors: missed }) => view.lock.run(async () => {
      banner.remove();
      resolve({ wcpm: score, errors: missed });
    }) });
    const banner = h('div', { class: 'copilot-banner entrance-timing', role: 'group', 'aria-label': "Grown-up's turn" }, timer);
    view.root.append(banner);
    offerTips(view.ctx, banner, TIMING_TIPS);
    view.prompt(['v.entrance.passage']);
    view.choosing(true);
  });
  view.choosing(false);
  await view.say(['v.entrance.thanks'], 700);
  return { wcpm, errors };
}

export function questPage(profile, { pages, content, day, dictation }) {
  const none = { profile, pages: null, page: null };
  if (!Array.isArray(pages)) return none;
  const earned = earnPage(pages, content?.colorin, profile, day);
  if (!earned.earned) return none;
  const ids = ( results) => results.filter((r) => r?.mode === 'spell' && typeof r.word?.w === 'string').map((r) => `w:${r.word.w}`);
  const built = Array.isArray(dictation) ? dictation : [];
  const page = { ...earned.earned, words: wordsForStrip({ spelled: ids(built.filter((r) => r?.correct === true)), answered: ids(built) }, content) };
  return { profile: earned.profile, pages: earned.pages.map((p) => (p === earned.earned ? page : p)), page };
}

export function mount(el, ctx) {
  const doc = el.ownerDocument;
  const clock = createActiveClock();
  const onInput = () => clock.input();
  const stopClock = () => {
    doc.removeEventListener('pointerdown', onInput, true);
    doc.removeEventListener('keydown', onInput, true);
  };
  const view = createActivityView(el, ctx, { name: 'entrance', bg: 'bg/hall' });
  let box = null;
  const closeBox = () => {
    box?.remove();
    box = null;
    view.root.removeAttribute('data-keys-held');
  };
  const stopAsking = ctx.onHome?.(( leave) => {
    if (box) return;
    const stay = h('button', { type: 'button', class: 'gu-button gu-primary', onClick: closeBox }, 'Stay');
    box = h('div', { class: 'quest-leave-cover' },
      h('div', { class: 'quest-leave', role: 'group', 'aria-label': 'Leave the Entrance Quest' },
        h('p', { class: 'quest-leave-text' }, LEAVE_QUESTION),
        h('div', { class: 'gu-row' }, stay,
          h('button', { type: 'button', class: 'gu-button', onClick: leave }, 'Leave'))));
    view.root.setAttribute('data-keys-held', '');
    view.root.append(box);
    stay.focus();
  });

  const quest = async () => {
    const plan = questPlan(ctx.content, ctx.settings, ctx.profile);
    clock.input();
    doc.addEventListener('pointerdown', onInput, true);
    doc.addEventListener('keydown', onInput, true);

    view.show(h('div', { class: 'entrance-hall' }, layeredArt(castArt('princess', ctx.profile.look), 'entrance-princess')));
    await view.prompt(['v.entrance.welcome']);

    const read = await readLines(view, [...plan.lines.filter(l => l.kind === 'real'), ...plan.lines.filter(l => l.kind === 'nonsense')],
      { open: (kind) => sectionOpen(kind, clock.ms()) });

    const dictation = [];
    if (plan.dictation.length > 0 && view.live()) {
      view.root.classList.add('activity-spell');
      view.show();
      await view.prompt(['v.entrance.dictation']);
      for (const word of plan.dictation) {
        if (!view.live() || !sectionOpen('dictation', clock.ms())) break;
        dictation.push(await dictateWord(view, word));
      }
      if (dictation.length > 0) await view.say(['v.entrance.thanks'], 700);
      view.root.classList.remove('activity-spell');
    }

    const passage = plan.passage && view.live() ? await readPassage(view, plan.passage) : null;
    if (!view.live()) return;
    stopClock();

    const day = ctx.day;
    const { lines } = read;
    const baseline = buildBaseline({ day, lines, dictation, passage });
    const baselineDetail = questDetail({ day, taughtUpTo: ctx.settings.taughtUpTo, lines, dictation,
      passage: passage && plan.passage ? { id: plan.passage.id, ...passage } : null });
    ctx.profile = { ...ctx.profile, baseline, baselineDetail, spellTier: baseline.dictation.tier };
    stopAsking?.();
    closeBox();
    for (const [key, state] of seedWeakItems([...read.results, ...dictation], ctx.states, day)) ctx.states.set(key, state);
    const library = await libraryForTheDay(ctx);
    const earned = questPage(ctx.profile, { pages: library, content: ctx.content, day, dictation });
    ctx.profile = earned.profile;
    if (earned.pages) ctx.pages = earned.pages;
    await ctx.save().catch(( err) => console.error('The Entrance Quest could not be saved', err));
    if (!view.live()) return;

    view.show(h('div', { class: 'entrance-hall' },
      layeredArt(castArt('princess', ctx.profile.look), 'entrance-princess'),
      layeredArt(castArt('kitten', ctx.profile.look, 'cheer'), 'entrance-kitten')));
    await Promise.all([view.prompt(questEndLines(ctx.audio)), wait(JOIN_MS)]);
    await wait(CLOSE_PAUSE_MS);
    if (!view.live()) return;
    leaving = true;
    await ctx.router.go('hub');
  };
  let leaving = false;
  quest().catch((err) => {
    console.error('The Entrance Quest stopped', err);
    if (view.live() && !leaving) {
      leaving = true;
      ctx.router.go('hub').catch(( e) => console.error('The Entrance Quest could not go back to the castle', e));
    }
  }).finally(stopClock);

  return () => {
    stopClock();
  };
}

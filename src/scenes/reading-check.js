import { h } from '../core/dom.js';
import { scoreLine, undoMark } from '../engine/quest-results.js';
import { holdForUndo, listenDisc, now, showNext, typeToPick, wait } from '../activities/cards.js';
import { phraseClips } from '../activities/spell.js';
import { buildTray } from '../activities/spell-controller.js';
import { copilotBanner, setUndo, soundBoxes, takeBackButton, tile } from '../ui/components.js';
import { HELP_TIPS, offerTips, TIMING_TIPS, TURN_TIPS } from '../ui/tips.js';
import { passageLines, passageTimer } from './passage-timer.js';
import { heroOf, heroWords } from '../profile/hero.js';



export const QUEST_DEADLINES = Object.freeze({ real: 3.5 * 60000, nonsense: 6 * 60000, dictation: 9 * 60000 });

export const sectionOpen = (part, activeMs) => activeMs < QUEST_DEADLINES[part];


const ADVANCE_MS = 300;
const PLACE_MS = 250;
const PHRASE_GAP_MS = 80;
const TILE_SIZE = 110;


export async function readLines(view, lines, { open, voice, helpText, tipsFor, pick }) {
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
  const hx = heroWords(view.ctx);
  const banner = copilotBanner({ onYes: () => mark(true, false), onAgain: () => mark(false, false), onHelp: () => mark(false, true), onUndo: undo, helpText: hx(helpText), hero: heroOf(view.ctx?.profile) });
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
      if (pick) {
        const chosen = pick([...at], [...log]);
        next = chosen !== null && chosen >= 0 && chosen < lines.length && open(lines[chosen].kind, log) ? chosen : lines.length;
      } else while (next < lines.length && !open(lines[next].kind, log)) next++;
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
      const more = tipsFor?.(lines[next]) ?? [];
      if (more.length > 0) offerTips(view.ctx, banner, more);
      if (first || kind !== log.at(-1)?.kind) await view.prompt([kind === 'real' ? voice.real : voice.nonsense]);
      else await view.say([voice.next]);
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

export async function dictateWord(view, word) {
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

export async function dictateWords(view, words, { open, voice }) {
  const results = [];
  if (words.length === 0 || !view.live()) return results;
  view.root.classList.add('activity-spell');
  view.show();
  await view.prompt([voice.intro]);
  for (const word of words) {
    if (!view.live() || !open()) break;
    results.push(await dictateWord(view, word));
  }
  if (results.length > 0) await view.say([voice.thanks], 700);
  view.root.classList.remove('activity-spell');
  return results;
}

export async function readPassage(view, passage, voice, { stop = false, note } = {}) {
  view.root.classList.add('activity-passage');
  view.show(h('div', { class: 'story-page entrance-passage passage-page', lang: 'en' }, passageLines(passage.text).map(line => h('p', { class: 'story-line' }, line))));
  const timing = await new Promise((resolve) => {
    const timer = passageTimer({ wordCount: passage.wordCount, hero: heroOf(view.ctx?.profile), onFinish: ({ wcpm: score, errors: missed }) => view.lock.run(async () => {
      banner.remove();
      resolve({ wcpm: score, errors: missed });
    }) });
    if (stop) {
      timer.querySelector('.copilot-choices')?.append(h('button', { type: 'button', class: 'copilot-choice help passage-stop', onClick: () => view.lock.run(async () => {
        banner.remove();
        resolve({ wcpm: null, errors: null, stopped: true });
      }) }, 'Stop: not timed'));
    }
    if (note) timer.append(h('p', { class: 'passage-timer-note passage-voice-note' }, heroWords(view.ctx)(note)));
    const banner = h('div', { class: 'copilot-banner entrance-timing', role: 'group', 'aria-label': "Grown-up's turn" }, timer);
    view.root.append(banner);
    offerTips(view.ctx, banner, TIMING_TIPS);
    view.prompt([voice.prompt]);
    view.choosing(true);
  });
  view.choosing(false);
  await view.say([voice.thanks], 700);
  return timing;
}

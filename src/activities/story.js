import { h } from '../core/dom.js';
import { nextSideQuest, nextStoryScene, previousMainScene, rereadDay } from '../engine/story-place.js';
import { artUrl } from '../ui/components.js';
import { createStoryStage, sceneArt } from '../ui/story-stage.js';
import { offerTips, TIMING_TIPS } from '../ui/tips.js';
import { bounce, createActivityView, createOnce, herTurn, holdForUndo, judgeAloud, notYet, now, sparkle, untilHerTurn } from './cards.js';



const MIN_TIMED_MS = 2000;


function previousMain(content, profile, settings) {
  const prev = previousMainScene(content, profile, settings);
  return prev ? { ...prev, kind: 'reread' } : null;
}

export function nextScene(content, profile, settings) {
  if (rereadDay(profile)) {
    const reread = previousMain(content, profile, settings);
    if (reread) return reread;
  }
  return nextStoryScene(content, profile, settings);
}

export function extraScene(content, profile, settings) {
  const pick = previousMain(content, profile, settings) ?? nextSideQuest(content, profile, settings);
  return pick ? { ...pick, forced: true } : null;
}

function findScene(content, id) {
  for (const ch of content.story ?? []) {
    const main = ch.scenes.findIndex(s => s.id === id);
    if (main >= 0) return { chapterId: ch.id, scene: ch.scenes[main], kind: 'main', index: main };
    const side = ch.side.findIndex(s => s.id === id);
    if (side >= 0) return { chapterId: ch.id, scene: ch.side[side], kind: 'side', index: side };
  }
  return null;
}

export function sceneForRound(content, profile, settings, item, { extra = false } = {}) {
  if (typeof item?.id !== 'string' || !item.id.startsWith('s:')) return null;
  if (extra) return item.mode === 'again' ? null : extraScene(content, profile, settings);
  const id = item.id.slice(2);
  if (item.mode !== 'reread' && item.mode !== 'again') {
    const planned = nextStoryScene(content, profile, settings);
    if (planned?.scene.id === id) return { ...(nextScene(content, profile, settings) ?? planned), forced: false };
  }
  const found = findScene(content, id);
  if (!found) return null;
  const kind = item.mode === 'reread' || item.mode === 'again' ? item.mode : found.kind;
  return { ...found, kind, forced: true };
}

export function advanceStory(profile, result) {
  if (!result || result.forced) return profile;
  const story = { ...profile.story };
  if (result.kind === 'side') {
    const side = Number.isInteger(result.index) ? (result.index) + 1 : (Number(story.side) || 0) + 1;
    return { ...profile, story: { ...story, side } };
  }
  if (result.kind !== 'main') return profile;
  const index = Number.isInteger(result.index) ? (result.index)
    : result.chapterId === story.chapter ? Number(story.scene) || 0 : 0;
  return { ...profile, story: { ...story, chapter: result.chapterId, scene: index + 1 } };
}

const EFFECT_ART = Object.freeze({ 'vex-slip': 'cast/vex-slip', 'crow-flap': 'cast/gus-flap' });

export function questionEffect(scene) {
  const answer = scene?.question?.answer ?? '';
  const lines = scene?.sentences ?? [];
  const trick = answer.startsWith('tricks/') ? answer.slice('tricks/'.length) : null;
  return lines.findLast(s => EFFECT_ART[ (s.effect)] === answer)
    ?? (trick ? lines.findLast(s => s.trick === trick) : undefined)
    ?? lines.at(-1) ?? null;
}

export function wordsPerMinute(lines, ms) {
  if (!Number.isFinite(ms) || ms < MIN_TIMED_MS) return null;
  const words = lines.reduce((n, s) => n + (String(s.text).match(/[A-Za-z]+(?:'[A-Za-z]+)?/g)?.length ?? 0), 0);
  return Math.round(words / (ms / 60000));
}


const voice = (ids) => (ids ?? []).map(id => `v.${id}`);
const sentenceClip = (s) => `s.${s.id}`;
const storyLine = (s) => h('p', { class: 'story-line' }, s.text);


async function readLines(view, stage, page, scene, hooks, { copilot, once, together: along }) {
  let together = along;
  const shown = [];
  const undoable = copilot && typeof hooks.undo === 'function';
  let back = false;
  for (let i = 0; ; i++) {
    if (!view.live()) return { done: false, together };
    if (i >= scene.sentences.length) {
      if (!back || !(await holdForUndo(view))) break;
      hooks.undo?.();
      back = false;
      i -= 2;
      continue;
    }
    const s = scene.sentences[i];
    const line = shown[i] ?? storyLine(s);
    if (!shown[i]) {
      shown.push(line);
      page.append(line);
    }
    line.classList.add('current');
    let answer = null;
    if (together) {
      await view.prompt([sentenceClip(s)]);
    } else {
      await view.prompt(['v.story.read'], { play: once('v.story.read') });
      const judged = await judgeAloud(view, { copilot, kind: 'read', model: [sentenceClip(s)], target: line, canUndo: back });
      if ('undo' in judged) {
        hooks.undo?.();
        line.remove();
        shown.pop();
        back = false;
        i -= 2;
        continue;
      }
      answer = judged;
      hooks.record(`s:${s.id}`, 'read', answer, copilot ? undefined : { scored: false });
      back = undoable;
    }
    line.classList.remove('current');
    await stage.play(s.effect, { trick: s.trick });
    if (answer?.correct && !answer.helped) {
      view.sayNext(view.praise('story'));
      if (copilot) view.play([]);
    }
    if (copilot && answer && !answer.correct && hooks.monitor?.signal?.() === 'break') {
      if (back && await holdForUndo(view)) {
        hooks.undo?.();
        back = false;
        i--;
        continue;
      }
      together = true;
      back = false;
      await view.say(['v.story.reread.echo']);
    }
  }
  return { done: view.live(), together };
}

async function tellScene(view, stage, page, { scene, kind }, hooks, options) {
  await view.prompt([kind === 'side' ? 'v.story.side' : 'v.story.start', ...voice(scene.intro)]);
  const { done, together } = await readLines(view, stage, page, scene, hooks, options);
  if (!done) return { done, together };
  if (scene.question && view.live()) {
    await askQuestion(view, stage, scene);
    view.show(page);
  }
  if (!view.live()) return { done: false, together };
  await view.prompt([...voice(scene.outro), ...(options.last ? ['v.story.end'] : [])]);
  return { done: view.live(), together };
}

async function soloScene(view, stage, page, scene, hooks, options) {
  await view.prompt(['v.story.reread.start', options.together ? 'v.story.reread.echo' : 'v.story.reread.solo']);
  const read = await readLines(view, stage, page, scene, hooks, options);
  if (read.done && options.last) await view.prompt(['v.story.end']);
  return { done: read.done && view.live(), together: read.together };
}

async function askQuestion(view, stage, scene) {
  const q = (scene.question);
  const replay = questionEffect(scene);
  const choices = untilHerTurn(q.choices.map(id => ({ id, el: h('button', { type: 'button', class: 'pic-choice', 'aria-label': id.split('/').pop() },
    h('img', { src: artUrl(id), alt: '', draggable: 'false' })) })));
  const right = choices.find(c => c.id === q.answer)?.el;
  if (!right) return;
  view.show(h('div', { class: 'choice-row story-question' }, choices.map(c => c.el)));
  await view.prompt([`v.${q.line}`]);
  await new Promise((resolve) => {
    let misses = 0;
    const pick = (chosen) => view.lock.run(async () => {
      view.choosing(false);
      if (chosen === right) {
        right.classList.add('chosen');
        sparkle(right);
        view.cheer();
        await view.say([], 900);
        resolve(undefined);
        return;
      }
      misses++;
      bounce(chosen);
      await view.say(['v.story.question.again'], 600);
      if (replay) await stage.play(replay.effect, { trick: replay.trick });
      if (misses >= 2) right.classList.add('glow');
      view.choosing(true);
    });
    for (const c of choices) c.el.addEventListener('click', () => { if (!notYet(c.el)) pick(c.el); });
    herTurn(choices);
    view.choosing(true);
  });
}

async function modelLines(view, stage, scene, lines) {
  for (const [i, s] of scene.sentences.entries()) {
    if (!view.live()) return;
    lines[i].classList.add('current');
    await view.play([sentenceClip(s)]);
    lines[i].classList.remove('current');
    await stage.play(s.effect, { trick: s.trick });
  }
}

const SHOW_SPEED = 'Show words per minute';

export function timeReading(view, scene, onDone) {
  return new Promise((resolve) => {
    let started = 0;
    let readout = '';
    const button = (label, kind, onClick, hidden = false) =>
      h('button', { type: 'button', class: ['copilot-choice', kind], hidden, onClick }, label);
    const start = button('▶ Start', 'yes', () => {
      started = now();
      start.disabled = true;
      done.disabled = false;
    });
    const done = button('■ Done', 'yes', () => view.lock.run(async () => {
      const wpm = wordsPerMinute(scene.sentences, now() - started);
      readout = wpm === null ? 'That was too quick to time.' : `About ${wpm} words per minute.`;
      start.hidden = true;
      done.hidden = true;
      show.hidden = false;
      finish.hidden = false;
      view.choosing(false);
      await onDone();
    }));
    done.disabled = true;
    const show = button(SHOW_SPEED, 'help', () => {
      const showing = show.getAttribute('aria-pressed') !== 'true';
      show.textContent = showing ? readout : SHOW_SPEED;
      show.setAttribute('aria-pressed', String(showing));
    }, true);
    show.setAttribute('aria-pressed', 'false');
    const finish = button('Finish', 'again', () => view.lock.run(async () => { banner.remove(); resolve(undefined); }), true);
    const banner = h('div', { class: 'copilot-banner story-timing', role: 'group', 'aria-label': "Grown-up's turn" },
      h('p', { class: 'copilot-title' }, "Grown-up's turn: time her reading"),
      h('div', { class: 'copilot-tips' }),
      h('div', { class: 'copilot-choices' }, start, done, show, finish));
    view.root.append(banner);
    offerTips(view.ctx, banner, TIMING_TIPS);
  });
}

async function rereadScene(view, stage, page, scene, { copilot, last }) {
  view.root.classList.add('activity-reread');
  const lines = scene.sentences.map(storyLine);
  page.append(...lines);
  const smoother = async () => {
    view.show(page, h('p', { class: 'story-smoother' }, 'Your story got smoother!'));
    view.cheer();
    await Promise.all([view.prompt(['v.story.reread.smoother']), stage.play('sparkle')]);
  };

  await view.prompt(['v.story.reread.start', 'v.story.reread.model']);
  await modelLines(view, stage, scene, lines);
  if (!view.live()) return;
  await view.prompt(['v.story.reread.echo']);
  for (const [i, s] of scene.sentences.entries()) {
    if (!view.live()) return;
    lines[i].classList.add('current');
    await view.prompt([sentenceClip(s)]);
    await judgeAloud(view, { copilot, kind: 'said', model: [sentenceClip(s)], target: lines[i] });
    lines[i].classList.remove('current');
  }
  if (!view.live()) return;
  await view.prompt(['v.story.reread.solo']);
  if (copilot) {
    view.choosing(true);
    await timeReading(view, scene, smoother);
  } else {
    await judgeAloud(view, { copilot: false, kind: 'read', model: scene.sentences.map(sentenceClip), target: page });
    await smoother();
  }
  if (view.live() && last) await view.prompt(['v.story.end']);
}

function sceneOnStage(el, ctx, scene) {
  const view = createActivityView(el, ctx, { name: 'story', bg: sceneArt(scene.bg) });
  const host = h('div', { class: 'story-stage-host' });
  view.root.insertBefore(host, view.work);
  const stage = createStoryStage(host, { bg: scene.bg, cast: scene.cast, look: ctx.profile.look });
  const page = h('div', { class: 'story-page', lang: 'en' });
  view.show(page);
  return { view, stage, page };
}

export function readAloud(el, ctx, scene) {
  const { view, stage, page } = sceneOnStage(el, ctx, scene);
  const tell = async () => {
    await view.prompt(voice(scene.intro));
    if (!view.live()) return;
    const lines = scene.sentences.map(storyLine);
    page.append(...lines);
    ctx.setReplay(null);
    await view.lock.run(() => modelLines(view, stage, scene, lines));
    await view.prompt(scene.sentences.map(sentenceClip), { play: [] });
    await view.play(voice(scene.outro));
  };
  tell().catch((err) => console.error(`The scene "${scene.id}" stopped`, err));
  return () => {
    stage.destroy();
    view.destroy();
  };
}

export async function run(el, ctx, round, hooks) {
  const extra = hooks.extra === true;
  const passages = (round?.items ?? []).filter(i => i.id.startsWith('s:')).flatMap((item) => {
    const pick = sceneForRound(ctx.content, ctx.profile, ctx.settings, item, { extra });
    if (!pick && !extra) console.warn(`Story time cannot find the scene for ${item.id}; skipping it.`);
    return pick ? [pick] : [];
  });
  const copilot = hooks.copilot ?? ctx.settings.copilot;
  const once = createOnce();
  let together = false;
  for (const [n, pick] of passages.entries()) {
    const { scene } = pick;
    const { view, stage, page } = sceneOnStage(el, ctx, scene);
    const options = { copilot, once, together, last: n === passages.length - 1 };
    let done = false;
    try {
      if (pick.kind === 'reread') {
        await rereadScene(view, stage, page, scene, options);
        done = view.live();
        if (done && !extra) hooks.onScene?.(pick);
      } else if (pick.kind === 'again') {
        ({ done, together } = await soloScene(view, stage, page, scene, hooks, options));
      } else {
        ({ done, together } = await tellScene(view, stage, page, pick, hooks, options));
        if (done) {
          const before = ctx.profile;
          ctx.profile = advanceStory(ctx.profile, pick);
          if (ctx.profile !== before) hooks.onScene?.(pick);
        }
      }
    } finally {
      stage.destroy();
      view.destroy();
    }
    if (!done) return;
  }
}

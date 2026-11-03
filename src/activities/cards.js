import { chunkOfGrapheme } from '../curriculum/chunks.js';
import { splitWord } from '../curriculum/syllables.js';
import { h } from '../core/dom.js';
import { CLIP_GAP_MS } from '../core/audio.js';
import { createLock } from '../core/lock.js';
import { CORRESPONDENCES } from '../curriculum/correspondences.js';
import { PHONEMES, phonemeCodes } from '../curriculum/phonemes.js';
import { heroOf } from '../profile/hero.js';
import { artUrl, bigButton, copilotBanner, copilotHold, copilotUndoAside, keysOnPage, nextButton, passButton, setUndo, tile } from '../ui/components.js';
import { HELP_TIPS, markTipSeen, offerTips, TH_TIPS, TURN_TIPS } from '../ui/tips.js';



export const CONFUSIONS = Object.freeze({
  i: Object.freeze(['e']), e: Object.freeze(['i']),
  sh: Object.freeze(['s', 'ch']), ch: Object.freeze(['sh']),
  th: Object.freeze(['f']),
  b: Object.freeze(['d', 'p']), d: Object.freeze(['b', 't']),
  m: Object.freeze(['n']), n: Object.freeze(['m']),
  p: Object.freeze(['b']), t: Object.freeze(['d']),
  f: Object.freeze(['v']), v: Object.freeze(['f']),
  g: Object.freeze(['k']), k: Object.freeze(['g']),
});

const VOWEL_CARDS = new Set(['a', 'e', 'i', 'o', 'u']);
const S_SH = new Set(['s', 'sh']);
const CARD_SOUNDS = Object.freeze({ th: Object.freeze(['th', 'dh']) });

export function cardSoundClips(g) {
  const key = String(g).toLowerCase();
  const chunk = chunkOfGrapheme(key);
  if (chunk) return [chunk];
  const own = CARD_SOUNDS[ (key)];
  let sounds = own ?? [];
  if (!own) {
    const entry = CORRESPONDENCES.find(c => c.g === key && c.before === undefined && c.after === undefined && c.p !== '');
    if (entry) sounds = [entry.p];
    else if (key !== '' && Object.hasOwn(PHONEMES, key)) sounds = [key];
  }
  return sounds.flatMap(p => phonemeCodes(p)).map(code => `p.${code}`);
}

export function cardRoutineClips(card, settings) {
  const sound = cardSoundClips(card.g);
  const keyword = typeof card.keyword === 'string' ? card.keyword.trim().toLowerCase() : '';
  if (settings.cardRoutine !== 'name-key-sound' || keyword === '') return sound;
  const names = [...card.g.toLowerCase()].filter(ch => ch >= 'a' && ch <= 'z').map(ch => `ln.${ch}`);
  return [...names, `w.${keyword}`, ...sound];
}

export function cardDistractors(g, deck, settings, rng) {
  const sound = cardSoundClips(g).join(' ');
  const allowed = (x) => x !== g
    && !(sound !== '' && cardSoundClips(x).join(' ') === sound)
    && !(!settings.sShContrast && S_SH.has(g) && S_SH.has(x));
  const graphemes = [...new Set((deck ?? []).map(c => c?.g).filter(x => typeof x === 'string' && x !== ''))].filter(allowed);
  const near = (CONFUSIONS[ (g)] ?? []).filter(x => graphemes.includes(x));
  const others = graphemes.filter(x => !near.includes(x));
  const vowel = VOWEL_CARDS.has(g);
  const want = 2 + rng.int(2);
  return [
    ...near,
    ...rng.shuffle(others.filter(x => VOWEL_CARDS.has(x) === vowel)),
    ...rng.shuffle(others.filter(x => VOWEL_CARDS.has(x) !== vowel)),
  ].slice(0, Math.max(want, near.length));
}


export function createOnce() {
  const said = new Set();
  return (line) => {
    if (said.has(line)) return [];
    said.add(line);
    return [line];
  };
}

export function addUnlocked(profile, kind, id) {
  const unlocked = profile.unlocked ?? (profile.unlocked = {});
  const list = Array.isArray(unlocked[kind]) ? (unlocked[kind]) : (unlocked[kind] = ([]));
  if (list.includes(id)) return false;
  list.push(id);
  return true;
}

export const isKnown = (profile, w) => profile?.instant?.[w] === 'known';

export const knownInstant = (content, profile) => (content.instant ?? []).filter(iw => isKnown(profile, iw.w));


export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const STRETCH_GAP_MS = 80;
export const now = () => globalThis.performance?.now?.() ?? Date.now();

const FURS = Object.freeze(['orange', 'gray', 'black', 'calico']);
export const PRAISE = Object.freeze({ blend: 3, sound: 3, count: 2, build: 3, read: 3, chain: 2, charm: 2, story: 3 });
const PRAISE_EVERY = 3;

export function soundPraiseLines(kind, detail) {
  switch (kind) {
    case 'say':
    case 'pick': return [3];
    case 'isolate': return detail === 'last' ? [1, 3] : detail === 'middle' ? [2, 3] : [3];
    case 'pair': return detail === 'ie' ? [2] : [];
    default: return [];
  }
}

export const countPraiseLines = (boxes) => (boxes ? [1, 2] : [1]);

export const BLEND_PRAISE = Object.freeze([3, 'sound.1']);


export function createActivityView(el, ctx, { name, bg = 'bg/toyroom' }) {
  const lock = createLock();
  const fur = FURS.includes(ctx.profile?.look?.kittenFur) ? ctx.profile.look.kittenFur : 'orange';
  const kittenArt = (pose) => artUrl(`kitten/kitten-${fur}-${pose}`);
  let prompt = [];
  let kept = [];
  let cue = null;
  let promptGap;
  let cueGap;
  let successes = 0;
  let poseTimer;

  const kittenImg = h('img', { src: kittenArt('sit'), alt: '', draggable: 'false' });
  const kitten = h('button', { type: 'button', class: 'activity-kitten', 'aria-label': 'Hear it again',
    onClick: () => { if (!lock.locked()) play(cue ?? prompt, cue ? cueGap : promptGap); } }, kittenImg);
  const work = h('div', { class: 'activity-work' });
  const root = h('div', { class: ['activity', `activity-${name}`] },
    h('img', { class: 'scene-bg', src: artUrl(bg), alt: '' }), work, kitten);
  el.append(root);

  const live = () => root.isConnected;
  const play = async (ids, gap) => {
    const lead = kept.length;
    const clips = [...kept, ...ids];
    kept = [];
    if (!live() || clips.length === 0) return false;
    const said = ctx.audio.playSeq(clips, gap, lead);
    return ids.length === 0 ? false : (await said) !== false;
  };

  return {
    ctx,
    root,
    work,
    lock,
    show(...nodes) { work.replaceChildren(...nodes.filter(Boolean)); },
    async prompt(ids, { play: played = ids, gap } = {}) {
      if (!live()) return false;
      prompt = (ids.filter(Boolean));
      promptGap = gap;
      cue = null;
      ctx.setReplay?.(prompt, gap);
      const clips = (played.filter(Boolean));
      return clips.length > 0 ? play(clips, gap) : false;
    },
    current: () => [...prompt],
    async say(ids, minMs = 0, gap) {
      if (ids.length > 0) { cue = ids; cueGap = gap; }
      await Promise.all([play(ids, gap), wait(minMs)]);
    },
    play,
    sayNext(ids) { kept = [...kept, ...ids]; },
    async sayKept() {
      const clips = kept;
      kept = [];
      if (live() && clips.length > 0) await ctx.audio.playSeq(clips);
    },
    choosing(on) { root.toggleAttribute('data-choosing', on); },
    cheer() {
      kittenImg.src = kittenArt('cheer');
      clearTimeout(poseTimer);
      poseTimer = setTimeout(() => { kittenImg.src = kittenArt('sit'); }, 1400);
    },
    think(on) {
      clearTimeout(poseTimer);
      kittenImg.src = kittenArt(on ? 'think' : 'sit');
    },
    praise(group, lines) {
      successes++;
      if (successes % PRAISE_EVERY !== 0) return [];
      const pool = lines ?? Array.from({ length: PRAISE[group] }, (_, i) => i + 1);
      if (pool.length === 0) return [];
      const line = pool[(successes / PRAISE_EVERY - 1) % pool.length];
      return [typeof line === 'string' ? `v.praise.${line}` : `v.praise.${group}.${line}`];
    },
    live,
    destroy() {
      clearTimeout(poseTimer);
      if (!live()) return;
      ctx.audio.stop();
      ctx.setReplay?.(null);
      root.remove();
    },
  };
}

export function listenDisc(view, clips, gap) {
  return h('button', { type: 'button', class: 'listen-disc', 'aria-label': 'Hear the sound again',
    onClick: () => { if (!view.lock.locked()) view.play(clips, gap); } },
  h('img', { src: artUrl('ui/speaker'), alt: '', draggable: 'false' }));
}

export const secondClick = (event) => (event?.detail ?? 0) >= 2;

const SPARKLE_IN = 56;
const SPARKLE_OUT = 40;

export function bounce(el) {
  el.classList.remove('bounce');
  void el.offsetWidth;
  el.classList.add('bounce');
}

export function sparkle(el, over) {
  const star = h('img', { class: 'sparkle-pop', src: artUrl('ui/sparkle'), alt: '', draggable: 'false' });
  if (over) {
    const at = el.getBoundingClientRect?.();
    const box = over.getBoundingClientRect?.();
    if (at && box) {
      const scale = box.width / (over.offsetWidth || box.width) || 1;
      Object.assign(star.style, { left: `${(at.right - box.left) / scale - SPARKLE_IN}px`, top: `${(at.top - box.top) / scale - SPARKLE_OUT}px`, right: 'auto' });
    }
  }
  (over ?? el).append(star);
  setTimeout(() => star.remove(), 900);
}

export function typeToPick(labels, onPick, control, paused = () => false, onBack = null) {
  if (!control.isConnected) return () => {};
  let typed = '';
  let stopped = false;
  let timer;
  const flush = () => { const exact = labels.includes(typed) ? typed : null; typed = ''; if (exact && control.isConnected && !paused()) onPick(exact); };
  const onKey = (event) => {
    if (event.repeat || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = (event.target);
    if (target?.closest?.('input, textarea, select, [contenteditable]')) return;
    if (event.key === 'Backspace' && onBack) {
      event.preventDefault();
      clearTimeout(timer);
      const waiting = typed !== '';
      typed = '';
      if (!waiting && !paused()) onBack();
      return;
    }
    const key = event.key.toLowerCase();
    if (!/^[a-z]$/.test(key)) return;
    clearTimeout(timer);
    if (paused()) { typed = ''; return; }
    if (typed !== '' && !labels.some(l => l.startsWith(typed + key))) {
      flush();
      if (stopped || paused()) return;
    }
    const next = typed + key;
    typed = labels.some(l => l.startsWith(next)) ? next : '';
    if (typed === '') return;
    event.preventDefault();
    if (labels.includes(typed) && !labels.some(l => l !== typed && l.startsWith(typed))) flush();
    else timer = setTimeout(flush, 800);
  };
  const stopKeys = keysOnPage(control, onKey);
  return () => { stopped = true; clearTimeout(timer); stopKeys(); };
}

const NEXT_LINE = 'spell.next';

export function showNext(view, say = []) {
  if (!view.live()) return { pressed: new Promise(() => {}), said: Promise.resolve(), hide() {} };
  const { ctx } = view;
  const first = ctx.settings?.tipsSeen?.[NEXT_LINE] !== true;
  if (first) ctx.settings = { ...ctx.settings, tipsSeen: markTipSeen(ctx.settings?.tipsSeen, NEXT_LINE) };
  let done = () => {};
  const pressed = new Promise((resolve) => { done = resolve; });
  const button = nextButton({ onNext: () => {
    button.remove();
    ctx.audio.stop();
    view.choosing(false);
    done();
  } });
  view.root.append(button);
  button.focus();
  view.choosing(true);
  const said = view.say([...say, ...(first ? ['v.spell.next'] : [])]);
  return { pressed, said, hide: () => button.remove() };
}

export function offerPass(view, onPass) {
  const button = passButton({ onPass: (event) => {
    if (secondClick(event)) return;
    view.lock.run(async () => {
      button.remove();
      onPass();
    });
  } });
  view.root.append(button);
  return () => button.remove();
}

export const notYet = (el) => el.classList.contains('not-yet');

function wiggle(el) {
  el.classList.remove('wiggle');
  void el.offsetWidth;
  el.classList.add('wiggle');
}

export function untilHerTurn(choices) {
  for (const c of choices) {
    c.el.classList.add('not-yet');
    c.el.setAttribute('aria-disabled', 'true');
    c.el.addEventListener('click', () => { if (notYet(c.el)) wiggle(c.el); });
  }
  return choices;
}

export function herTurn(choices) {
  for (const c of choices) {
    c.el.classList.remove('not-yet');
    c.el.removeAttribute('aria-disabled');
  }
}

export function chooseOne(view, { choices, answer, hint, reward, praise, praiseLines, keyboard = false, target = null, hintGap, abandon = null }) {
  return new Promise((resolve) => {
    if (abandon?.aborted) return;
    const start = now();
    let ms = null;
    let misses = 0;
    let revealed = false;
    let answeredRight = false;
    let passed = false;
    let stopKeys = () => {};
    let stopPass = () => {};
    const right = choices.find(c => c.value === answer)?.el;
    const pick = (value) => view.lock.run(async () => {
      const chosen = choices.find(c => c.value === value)?.el;
      if (answeredRight || passed || abandon?.aborted || !chosen || !right || (revealed && chosen !== right)) return;
      ms ??= Math.round(now() - start);
      view.choosing(false);
      abandon?.answered();
      if (chosen === right) {
        answeredRight = true;
        stopPass();
        stopKeys();
        right.classList.add('chosen');
        sparkle(right, view.root);
        view.cheer();
        view.sayNext([...reward, ...(revealed ? ['v.error.later'] : misses === 0 && praise ? view.praise(praise, praiseLines) : [])]);
        resolve({ correct: misses === 0, helped: revealed, ms });
        return;
      }
      misses++;
      bounce(chosen);
      if (misses < 2) {
        target?.classList.add('glow');
        await view.say(['v.error.listen', ...hint], 1300, hintGap);
        target?.classList.remove('glow');
      } else {
        revealed = true;
        right.classList.add('glow');
        for (const c of choices) if (c.el !== right) c.el.classList.add('dim');
        await view.say(['v.error.tricky', 'v.error.reveal'], 900);
      }
      view.choosing(true);
    });
    for (const c of choices) c.el.addEventListener('click', (event) => { if (!notYet(c.el) && !secondClick(event)) pick(c.value); });
    herTurn(choices);
    if (keyboard) stopKeys = typeToPick(choices.map(c => c.value), pick, view.root);
    stopPass = offerPass(view, () => {
      if (answeredRight || abandon?.aborted) return;
      passed = true;
      abandon?.answered();
      stopKeys();
      view.choosing(false);
      resolve({ pass: true });
    });
    abandon?.onAbort(() => { stopKeys(); stopPass(); });
    view.choosing(true);
  });
}

const PASS_LINE = 'pass.how';

async function sayCheckLine(view, kind) {
  const { ctx } = view;
  const line = `v.selfcheck.${kind}`;
  const how = Boolean(ctx) && ctx.settings?.tipsSeen?.[PASS_LINE] !== true;
  const said = await view.prompt([...view.current(), line], { play: [line, ...(how ? ['v.pass.how'] : [])] });
  if (how && said) ctx.settings = { ...ctx.settings, tipsSeen: markTipSeen(ctx.settings?.tipsSeen, PASS_LINE) };
}

function selfCheck(buttons) {
  return h('div', { class: 'selfcheck', role: 'group', 'aria-label': 'Check yourself' },
    buttons.map(([label, icon, onClick]) => {
      const button = bigButton({ label, ...(typeof icon === 'string' ? { icon } : icon), onClick });
      if (label === 'Pass') button.classList.add('pass');
      return button;
    }));
}

export function judgeAloud(view, { copilot, kind, model, target, praise, praiseLines, canUndo = false, tips = [], firstHelp }) {
  return new Promise((resolve) => {
    if (!view.live()) return;
    const start = now();
    let ms = null;
    let misses = 0;
    let helped = false;
    const taps = [];
    let reach = canUndo;
    let panel;
    const showUndo = () => { if (copilot) setUndo(panel, taps.length > 0 || reach); };
    const finish = (answer) => { panel.remove(); view.choosing(false); resolve({ ...answer, selfChecked: !copilot }); };
    let helpTips = false;
    const offerHelpTips = () => {
      if (!copilot || helpTips) return;
      helpTips = true;
      offerTips(view.ctx, panel, HELP_TIPS);
    };
    const yes = (event) => {
      if (secondClick(event)) return;
      view.lock.run(async () => {
        ms ??= Math.round(now() - start);
        sparkle(target, view.root);
        view.cheer();
        view.sayNext(misses === 0 && !helped && praise ? view.praise(praise, praiseLines) : []);
        finish({ correct: misses === 0, helped, ms });
      });
    };
    const again = () => view.lock.run(async () => {
      taps.push(ms);
      ms ??= Math.round(now() - start);
      misses++;
      offerHelpTips();
      view.choosing(false);
      target.classList.add('glow');
      if (misses < 2) {
        await view.say(kind === 'read' ? ['v.error.again'] : ['v.error.listen', ...model], 1300);
        target.classList.remove('glow');
        showUndo();
        view.choosing(true);
        return;
      }
      panel.hidden = true;
      await view.say(['v.error.tricky', ...model, 'v.error.later'], 1500);
      target.classList.remove('glow');
      finish({ correct: false, helped: true, ms });
    });
    let softHelp = firstHelp;
    const help = () => view.lock.run(async () => {
      if (softHelp) {
        const show = softHelp;
        softHelp = undefined;
        offerHelpTips();
        await show();
        return;
      }
      helped = true;
      reach = false;
      showUndo();
      offerHelpTips();
      await view.say(model, 600);
    });
    const undo = () => view.lock.run(async () => {
      if (taps.length > 0) {
        ms = (taps.pop());
        misses--;
        showUndo();
        return;
      }
      if (!reach) return;
      panel.remove();
      view.choosing(false);
      resolve({ undo: true });
    });
    const pass = (event) => {
      if (secondClick(event)) return;
      view.lock.run(async () => {
        panel.remove();
        view.choosing(false);
        resolve({ pass: true });
      });
    };
    if (copilot) {
      panel = copilotBanner({ onYes: yes, onAgain: again, onHelp: help, onUndo: undo, onPass: pass, kind, hero: heroOf(view.ctx?.profile) });
      showUndo();
    } else {
      const passing = ['Pass', { glyph: '→' }, pass];
      panel = kind === 'read'
        ? selfCheck([['I read it!', 'ui/sparkle', yes], ['Let me hear it', 'ui/speaker', help], passing])
        : selfCheck([['I said it!', 'ui/sparkle', yes], ['Let me try again', { glyph: '↻' }, again], passing]);
    }
    view.root.append(panel);
    if (copilot) offerTips(view.ctx, panel, [...TURN_TIPS[kind], ...tips]);
    view.choosing(true);
    if (!copilot) sayCheckLine(view, kind);
  });
}

export const SETTLE_MS = 300;

export function holdForUndo(view) {
  return new Promise((resolve) => {
    if (!view.live()) return;
    view.play([]);
    const end = (undo) => view.lock.run(async () => {
      banner.remove();
      resolve(undo);
      if (!undo) return;
      view.root.classList.add('settling');
      await wait(SETTLE_MS);
      view.root.classList.remove('settling');
    });
    const banner = copilotHold({ onGo: () => end(false), onUndo: () => end(true) });
    view.root.append(banner);
  });
}


export function undoAside(view) {
  const stops = [];
  let gone = false;
  let done = () => {};
  const undone = (new Promise((resolve) => { done = resolve; }));
  const remove = () => { gone = true; aside.remove(); };
  const abandon = {
    aborted: false,
    onAbort(fn) { if (abandon.aborted) fn(); else stops.push(fn); },
    answered: remove,
  };
  const aside = copilotUndoAside({ onUndo: () => view.lock.run(async () => {
    if (gone || abandon.aborted) return;
    abandon.aborted = true;
    remove();
    for (const fn of stops.splice(0)) fn();
    if (view.live()) view.ctx.audio?.stop?.();
    view.choosing(false);
    done({ undo: true });
  }) });
  view.root.append(aside);
  return { abandon, undone, remove };
}

const MAX_EASED = 2;


export async function runRound(view, round, hooks, { play, easy, undo = false, judged = () => true }) {
  let queue = [...(round?.items ?? [])];
  let used = new Set(queue.map(i => i.id));
  let broughtBack = new Set();
  let right = [];
  let eased = 0;
  let breaking = false;
  let back = null;
  const goBack = () => {
    const to = (back);
    for (let n = 0; n < to.records; n++) hooks.undo?.();
    ({ queue, used, broughtBack, right, eased, breaking } = to);
    back = null;
    return to.i;
  };
  const plain = ({ correct, helped, ms }) => ({ correct, helped, ms });
  const answer = async (item, canUndo, aside) => {
    let result;
    if (aside) {
      const playing = play(item, { canUndo, abandon: aside.abandon });
      playing.catch(() => {});
      result = await Promise.race([playing, aside.undone]);
      aside.remove();
    } else {
      result = await play(item, { canUndo });
    }
    if (result && !('undo' in result) && !('pass' in result)) {
      if (!result.kept) hooks.record(item.id, item.mode, plain(result), ...(result.selfChecked ? [{ scored: false }] : []));
      for (const { mode, answer: other } of result.also ?? []) hooks.record(item.id, mode, plain(other), { monitor: false, ...(other.selfChecked ? { scored: false } : {}) });
      for (const mode of result.passed ?? []) hooks.pass?.(item.id, mode);
      if (result.correct && !result.helped) right.push(item);
      await result.after;
    }
    return result;
  };
  const recorded = (result) => 1 + (result.also ?? []).filter(a => !a.answer.selfChecked).length;
  const easyItem = (missed) => {
    const known = easy(used);
    if (known) return known;
    const earlier = right.findLast(it => it.id !== missed.id);
    return earlier ? { id: earlier.id, mode: earlier.mode, isNew: false, isReview: false } : null;
  };
  for (let i = 0; ; i++) {
    if (!view.live()) return breaking ? 'break' : 'done';
    if (queue.length > 0) hooks.progress?.(Math.min(1, i / queue.length));
    if (i >= queue.length) {
      if (back && await holdForUndo(view)) {
        i = goBack() - 1;
        continue;
      }
      break;
    }
    const item = queue[i];
    const before = undo && typeof hooks.undo === 'function'
      ? { i, queue: [...queue], used: new Set(used), broughtBack: new Set(broughtBack), right: [...right], eased, breaking } : null;
    const aside = back && !judged(item) ? undoAside(view) : null;
    const result = await answer(item, back !== null && !aside, aside);
    if (result && 'undo' in result) {
      i = back ? goBack() - 1 : i - 1;
      continue;
    }
    if (result && 'pass' in result) {
      hooks.pass?.(item.id, item.mode);
      back = null;
      queue = queue.filter((q, at) => at <= i || q.id !== item.id || q.mode !== item.mode);
      continue;
    }
    back = before && result?.selfChecked === false ? { ...before, records: recorded(result) } : null;
    if (breaking || !result || result.correct) continue;
    const key = `${item.id}#${item.mode}`;
    if (result.helped && !broughtBack.has(key)) {
      broughtBack.add(key);
      queue.splice(Math.min(queue.length, i + 3), 0, item);
    }
    const signal = hooks.monitor?.signal?.() ?? 'ok';
    if (signal === 'break') {
      const next = easyItem(item);
      queue = [...queue.slice(0, i + 1), ...(next ? [next] : [])];
      breaking = true;
      continue;
    }
    if (signal === 'ease' && eased < MAX_EASED) {
      const next = easyItem(item);
      if (next) { eased++; used.add(next.id); queue.splice(i + 1, 0, next); }
    }
  }
  return breaking ? 'break' : 'done';
}


const deckCard = (ctx, g) => ctx.profile.deck.find(( c) => c.g === g) ?? { g, status: 'learning', keyword: '' };

async function seeCard(view, g, { copilot, first, canUndo = false }) {
  const { ctx } = view;
  const model = cardRoutineClips(deckCard(ctx, g), ctx.settings);
  let checked = () => {};
  const clicked = new Promise((resolve) => { checked = resolve; });
  let hearing = false;
  let stopPass = () => {};
  const card = h('button', { type: 'button', class: 'sound-card', 'aria-label': 'Hear this card',
    onClick: ( event) => {
      if (secondClick(event)) return;
      const at = now();
      view.lock.run(async () => {
        hearing = true;
        stopPass();
        view.choosing(false);
        card.classList.add('checked');
        await view.say(model, 600);
        checked(at);
        view.choosing(true);
      });
    } }, h('span', { class: 'sound-card-label' }, g));
  view.show(card);
  await view.prompt(['v.cards.see'], { play: first ? ['v.cards.see'] : [] });
  view.play([]);
  const start = now();
  view.choosing(true);
  if (!hearing) stopPass = offerPass(view, () => { view.choosing(false); checked(null); });
  const at = (await clicked);
  if (at === null) return { pass: true };
  const judged = await judgeAloud(view, { copilot, kind: 'said', model, target: card, praise: 'sound', praiseLines: soundPraiseLines('say'), canUndo });
  if ('undo' in judged) return judged;
  return { ...judged, ms: Math.round(Math.max(0, at - start)) };
}

async function hearCard(view, g, { first, abandon }) {
  const { ctx } = view;
  const sound = cardSoundClips(g);
  const labels = ctx.rng.shuffle([g, ...cardDistractors(g, ctx.profile.deck, ctx.settings, ctx.rng)]);
  const choices = untilHerTurn(labels.map(( label) => ({ value: label, el: tile({ label, onPick: () => {}, size: 130 }) })));
  const disc = listenDisc(view, sound);
  view.show(disc, h('div', { class: 'choice-row' }, choices.map(c => c.el)));
  await view.prompt(['v.cards.hear', ...sound], { play: first ? ['v.cards.hear', ...sound] : sound });
  return chooseOne(view, { choices, answer: g, hint: sound, reward: sound, praise: 'sound', praiseLines: soundPraiseLines('pick'), keyboard: true, target: disc, abandon });
}

async function listenPair(view, kind, a, b, { first, abandon }) {
  const { ctx } = view;
  const target = ctx.rng.pick([a, b]);
  const clip = `w.${target}`;
  const choices = untilHerTurn(ctx.rng.shuffle([a, b]).map(( label) => ({ value: label, el: tile({ label, onPick: () => {}, size: 120 }) })));
  const disc = listenDisc(view, [clip]);
  view.show(disc, h('div', { class: 'choice-row words' }, choices.map(c => c.el)));
  await view.prompt(['v.cards.listen', clip], { play: first ? ['v.cards.listen', clip] : [clip] });
  return chooseOne(view, { choices, answer: target, hint: [clip], reward: [clip], praise: 'sound', praiseLines: soundPraiseLines('pair', kind), keyboard: true, target: disc, abandon });
}

async function readWord(view, item, word, { copilot, modeled, made, canUndo = false }) {
  const card = h('div', { class: 'word-card', lang: 'en' }, word);
  view.show(card);
  const model = (item.isNew || item.model) && !modeled.has(item.id) ? [`ws.${word}`, `w.${word}`] : [];
  modeled.add(item.id);
  const spoken = [...(made ? ['v.entrance.nonsense'] : []), ...model];
  await view.prompt([...spoken, copilot ? 'v.copilot.readto' : null]);
  if (!copilot && spoken.length > 0) await wait(CLIP_GAP_MS);
  const th = item.id.startsWith('n:') && view.ctx.content?.byWord?.get(word)?.segs.some(( [g]) => g === 'th');
  const segs = view.ctx.content?.byWord?.get(word)?.segs;
  const parts = Array.isArray(segs) ? splitWord(segs, (w) => view.ctx.content.byWord.has(w)) : null;
  const firstHelp = parts ? async () => {
    card.replaceChildren(h('span', { class: 'syl' }, parts[0]), h('span', { class: 'syl' }, parts[1]));
    card.classList.add('split');
    await view.say(['v.cards.split'], 600);
  } : undefined;
  return judgeAloud(view, { copilot, kind: 'read', model: [`w.${word}`], target: card, praise: 'read', canUndo, tips: th ? TH_TIPS : [], firstHelp });
}

async function readLine(view, id, text, { copilot, canUndo = false }) {
  const card = h('div', { class: 'word-card line-card', lang: 'en' }, text);
  view.show(card);
  await view.prompt(['v.story.read']);
  return judgeAloud(view, { copilot, kind: 'read', model: [`s.${id}`], target: card, canUndo });
}

async function askPicture(view, { question: q }, { abandon }) {
  const choices = untilHerTurn(q.choices.map((id) => ({ value: id, el: h('button', { type: 'button', class: 'pic-choice', 'aria-label': id.split('/').pop() },
    h('img', { src: artUrl(id), alt: '', draggable: 'false' })) })));
  view.show(h('div', { class: 'choice-row pictures' }, choices.map(c => c.el)));
  await view.prompt([`v.${q.line}`]);
  const answer = await chooseOne(view, { choices, answer: q.answer, hint: [`v.${q.line}`], reward: [], abandon });
  return 'pass' in answer ? answer : { ...answer, selfChecked: true };
}

const PAIR_ID = /^pr:([a-z]+):([^/]+)\/(.+)$/;

function playCard(view, item, options) {
  if (item.id.startsWith('g:') && item.mode === 'see') return seeCard(view, item.id.slice(2), options);
  if (item.id.startsWith('g:') && item.mode === 'hear') return hearCard(view, item.id.slice(2), options);
  const pair = PAIR_ID.exec(item.id);
  if (pair && item.mode === 'listen') return listenPair(view, pair[1], pair[2], pair[3], options);
  if ((item.id.startsWith('w:') || item.id.startsWith('n:')) && item.mode === 'read') return readWord(view, item, item.id.slice(2), options);
  const line = item.id.startsWith('s:') && item.mode === 'read' ? options.lines.get(item.id.slice(2)) : undefined;
  if (line) return readLine(view, line.id, line.text, options);
  const scene = item.id.startsWith('q:') && item.mode === 'pick' ? options.scenes.get(item.id.slice(2)) : undefined;
  if (scene?.question) return askPicture(view, scene, options);
  console.warn(`The cards round cannot show ${item.id} in mode ${item.mode}; skipping it.`);
  return Promise.resolve(null);
}

function easyCard(ctx, used) {
  const mastered = ctx.profile.deck.filter(( c) => c.status === 'mastered');
  const fresh = mastered.filter(( c) => !used.has(`g:${c.g}`));
  const card = ctx.rng.pick(fresh.length > 0 ? fresh : mastered);
  return card ? { id: `g:${card.g}`, mode: 'hear', isNew: false, isReview: false } : null;
}

export async function run(el, ctx, round, hooks) {
  const view = createActivityView(el, ctx, { name: 'cards' });
  const copilot = hooks.copilot ?? ctx.settings.copilot;
  const instructed = new Set();
  const modeled = new Set();
  let madeUp = false;
  const scenes = new Map((ctx.content?.story ?? []).flatMap(( ch) => [...ch.scenes, ...ch.side]).map(( scene) => [scene.id, scene]));
  const lines = new Map([...scenes.values()].flatMap((scene) => scene.sentences).map(( s) => [s.id, s]));
  try {
    if (!hooks.review) await view.prompt(['v.cards.start']);
    await runRound(view, round, hooks, {
      play: (item, { canUndo, abandon }) => {
        const first = !instructed.has(item.mode);
        instructed.add(item.mode);
        if (first) abandon?.onAbort(() => instructed.delete(item.mode));
        const made = item.id.startsWith('n:') && !madeUp;
        if (made) madeUp = true;
        return playCard(view, item, { copilot, first, modeled, made, canUndo, abandon, lines, scenes });
      },
      easy: (used) => easyCard(ctx, used),
      undo: true,
      judged: (item) => item.mode === 'read' || (item.mode === 'see' && item.id.startsWith('g:')),
    });
    if (view.live()) hooks.answersIn?.();
    await view.sayKept();
  } finally {
    view.destroy();
  }
}

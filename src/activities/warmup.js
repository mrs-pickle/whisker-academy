import { h } from '../core/dom.js';
import { phonemeCodes } from '../curriculum/phonemes.js';
import { artUrl, bigButton, pawButton, tile } from '../ui/components.js';
import { BLEND_PRAISE, STRETCH_GAP_MS, cardSoundClips, chooseOne, countPraiseLines, createActivityView, judgeAloud, listenDisc, now, runRound, secondClick, soundPraiseLines, untilHerTurn, wait } from './cards.js';


const PAW_LIGHT_MS = 450;


const codesOf = (segs) => segs.flatMap(([, p]) => phonemeCodes(p));

const positionIndex = (position, n) => (position === 'last' ? n - 1 : position === 'middle' ? Math.floor((n - 1) / 2) : 0);

const fromPosition = (position, n) => {
  const at = positionIndex(position, n);
  return [...Array(n).keys()].sort((a, b) => Math.abs(a - at) - Math.abs(b - at) || a - b);
};

const sameList = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export function isolatedSound(item) {
  return item.sounds[positionIndex(item.position, item.sounds.length)];
}

export function deletionClips(item, byWord) {
  const { word, answer, sounds, position } = item;
  const rec = byWord.get(answer);
  if (rec) {
    const left = codesOf(rec.segs);
    if (left.length === sounds.length - 1) {
      const gone = fromPosition(position, sounds.length).find(i => sameList([...sounds.slice(0, i), ...sounds.slice(i + 1)], left));
      if (gone !== undefined) return [`p.${sounds[gone]}`];
    }
  }
  let part = null;
  if (position !== 'last' && word.length > answer.length && word.endsWith(answer)) part = word.slice(0, word.length - answer.length);
  else if (position !== 'first' && word.length > answer.length && word.startsWith(answer)) part = word.slice(answer.length);
  if (part !== null && /[aeiouy]/.test(part)) return [`w.${part}`];
  return [`p.${sounds[positionIndex(position, sounds.length)]}`];
}

export function substitutionClips(item, byWord) {
  const { sounds, answer, position } = item;
  const rec = byWord.get(answer);
  if (rec) {
    const next = codesOf(rec.segs);
    const changed = next.length === sounds.length ? sounds.flatMap((s, i) => (s === next[i] ? [] : [i])) : [];
    if (changed.length === 1) return [`p.${sounds[changed[0]]}`, `p.${next[changed[0]]}`];
  }
  const letter = answer[positionIndex(position, answer.length)] ?? '';
  return [`p.${sounds[positionIndex(position, sounds.length)]}`, ...cardSoundClips(letter).slice(0, 1)];
}


function wordPicture(ctx, word) {
  if (!ctx.content.byWord?.get(word)?.pic) return null;
  const img = h('img', { class: 'warmup-picture', src: artUrl(`tricks/${word}`), alt: '', draggable: 'false' });
  img.addEventListener('error', () => img.remove(), { once: true });
  return img;
}

const pictureChoice = (id) => h('button', { type: 'button', class: 'pic-choice', 'aria-label': id.split('/').pop() },
  h('img', { src: artUrl(id), alt: '', draggable: 'false' }));

const pawPrint = () => h('img', { class: 'paw-print', src: artUrl('ui/paw'), alt: '', draggable: 'false' });

async function blend(view, pa, first) {
  const sounds = pa.sounds.map(s => `p.${s}`);
  const choices = untilHerTurn((pa.choices ?? []).map(id => ({ value: id, el: pictureChoice(id) })));
  const disc = listenDisc(view, sounds, STRETCH_GAP_MS);
  view.show(disc, h('div', { class: 'choice-row pictures' }, choices.map(c => c.el)));
  await view.prompt(['v.warmup.blend', ...sounds], { play: first ? ['v.warmup.blend'] : [], gap: STRETCH_GAP_MS });
  await view.play(sounds, STRETCH_GAP_MS);
  return chooseOne(view, { choices, answer: pa.answer, hint: sounds, hintGap: STRETCH_GAP_MS, target: disc, reward: [`w.${pa.word}`], praise: 'blend', praiseLines: BLEND_PRAISE });
}

async function isolate(view, pa) {
  const sound = `p.${isolatedSound(pa)}`;
  const choices = untilHerTurn((pa.choices ?? []).map(label => ({ value: label, el: tile({ label, onPick: () => {}, size: 130 }) })));
  const target = wordPicture(view.ctx, pa.word) ?? listenDisc(view, [`w.${pa.word}`]);
  view.show(target, h('div', { class: 'choice-row' }, choices.map(c => c.el)));
  await view.prompt([`v.warmup.isolate.${pa.position ?? 'first'}`, `w.${pa.word}`]);
  return chooseOne(view, { choices, answer: pa.answer, hint: [sound], reward: [sound], praise: 'sound', praiseLines: soundPraiseLines('isolate', pa.position), keyboard: true, target });
}

async function segment(view, pa, first) {
  const { ctx } = view;
  const total = pa.sounds.length;
  const row = h('div', { class: 'paw-row' });
  let taps = 0;
  let accepting = false;
  let settle = null;
  const done = bigButton({ label: '✓', onClick: () => { if (accepting && taps > 0) settle?.(); } });
  done.classList.add('done-button', 'waiting');
  done.setAttribute('aria-label', 'Done');
  const paw = pawButton({ onTap: () => {
    if (!accepting) return;
    taps++;
    row.append(pawPrint());
    done.classList.remove('waiting');
  } });
  paw.disabled = true;
  view.show(wordPicture(ctx, pa.word), row, h('div', { class: 'paw-controls' }, paw, done));
  const word = `w.${pa.word}`;
  await view.prompt(['v.warmup.segment', word], { play: first ? ['v.warmup.segment', word] : [word] });

  const start = now();
  let ms = null;
  let misses = 0;
  for (;;) {
    const count = await new Promise((resolve) => {
      taps = 0;
      row.replaceChildren();
      done.classList.add('waiting');
      paw.disabled = false;
      accepting = true;
      view.choosing(true);
      settle = () => {
        accepting = false;
        settle = null;
        paw.disabled = true;
        done.classList.add('waiting');
        view.choosing(false);
        resolve(taps);
      };
    });
    ms ??= Math.round(now() - start);
    const right = count === total;
    if (!right) misses++;
    await view.lock.run(async () => {
      await view.say(right ? (first && misses === 0 ? ['v.warmup.segment.listen'] : []) : ['v.error.count'], 300);
      await lightPaws(view, row, pa.sounds);
      if (right) {
        view.cheer();
        await view.say(misses === 0 ? view.praise('count', countPraiseLines(false)) : [], 300);
      } else if (misses >= 2) {
        await view.say(['v.error.later'], 300);
      }
    });
    if (right) return { correct: misses === 0, helped: false, ms };
    if (misses >= 2) return { correct: false, helped: true, ms };
  }
}

async function lightPaws(view, row, sounds) {
  const prints = sounds.map(() => pawPrint());
  row.replaceChildren(...prints);
  for (let i = 0; i < sounds.length; i++) {
    prints[i].classList.add('lit');
    await Promise.all([view.play([`p.${sounds[i]}`]), wait(PAW_LIGHT_MS)]);
  }
  await wait(300);
}

async function sayAloud(view, pa, { copilot, first }) {
  const { ctx } = view;
  const word = `w.${pa.word}`;
  const answer = `w.${pa.answer}`;
  const byWord = ctx.content.byWord ?? new Map();
  let ask;
  if (pa.type === 'delete') {
    ask = [word, 'v.warmup.without', ...deletionClips(pa, byWord)];
  } else {
    const [from, to] = substitutionClips(pa, byWord);
    ask = [word, from, 'v.warmup.changeto', to];
  }
  const intro = pa.type === 'delete' ? 'v.warmup.delete' : 'v.warmup.substitute';

  let heard = () => {};
  const clicked = new Promise((resolve) => { heard = resolve; });
  const hear = bigButton({ label: 'Hear it', icon: 'ui/speaker', onClick: (event) => {
    if (secondClick(event)) return;
    const at = now();
    view.lock.run(async () => {
      view.choosing(false);
      await view.say([answer], 500);
      heard(at);
      view.choosing(true);
    });
  } });
  hear.classList.add('hear-button');
  view.show(wordPicture(ctx, pa.word), hear);
  const full = [intro, ...ask, 'v.warmup.hear'];
  await view.prompt(full, { play: first ? full : ask });
  const start = now();
  view.choosing(true);
  const at = (await clicked);
  const judged = await judgeAloud(view, { copilot, kind: 'said', model: [answer], target: hear });
  return { ...judged, ms: Math.round(Math.max(0, at - start)) };
}

function playWarmup(view, pa, options) {
  switch (pa.type) {
    case 'blend': return blend(view, pa, options.first);
    case 'isolate': return isolate(view, pa);
    case 'segment': return segment(view, pa, options.first);
    case 'delete':
    case 'substitute': return sayAloud(view, pa, options);
    default:
      console.warn(`The warm-up cannot show a "${pa.type}" item (${pa.id}); skipping it.`);
      return Promise.resolve(null);
  }
}

function easyWarmup(ctx, used) {
  const easy = ctx.content.warmup.filter(( it) =>
    it.type === 'blend' && it.minLesson <= ctx.settings.taughtUpTo && it.sounds.length <= 3);
  const fresh = easy.filter(( it) => !used.has(`pa:${it.id}`));
  const it = ctx.rng.pick(fresh.length > 0 ? fresh : easy);
  return it ? { id: `pa:${it.id}`, mode: 'pa', isNew: false, isReview: false } : null;
}

export async function run(el, ctx, round, hooks) {
  const view = createActivityView(el, ctx, { name: 'warmup' });
  const copilot = hooks.copilot ?? ctx.settings.copilot;
  const items = new Map(ctx.content.warmup.map(( it) => [`pa:${it.id}`, it]));
  const instructed = new Set();
  try {
    await view.prompt(['v.warmup.start']);
    await runRound(view, round, hooks, {
      play: (item) => {
        const pa = items.get(item.id);
        if (!pa || item.mode !== 'pa') {
          console.warn(`The warm-up has no item ${item.id} in mode ${item.mode}; skipping it.`);
          return Promise.resolve(null);
        }
        const first = !instructed.has(pa.type);
        instructed.add(pa.type);
        return playWarmup(view, pa, { copilot, first });
      },
      easy: (used) => easyWarmup(ctx, used),
    });
    await view.sayKept();
  } finally {
    view.destroy();
  }
}

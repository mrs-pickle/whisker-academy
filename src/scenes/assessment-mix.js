import { h } from '../core/dom.js';
import { cardSoundClips, holdForUndo, listenDisc, now, showNext, undoAside, wait } from '../activities/cards.js';
import { phraseClips } from '../activities/spell.js';
import { isReadAloud, nextMixItem } from '../engine/placement-mix.js';
import { copilotBanner, setUndo, tile } from '../ui/components.js';
import { HELP_TIPS, offerTips, TURN_TIPS } from '../ui/tips.js';
import { heroOf, heroWords } from '../profile/hero.js';


export const MIX_VOICE = Object.freeze({
  read: 'v.copilot.readto',
  nonsense: 'v.entrance.nonsense',
  phrase: 'v.story.read',
  hear: 'v.cards.listen',
  sound: 'v.cards.hear',
});

const ADVANCE_MS = 300;
const WORD_TILE = 120;
const SOUND_TILE = 130;

export const soundClips = (item) => cardSoundClips( (item.g));

export async function askMix(view, plan, { open, helpText }) {
  const answers = [];
  if (!view.live()) return answers;
  const introduced = new Set();
  let answer = null;
  let current = null;
  let helpTips = false;
  let turnTips = false;
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
    if (helped && current.word) await view.say(current.type === 'phrase' ? phraseClips(current.word) : [`w.${current.word.w}`], 600);
    give({ correct, helped });
  });
  const undo = () => view.lock.run(async () => {
    const give = answer;
    if (!give || !lastWasMark()) return;
    waiting();
    give({ undo: true });
  });
  const hx = heroWords(view.ctx);
  const banner = copilotBanner({ onYes: () => mark(true, false), onAgain: () => mark(false, false), onHelp: () => mark(false, true), onUndo: undo, helpText: hx(helpText), hero: heroOf(view.ctx?.profile) });
  banner.classList.add('waiting');
  banner.hidden = true;
  const lastWasMark = () => answers.length > 0 && isReadAloud( (answers.at(-1)).item);

  const readAloud = async (item) => {
    view.show(h('div', { class: ['entrance-line', 'assess-item', item.type === 'phrase' && 'assess-phrase'], lang: 'en', 'data-kind': item.type, 'data-lesson': String(item.lesson) },
      h('span', { class: 'entrance-word current' }, item.text)));
    if (!banner.isConnected) view.root.append(banner);
    banner.hidden = false;
    setUndo(banner, lastWasMark());
    if (!turnTips) {
      turnTips = true;
      offerTips(view.ctx, banner, TURN_TIPS.read);
    }
    if (!introduced.has(item.type)) {
      introduced.add(item.type);
      await view.prompt([MIX_VOICE[item.type]]);
    } else await view.prompt([MIX_VOICE[item.type]], { play: [] });
    current = item;
    const start = now();
    const got = await new Promise((resolve) => { answer = resolve; banner.classList.remove('waiting'); view.choosing(true); });
    await wait(ADVANCE_MS);
    return 'undo' in got ? got : { ...got, ms: Math.round(now() - start) };
  };

  const pick = async (item) => {
    banner.hidden = true;
    const clips = item.type === 'hear' ? [`w.${ (item.word).w}`] : soundClips(item);
    const aside = lastWasMark() ? undoAside(view) : null;
    let picked = null;
    let next = null;
    let onPick = () => {};
    const tiles = (item.choices ?? []).map((label) => tile({ label, size: item.type === 'hear' ? WORD_TILE : SOUND_TILE, onPick: (l) => onPick(l) }));
    view.show(listenDisc(view, clips), h('div', { class: ['choice-row', 'assess-pick', item.type === 'hear' && 'words'], 'data-kind': item.type, 'data-lesson': String(item.lesson) }, tiles));
    const first = !introduced.has(item.type);
    introduced.add(item.type);
    await view.prompt([MIX_VOICE[item.type], ...clips], { play: first ? [MIX_VOICE[item.type], ...clips] : clips });
    const start = now();
    let ms = null;
    const chosen = new Promise((resolve) => {
      aside?.undone.then(resolve);
      onPick = (label) => view.lock.run(async () => {
        if (aside?.abandon.aborted) return;
        aside?.abandon.answered();
        ms ??= Math.round(now() - start);
        picked = label;
        for (const t of tiles) t.classList.toggle('chosen', t.getAttribute('data-label') === label);
        if (!next) {
          next = showNext(view);
          next.pressed.then(() => resolve('mine'));
        }
      });
      view.choosing(true);
    });
    const got = await chosen;
    view.choosing(false);
    if (got !== 'mine') return got;
    return { correct: picked === item.text, picked: (picked), ms: ms ?? 0 };
  };

  while (view.live()) {
    const item = open() ? nextMixItem(plan, answers) : null;
    if (!item) {
      if (lastWasMark()) {
        banner.hidden = true;
        const again = await holdForUndo(view);
        if (again && view.live()) {
          answers.pop();
          continue;
        }
      }
      break;
    }
    const got = isReadAloud(item) ? await readAloud(item) : await pick(item);
    if ('undo' in got) {
      answers.pop();
      continue;
    }
    answers.push({ item, ...got });
  }
  banner.remove();
  return answers;
}

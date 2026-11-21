import { h } from '../core/dom.js';
import { phonemeCodes } from '../curriculum/phonemes.js';
import { bigButton } from '../ui/components.js';
import { writingPad } from './pencil.js';


export const WRITE_IT_MAX = 2;
const AFTER_WORD_MS = 500;

export function writeItBudget(settings, max = WRITE_IT_MAX) {
  let used = 0;
  return () => {
    if (settings?.writeIt === false || used >= max) return false;
    used++;
    return true;
  };
}

export function wordToWrite(item, bank) {
  if (!item.id.startsWith('w:') || (item.mode !== 'read' && item.mode !== 'spell')) return null;
  const w = item.id.slice(2);
  const rec = bank?.get(w);
  if (!rec || !Array.isArray(rec.segs) || !/^[a-z]+$/.test(w)) return null;
  return { w, segs: rec.segs };
}

const soundOf = ([, p]) => phonemeCodes(p).map((code) => `p.${code}`);

export async function writeIt(view, word) {
  let finish = () => {};
  const over = new Promise((resolve) => { finish = resolve; });
  const notNow = h('button', { type: 'button', class: 'break-skip write-it-skip', onClick: () => finish('skipped') }, 'Not now');
  view.root.append(notNow);
  try {
    const step = ( p) => Promise.race([p, over]);
    const tapped = await step(tapSounds(view, word));
    if (tapped !== true || !view.live()) return 'skipped';
    const writing = await step(writeWord(view, word));
    if (!writing || writing === 'skipped' || !view.live()) return 'skipped';
    const checked = await step(flip(view, word, (writing)));
    return checked === 'skipped' ? 'skipped' : 'done';
  } finally {
    notNow.remove();
    finish('skipped');
  }
}

function tapSounds(view, word) {
  return new Promise((resolve) => {
    const voiced = word.segs.map((seg) => soundOf(seg).length > 0);
    let next = voiced.indexOf(true);
    const boxes = word.segs.map((seg, i) => h('button', { type: 'button', class: ['write-it-sound', voiced[i] ? null : 'silent'], 'data-index': String(i),
      onClick: () => view.lock.run(async () => {
        if (i !== next) return;
        boxes[i].classList.add('tapped');
        boxes[i].classList.remove('next');
        next = voiced.indexOf(true, i + 1);
        if (next >= 0) boxes[next].classList.add('next');
        await view.play(soundOf(seg));
        if (next < 0) {
          for (const [j, b] of boxes.entries()) if (!voiced[j]) b.classList.add('tapped');
          await view.play([`w.${word.w}`]);
          await new Promise((r) => setTimeout(r, AFTER_WORD_MS));
          resolve(true);
        }
      }) }, seg[0]));
    if (next >= 0) boxes[next].classList.add('next');
    view.show(h('div', { class: 'write-it' }, h('div', { class: 'write-it-word', lang: 'en' }, boxes)));
    view.prompt(['v.writeit.start', `w.${word.w}`]);
    if (next < 0) resolve(true);
  });
}

function writeWord(view, word) {
  return new Promise((resolve) => {
    const pad = writingPad(null);
    const done = bigButton({ label: 'Done', glyph: '✓', onClick: () => resolve({ pad: pad.el }) });
    const paper = bigButton({ label: 'I wrote it on paper', glyph: '✎', onClick: () => resolve({ pad: null }) });
    view.show(h('div', { class: 'write-it' }, pad.el, h('div', { class: 'write-it-row' }, done, paper)));
    view.prompt(['v.writeit.write', `w.${word.w}`]);
  });
}

function flip(view, word, { pad }) {
  return new Promise((resolve) => {
    const model = h('div', { class: 'write-it-model write-it-flip', lang: 'en' }, word.w);
    const mine = pad ? h('div', { class: 'write-it-mine' }, pad) : null;
    pad?.querySelector('.pencil-clear')?.remove();
    const same = bigButton({ label: 'It matches', glyph: '✓', onClick: () => resolve('matches') });
    const fixed = bigButton({ label: 'I fixed it', glyph: '✎', onClick: () => resolve('fixed') });
    view.show(h('div', { class: 'write-it' }, h('div', { class: 'write-it-compare' }, mine, model), h('div', { class: 'write-it-row' }, same, fixed)));
    view.prompt(['v.writeit.flip', `w.${word.w}`]);
  });
}

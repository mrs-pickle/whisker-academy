import { h } from '../core/dom.js';
import { CONFUSION_PAIRS } from '../engine/session-builder.js';
import { bigButton } from '../ui/components.js';
import { createActivityView, judgeAloud, wait } from './cards.js';
import { shownWord } from './charm.js';


export const FLASH_START_MS = 2000;
export const FLASH_DOWN_MS = 100;
export const FLASH_UP_MS = 200;
export const FLASH_MIN_MS = 700;
export const FLASH_MAX_MS = FLASH_START_MS;
export const BLINK_WORDS = 6;
export const BLINK_MIN_ELIGIBLE = 20;
export const BLINK_ACCURACY = 0.9;
export const BLINK_SESSIONS = 5;
export const BLINK_LAST_ANSWERS = 5;
const FADE_MS = 600;
const BETWEEN_MS = 900;

const LOOK_ALIKES = new Set(CONFUSION_PAIRS.flat());

const oneIESwap = (a, b) => {
  if (a.length !== b.length || a === b) return false;
  const at = [...a].flatMap((ch, i) => (ch === b[i] ? [] : [i]));
  return at.length === 1 && new Set([a[at[0]], b[at[0]]]).size === 2 && 'ie'.includes(a[at[0]]) && 'ie'.includes(b[at[0]]);
};

function sShSwaps(w) {
  const out = [];
  for (let i = 0; i < w.length; i++) {
    if (w.startsWith('sh', i)) out.push(w.slice(0, i) + 's' + w.slice(i + 2));
    else if (w[i] === 's') out.push(w.slice(0, i) + 'sh' + w.slice(i + 1));
  }
  return out;
}

export function blinkEligible(content, states) {
  const byWord = content.byWord ?? new Map();
  const solid = ( key) => {
    const s = states.get(key);
    const last = Array.isArray(s?.hist) ? s.hist.slice(-BLINK_LAST_ANSWERS) : [];
    return s?.mastered === true && last.length === BLINK_LAST_ANSWERS && last.every(( r) => r.correct === true && r.helped !== true);
  };
  const words = [
    ...(content.words ?? []).filter(( w) => w.real !== false && solid(`w:${w.w}#read`)).map(( w) => w.w),
    ...(content.instant ?? []).filter(( iw) => solid(`iw:${iw.w}#read`)).map(( iw) => iw.w),
  ];
  const unique = [...new Set(words)].filter(w => !LOOK_ALIKES.has(w) && !sShSwaps(w).some(x => byWord.has(x)));
  return unique.filter(w => !unique.some(other => oneIESwap(w, other)));
}

export function recentAccuracy(profile) {
  const done = (Array.isArray(profile?.sessions) ? profile.sessions : [])
    .filter(( s) => s?.complete === true && typeof s.accuracy === 'number' && Number.isFinite(s.accuracy));
  if (done.length < BLINK_SESSIONS) return null;
  const last = done.slice(-BLINK_SESSIONS);
  return last.reduce((n, s) => n + s.accuracy, 0) / last.length;
}

export function blinkOpen(content, profile, states, settings) {
  if (settings?.flash !== true) return false;
  const accuracy = recentAccuracy(profile);
  return accuracy !== null && accuracy >= BLINK_ACCURACY - 1e-9 && blinkEligible(content, states).length >= BLINK_MIN_ELIGIBLE;
}

export const blinkHooksOk = (hooks) => hooks.copilot === true && hooks.extra !== true && hooks.review !== true;

export const flashMsOf = (ms) => (typeof ms === 'number' && Number.isFinite(ms) ? Math.min(FLASH_MAX_MS, Math.max(FLASH_MIN_MS, Math.round(ms))) : FLASH_START_MS);

export const nextFlashMs = (ms, missed) => flashMsOf(missed ? ms + FLASH_UP_MS : ms - FLASH_DOWN_MS);

export async function runBlink(el, ctx, hooks) {
  if (!blinkOpen(ctx.content, ctx.profile, ctx.states ?? new Map(), ctx.settings)) return;
  const words = ctx.rng.shuffle(blinkEligible(ctx.content, ctx.states ?? new Map())).slice(0, BLINK_WORDS);
  const ms = flashMsOf(ctx.profile?.flashMs);
  const view = createActivityView(el, ctx, { name: 'blink', bg: 'bg/hall' });
  let first = 0;
  let missed = false;
  let peekSaid = false;
  try {
    await view.prompt(['v.blink.start']);
    for (const w of words) {
      if (!view.live()) return;
      const clip = `w.${w}`;
      const card = h('div', { class: 'word-card blink-word', lang: 'en' }, shownWord(w));
      let peeks = 0;
      let answered = false;
      const blink = async () => {
        card.classList.remove('faded');
        await wait(ms);
        if (!answered) card.classList.add('faded');
        await wait(FADE_MS);
      };
      const peek = bigButton({ label: 'Peek again', glyph: '👀', onClick: () => {
        if (answered || view.lock.locked() || !card.classList.contains('faded')) return;
        peeks++;
        blink();
      } });
      peek.classList.add('blink-peek');
      view.show(card, h('div', { class: 'blink-row' }, peek));
      await blink();
      if (!view.live()) return;
      if (!peekSaid) { peekSaid = true; await view.play(['v.blink.peek']); }
      const answer = await judgeAloud(view, { copilot: true, kind: 'read', model: [clip], target: card });
      answered = true;
      peek.remove();
      const right = 'correct' in answer && answer.correct === true && answer.helped !== true;
      if (right && peeks === 0) first++;
      if (!right) missed = true;
      card.classList.remove('faded');
      await view.play([clip]);
      await wait(BETWEEN_MS);
    }
    if (view.live()) hooks.onFlash?.({ day: ctx.day, shown: words.length, first, ms: nextFlashMs(ms, missed) });
  } finally {
    view.destroy();
  }
}

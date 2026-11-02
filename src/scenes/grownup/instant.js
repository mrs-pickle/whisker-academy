import { h } from '../../core/dom.js';
import { heartIndexes } from '../../curriculum/decodable.js';
import { storyNeeds } from '../../engine/story-place.js';
import { heroWords } from '../../profile/hero.js';
import { CUSTOM_WORD, CUSTOM_WORD_MAX } from '../../profile/profile.js';
import { cornerFrame } from './gate.js';


const STATUSES = ([['none', 'Not on her list'], ['learning', 'Learning'], ['known', 'Known']]);
const SHOW = ([['all', 'All words'], ['known', 'Known'], ['learning', 'Learning'], ['none', 'Not on her list']]);

export function filterInstantLibrary(lib, query) {
  const q = String(query ?? '').trim().toLowerCase();
  return q ? lib.filter((iw) => iw.w.toLowerCase().includes(q)) : [...lib];
}

export function setInstantStatus(instant, word, status) {
  const next = { ...instant };
  if (status === 'learning' || status === 'known') next[word] = status;
  else delete next[word];
  return next;
}

const typedWord = (text) => String(text ?? '').trim().toLowerCase();

export function customWordProblem(text, lib, custom, hx = (text) => text) {
  const word = typedWord(text);
  if (word === '' || /\s/.test(word)) return 'Type one word.';
  if (!CUSTOM_WORD.test(word)) return "A word has letters only (an apostrophe is fine, as in can't).";
  if (word.length > CUSTOM_WORD_MAX) return `Keep it to ${CUSTOM_WORD_MAX} letters or fewer.`;
  if (lib.some((iw) => iw.w.toLowerCase() === word)) return `"${word}" is already in the library: search for it above.`;
  if (custom.includes(word)) return `"${word}" ${hx('is already on her list.')}`;
  return null;
}

export function addCustomInstant(profile, text, status) {
  const word = typedWord(text);
  const custom = profile.customInstant ?? [];
  return { ...profile, customInstant: custom.includes(word) ? [...custom] : [...custom, word], instant: setInstantStatus(profile.instant, word, status) };
}

export function removeCustomInstant(profile, word) {
  const { customInstant, ...rest } = profile;
  const kept = (customInstant ?? []).filter((w) => w !== word);
  return { ... (rest), instant: setInstantStatus(profile.instant, word, 'none'), ...(kept.length > 0 ? { customInstant: kept } : {}) };
}

export function heartParts(iw, taughtUpTo) {
  const hearts = new Set(heartIndexes(iw.segs, taughtUpTo));
  return iw.segs.map(([g], i) => ({ g, heart: hearts.has(i) }));
}

const COMMONNESS = Object.freeze({ 1: 'very common word', 2: 'common word', 3: 'less common word' });

const shown = (w) => (w === 'i' ? 'I' : w);

export function storyNote(needs, hx = (text) => text) {
  if (needs.length === 0) return null;
  return `Story time needs these words marked Known: ${needs.map(shown).join(', ')}. ${hx('Until then her story waits.')}`;
}

export function storyNoteBox(ctx) {
  const el = h('p', { class: 'gu-warning gu-story-needs', role: 'status' });
  const draw = () => {
    const note = storyNote(storyNeeds(ctx.content, ctx.profile, ctx.settings), heroWords(ctx));
    el.textContent = note ?? '';
    el.hidden = note === null;
  };
  draw();
  return { el, draw };
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'instant');
  if (!body) return () => {};
  const hx = heroWords(ctx);

  const lib = ctx.content.instant ?? [];
  let show = 'all';
  const status = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });
  const counts = h('p', { class: 'gu-counts' });
  const list = h('div', { class: 'gu-instant-list' });
  const needs = storyNoteBox(ctx);
  const statusOf = (w) => ctx.profile.instant[w] ?? 'none';
  const drawCounts = () => {
    const values = Object.values(ctx.profile.instant);
    counts.textContent = `${hx('On her list:')} ${values.filter((v) => v === 'known').length} known, ${values.filter((v) => v === 'learning').length} learning.`;
  };

  const save = async (done) => {
    try {
      await ctx.save();
      status.textContent = done;
    } catch (err) {
      console.error('The instant word list could not be saved', err);
      status.textContent = "Saving didn't work in this browser window.";
    }
  };

  const row = (iw) => {
    const group = h('div', { class: 'gu-segmented', role: 'group', 'aria-label': shown(iw.w) });
    const draw = () => group.replaceChildren(...STATUSES.map(([value, label]) => h('button', {
      type: 'button', class: 'gu-choice', 'aria-pressed': String(statusOf(iw.w) === value),
      onClick: () => {
        ctx.profile = { ...ctx.profile, instant: setInstantStatus(ctx.profile.instant, iw.w, value) };
        draw();
        drawCounts();
        needs.draw();
        return save(`Saved: ${shown(iw.w)} ${hx(`is ${label.toLowerCase()}.`)}`);
      },
    }, hx(label))));
    draw();
    if ('custom' in iw) {
      const remove = h('button', { type: 'button', class: 'gu-button gu-remove', onClick: () => {
        ctx.profile = removeCustomInstant(ctx.profile, iw.w);
        drawList();
        drawCounts();
        return save(`Saved: ${iw.w} ${hx('is off her list.')}`);
      } }, 'Remove');
      return h('div', { class: 'gu-instant-row gu-custom' }, h('span', { class: 'gu-word' }, iw.w), h('span', { class: 'gu-facts' }, 'added by you'),
        h('div', { class: 'gu-instant-actions' }, group, remove));
    }
    const word = h('span', { class: 'gu-word' }, heartParts(iw, ctx.settings.taughtUpTo).map(({ g, heart }) =>
      h('span', { class: heart ? 'gu-heart' : null }, iw.w === 'i' ? 'I' : g)));
    const facts = [COMMONNESS[iw.band] ?? 'word', iw.ufli === null ? null : `UFLI lesson ${iw.ufli}`].filter(Boolean).join(' · ');
    return h('div', { class: 'gu-instant-row' }, word, h('span', { class: 'gu-facts' }, facts), group);
  };

  const addOffer = () => {
    const word = typedWord(search.value);
    if (word === '') return [];
    const problem = customWordProblem(word, lib, ctx.profile.customInstant ?? [], hx);
    if (problem !== null) return [h('p', { class: 'gu-hint' }, problem)];
    return [
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => {
        ctx.profile = addCustomInstant(ctx.profile, word, 'learning');
        drawList();
        drawCounts();
        return save(`Saved: ${word} is learning.`);
      } }, `Add "${word}"`),
      h('p', { class: 'gu-hint' }, `"${word}" ${hx("is not in the library. Added, it shows without heart marks and counts in Progress. She can't practice it in the word charm yet.")}`),
    ];
  };

  const search = (h('input', { class: 'gu-input', type: 'search', placeholder: 'Find a word', 'aria-label': 'Find a word', autocomplete: 'off', onInput: () => draw() }));
  const filter = h('select', { class: 'gu-select', 'aria-label': 'Show', onChange: ( e) => { show = (e.target).value; draw(); } },
    SHOW.map(([value, label]) => h('option', { value }, hx(label))));
  const drawList = () => {
    const query = typedWord(search.value);
    const found = filterInstantLibrary(lib, search.value).filter((iw) => show === 'all' || statusOf(iw.w) === show);
    const own = (ctx.profile.customInstant ?? []).filter((w) => w.includes(query) && (show === 'all' || statusOf(w) === show)).map((w) => ({ w, custom: (true) }));
    const rows = [...found, ...own];
    const offer = rows.length === 0 && show === 'all' ? addOffer() : [];
    const adding = offer.some((node) => node.tagName === 'BUTTON');
    list.replaceChildren(...(rows.length ? rows.map(row) : [...(adding ? [] : [h('p', { class: 'gu-empty' }, 'No words match.')]), ...offer]));
  };
  const draw = drawList;

  body.append(
    h('p', {}, hx("Mark the instant words she has been taught. Only known words appear in what she reads; learning words are practiced in the word charm. The heart parts, the letters she learns by heart at her current lesson, are underlined.")),
    h('p', { class: 'gu-hint' }, 'Beside each word: how common it is (very common is the first 100 of the 300 most common words, common the next 100, less common the last 100), and the UFLI lesson that teaches it as a heart word, when there is one.'),
    h('div', { class: 'gu-row gu-wrap' }, search, filter),
    counts,
    needs.el,
    status,
    list);
  drawCounts();
  draw();
  return () => {};
}

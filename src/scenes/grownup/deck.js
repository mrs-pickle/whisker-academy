import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { cornerFrame } from './gate.js';


const KEYWORD_MAX = 20;
const STATUSES = Object.freeze([['learning', 'Learning'], ['mastered', 'Mastered']]);

export const cleanKeyword = (text) => String(text ?? '').toLowerCase().replace(/[^a-z'-]/g, '').slice(0, KEYWORD_MAX);

export function setCard(deck, g, patch) {
  return deck.map((card) => {
    if (card.g !== g) return { ...card };
    const status = patch.status === 'learning' || patch.status === 'mastered' ? patch.status : card.status;
    const keyword = patch.keyword === undefined ? card.keyword : cleanKeyword(patch.keyword);
    return { ...card, status, keyword };
  });
}

export const keywordNote = (keyword, audio) => (keyword && !audio.has(`w.${keyword}`) ? 'No narrator clip yet. Record it in Sound check.' : '');

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'deck');
  if (!body) return () => {};

  const status = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });
  const lock = createLock();
  const record = (keyword) => {
    lock.run(() => ctx.router.go('grownup/soundcheck', { unlocked: true, slot: `w.${keyword}` }))
      .catch((err) => console.warn('Sound check could not open', err));
  };
  const change = async (g, patch) => {
    ctx.profile = { ...ctx.profile, deck: setCard(ctx.profile.deck, g, patch) };
    try {
      await ctx.save();
      status.textContent = `Saved ${g}.`;
    } catch (err) {
      console.error('The deck could not be saved', err);
      status.textContent = "Saving didn't work in this browser window.";
    }
  };

  const row = (card) => {
    const g = card.g;
    const statusGroup = h('div', { class: 'gu-segmented', role: 'group', 'aria-label': `${g} card` });
    const drawStatus = () => {
      const current = ctx.profile.deck.find(( c) => c.g === g)?.status;
      statusGroup.replaceChildren(...STATUSES.map(([value, label]) => h('button', {
        type: 'button', class: 'gu-choice', 'aria-pressed': String(current === value),
        onClick: () => { change(g, { status: value }).then(drawStatus); },
      }, label)));
    };
    drawStatus();
    const text = h('span', { class: 'gu-hint' });
    const recordIt = h('button', { type: 'button', class: 'gu-button gu-small', onClick: () => record(cleanKeyword(input.value)) }, 'Record it');
    const note = h('span', { class: 'gu-keyword-note' }, text, recordIt);
    const drawNote = ( keyword) => {
      text.textContent = keywordNote(keyword, ctx.audio);
      recordIt.hidden = text.textContent === '';
    };
    const input = (h('input', {
      class: 'gu-input gu-keyword', value: card.keyword, maxlength: String(KEYWORD_MAX), autocomplete: 'off',
      'aria-label': `Key word for ${g}`, placeholder: 'key word',
      onChange: () => {
        const keyword = cleanKeyword(input.value);
        input.value = keyword;
        drawNote(keyword);
        change(g, { keyword });
      },
    }));
    drawNote(card.keyword);
    return h('div', { class: 'gu-card-row' }, h('span', { class: 'gu-grapheme' }, g), statusGroup, input, note);
  };

  body.append(
    h('p', {}, 'Mark each sound card as her tutor sees it. The deck only chooses what comes up in the sound-card drill. Marking a card mastered never unlocks words; the lesson in Settings does that.'),
    h('p', { class: 'gu-hint' }, 'Key words are optional, and used only when Settings has the "Letter name, key word, sound" routine.'),
    status,
    h('div', { class: 'gu-deck' }, ctx.profile.deck.map(row)));
  return () => {};
}

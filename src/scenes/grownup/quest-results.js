import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { isCheckRecord, isQuestDetail, rebuildQuestDetail } from '../../engine/quest-results.js';
import { heroWords } from '../../profile/hero.js';
import { esc, FONT_URL, printHtml } from '../../ui/print-pages.js';
import { cornerFrame } from './gate.js';
import { weekLabel } from './progress.js';



export const REBUILT_NOTE = 'Rebuilt from saved records: missed words are exact.';
export const REBUILT_UNSURE_NOTE = 'Rebuilt from saved records: some marks could not be recovered. Those words say "not recorded".';
export const REBUILT_MISMATCH_NOTE = 'Rebuilt from saved records: the marks do not quite add up to the saved scores, so a "try again" may be a word she read right in the quest and missed in practice later that day.';
const same = (text) => text;
const noteFor = (detail, hx) => (!detail.rebuilt ? null
  : detail.checked === 'unsure' ? REBUILT_UNSURE_NOTE : detail.checked === 'mismatch' ? hx(REBUILT_MISMATCH_NOTE) : REBUILT_NOTE);
const TITLE = 'Entrance Quest results';
export const CHECK_TITLE = 'Monthly check results';

export function markChip(mark) {
  if (mark === true) return { kind: 'right', label: '✓' };
  if (mark === false) return { kind: 'missed', label: 'try again' };
  if (mark === 'unknown') return { kind: 'unknown', label: 'not recorded' };
  return { kind: 'unreached', label: 'not reached' };
}

export function spellChip({ word, built, correct }) {
  return { word, ...markChip(correct === 'unknown' ? 'unknown' : correct === true), built: correct === false && Array.isArray(built) ? built.join('') : null };
}

const passageText = (passage) => ( (passage)?.stopped === true ? 'Not timed: stopped before the end.'
  : passage?.wcpm == null ? 'Not read.' : `${passage.wcpm} words correct per minute, ${passage.errors ?? 0} missed`);

export function resultSections(detail) {
  const lines = (kind) => detail.lines.filter((l) => l.kind === kind)
    .map((l) => l.words.map((word, i) => ({ word, ...markChip(l.marks[i]) })));
  return [
    { title: 'Real words', rows: lines('real') },
    { title: 'Made-up words', rows: lines('nonsense') },
    { title: 'Spelling', rows: detail.dictation.length > 0 ? [detail.dictation.map(spellChip)] : [] },
    { title: 'Passage', rows: [], text: passageText(detail.passage) },
  ];
}

const chipText = (chip) => `${chip.word} ${chip.label}${chip.built ? ` (built: ${chip.built})` : ''}`;

const playedOn = (detail) => `Played on ${weekLabel(detail.day)}, taught up to lesson ${detail.taughtUpTo}.`;

function questRecord(profile, content, states) {
  const baseline = profile.baseline;
  if (baseline == null || !Number.isFinite(baseline.day)) return null;
  const kept = profile.baselineDetail;
  const current = isQuestDetail(kept) && !(kept.rebuilt && kept.checked === undefined);
  if (current && kept.day === baseline.day) return { detail: kept, kept: true };
  return { detail: rebuildQuestDetail(baseline, content, states, profile.startLesson), kept: false };
}

export function resultsDocument(detail, hx = same, title = TITLE) {
  const sections = resultSections(detail).map((s) => `<h2>${esc(s.title)}</h2>`
    + (s.text !== undefined ? `<p>${esc(s.text)}</p>`
      : s.rows.length === 0 ? `<p class="empty">${hx(title === TITLE ? 'None in her quest.' : 'None in this check.')}</p>`
        : s.rows.map((row) => `<p class="line">${row.map((c) => `<span class="chip ${c.kind}">${esc(chipText(c))}</span>`).join(' ')}</p>`).join('')));
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(title)}</title><style>`
    + `@font-face { font-family: 'Andika'; src: url("${FONT_URL}") format('woff2'); font-weight: 400; font-style: normal; }`
    + '@page { margin: 12mm; }'
    + "body { margin: 0; font-family: 'Andika', sans-serif; font-size: 11pt; line-height: 1.3; color: #000; background: #fff; }"
    + 'h1 { margin: 0 0 1.5mm; font-size: 18pt; } h2 { margin: 3mm 0 1mm; font-size: 13pt; break-after: avoid; } p { margin: 0 0 1.5mm; }'
    + '.note { font-style: italic; } .empty { color: #444; }'
    + '.line { padding-left: 2mm; border-left: 0.6mm solid #999; break-inside: avoid; }'
    + '.chip { display: inline-block; margin: 0.4mm 1mm 0.4mm 0; padding: 0 2mm; border: 0.3mm solid #000; border-radius: 3mm; white-space: nowrap; }'
    + '.chip.missed { font-weight: 700; border-width: 0.6mm; } .chip.unreached { color: #444; border-style: dashed; } .chip.unknown { color: #444; border-style: dotted; }'
    + `</style></head><body><h1>${esc(title)}</h1><p>${esc(playedOn(detail))}</p>`
    + (noteFor(detail, hx) ? `<p class="note">${esc(noteFor(detail, hx) ?? '')}</p>` : '')
    + `${sections.join('')}</body></html>`;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'quest-results');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  const index = Number(params.check);
  const chosen = params.check !== undefined && Number.isInteger(index) ? ctx.profile.checks?.[index] : undefined;
  if (params.check !== undefined) return showCheck(body, ctx, hx, isCheckRecord(chosen) ? chosen : null);
  const record = questRecord(ctx.profile, ctx.content, ctx.states);
  if (!record) {
    body.append(h('p', { class: 'gu-empty' }, hx("The Entrance Quest hasn't been played yet. It starts the first time she presses Play.")));
    return () => {};
  }
  const { detail } = record;
  if (!record.kept) {
    ctx.profile = { ...ctx.profile, baselineDetail: detail };
    Promise.resolve(ctx.save()).catch(( err) => console.error('The rebuilt Entrance Quest results could not be saved', err));
  }

  drawResults(body, hx, detail, TITLE);
  return () => {};
}

function showCheck(body, ctx, hx, detail) {
  if (!detail) body.append(h('p', { class: 'gu-empty' }, 'That monthly check is not here.'));
  else {
    body.append(h('h2', { class: 'gu-subtitle' }, CHECK_TITLE));
    drawResults(body, hx, detail, CHECK_TITLE);
  }
  return () => {};
}

function drawResults(body, hx, detail, title) {
  const lock = createLock();
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const print = () => lock.run(async () => {
    message.textContent = '';
    try {
      if (!(await printHtml(resultsDocument(detail, hx, title), { doc: body.ownerDocument }))) message.textContent = "The print window didn't open. Try again.";
    } catch (err) {
      console.error('The results could not be printed', err);
      message.textContent = "The results couldn't be printed in this browser window.";
    }
  });

  const chipEl = (chip) => h('span', { class: ['gu-answer', chip.kind] },
    h('span', { class: 'gu-answer-word', lang: 'en' }, chip.word), ' ',
    h('span', { class: 'gu-answer-mark' }, chip.label),
    chip.built ? ` (built: ${chip.built})` : null);
  body.append(...[
    noteFor(detail, hx) ? h('p', { class: 'gu-note' }, noteFor(detail, hx)) : null,
    h('p', { class: 'gu-hint' }, playedOn(detail)),
    h('div', { class: 'gu-row' }, h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { print().catch((err) => console.error('The Entrance Quest results could not be printed', err)); } }, 'Print')),
    message,
    ...resultSections(detail).map((section) => h('section', { class: 'gu-quest-section' },
      h('h2', { class: 'gu-subtitle' }, section.title),
      section.text !== undefined ? h('p', {}, section.text)
        : section.rows.length === 0 ? h('p', { class: 'gu-empty' }, hx(title === TITLE ? 'None in her quest.' : 'None in this check.'))
          : section.rows.map((row) => h('div', { class: 'gu-answer-line' }, row.map(chipEl)))))].filter((node) => node !== null));
}

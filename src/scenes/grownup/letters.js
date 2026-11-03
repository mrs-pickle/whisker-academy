import { h } from '../../core/dom.js';
import { setLetterMark, sheetLetters } from '../../engine/letters.js';
import { heroWords } from '../../profile/hero.js';
import { esc, FONT_URL, printHtml } from '../../ui/print-pages.js';
import { cornerFrame } from './gate.js';


export const SHEET_TITLE = 'Letter practice';
const RULES = Object.freeze([['top', 40], ['middle', 200], ['base', 360]]);
const PARTS = Object.freeze(['model', 'dotted', 'start', 'blank']);
const MARKS = Object.freeze([['work', 'Work on it'], ['fine', 'Fine']]);

export function sheetRow(letter) {
  const { w, h: tall } = letter.box;
  const width = w * PARTS.length;
  const rules = RULES.map(([name, y]) => `<line class="rule ${name}" x1="0" x2="${width}" y1="${y}" y2="${y}"/>`).join('');
  const cell = ( part, i) => {
    const at = `transform="translate(${i * w} 0)"`;
    if (part === 'model') {
      const strokes = letter.strokes.map((s) => `<path class="model" d="${s.d}" marker-end="url(#arrow)"/>`).join('');
      const placed = [];
      const numbers = letter.strokes.map((s, n) => {
        let [x, y] = s.dots[0];
        while (placed.some(([px, py]) => Math.hypot(px - x, py - y) < 52)) x += 56;
        placed.push([x, y]);
        return `<g class="num"><circle cx="${x}" cy="${y}" r="26"/><text x="${x}" y="${y + 11}">${n + 1}</text></g>`;
      }).join('');
      return `<g ${at}>${strokes}${numbers}</g>`;
    }
    if (part === 'dotted') return `<g ${at}>${letter.strokes.map((s) => `<path class="dotted" d="${s.d}"/>`).join('')}</g>`;
    if (part === 'start') {
      const [x, y] = letter.strokes[0].dots[0];
      return `<g ${at}><circle class="start" cx="${x}" cy="${y}" r="16"/></g>`;
    }
    return '';
  };
  return `<svg class="row" viewBox="0 0 ${width} ${tall}" role="img" aria-label="${esc(letter.id)}">${rules}${PARTS.map(cell).join('')}</svg>`;
}

export function letterSheetDocument(letters, { fontUrl = FONT_URL } = {}) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${SHEET_TITLE}</title><style>`
    + `@font-face { font-family: 'Andika'; src: url("${fontUrl}") format('woff2'); font-weight: 400; font-style: normal; }`
    + '@page { margin: 10mm; }'
    + "body { margin: 0; font-family: 'Andika', sans-serif; font-size: 11pt; color: #000; background: #fff; }"
    + 'header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.4mm solid #000; margin-bottom: 4mm; }'
    + 'h1 { margin: 0; font-size: 16pt; } .name { margin: 0; }'
    + '.row { display: block; height: 52mm; max-width: 186mm; margin: 0 0 4mm; break-inside: avoid; }'
    + '.rule { stroke: #777; stroke-width: 3; } .rule.middle { stroke-dasharray: 14 12; }'
    + '.model { fill: none; stroke: #000; stroke-width: 14; stroke-linecap: round; stroke-linejoin: round; }'
    + '.dotted { fill: none; stroke: #555; stroke-width: 12; stroke-linecap: round; stroke-dasharray: 0.1 28; }'
    + '.num circle { fill: #000; } .num text { fill: #fff; font-size: 32px; font-family: sans-serif; text-anchor: middle; font-weight: 700; }'
    + '.start { fill: #000; }'
    + 'footer { font-size: 9pt; border-top: 0.3mm solid #000; padding-top: 1mm; }'
    + `</style></head><body><header><h1>${SHEET_TITLE}</h1><p class="name">Name: ______________________</p></header>`
    + '<svg width="0" height="0" style="position:absolute"><defs><marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="3.2" markerHeight="3.2" orient="auto-start-reverse">'
    + '<path d="M0 0 L10 5 L0 10 z" fill="#000"/></marker></defs></svg>'
    + `<main>${letters.map(sheetRow).join('')}</main>`
    + '<footer><p>Follow the numbers, trace the dots, start at the dot, then write it alone. Say the sound each time.</p></footer>'
    + '</body></html>';
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'letters');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  const letters = (ctx.content?.letters ?? []);
  const status = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });

  const change = async (id, fine) => {
    ctx.profile = { ...ctx.profile, letters: setLetterMark(ctx.profile.letters, id, fine) };
    if (Object.keys(ctx.profile.letters).length === 0) {
      const { letters: _gone, ...rest } = ctx.profile;
      ctx.profile = rest;
    }
    try {
      await ctx.save();
      status.textContent = `Saved ${id}.`;
    } catch (err) {
      console.error('The letter marks could not be saved', err);
      status.textContent = "Saving didn't work in this browser window.";
    }
  };

  const cell = (letter) => {
    const id = letter.id;
    const group = h('div', { class: 'gu-segmented', role: 'group', 'aria-label': `Letter ${id}` });
    const draw = () => {
      const fine = ctx.profile.letters?.[id] === 'fine';
      group.replaceChildren(...MARKS.map(([value, label]) => h('button', {
        type: 'button', class: 'gu-choice', 'aria-pressed': String((value === 'fine') === fine),
        onClick: () => { change(id, value === 'fine').then(draw); },
      }, label)));
    };
    draw();
    return h('div', { class: 'gu-letter', 'data-letter': id }, h('span', { class: 'gu-grapheme' }, id), group);
  };

  const sheetStatus = h('p', { class: 'gu-hint', role: 'status' });
  const print = () => {
    const ids = sheetLetters(ctx.content ?? {}, ctx.profile, ctx.states ?? new Map(), ctx.day);
    const chosen = ids.map((id) => letters.find((l) => l.id === id)).filter((l) => l !== undefined);
    if (chosen.length === 0) {
      sheetStatus.textContent = 'Every letter is marked fine: there is nothing to practice on a sheet.';
      return;
    }
    sheetStatus.textContent = `This sheet: ${ids.join(' ')}.`;
    printHtml(letterSheetDocument( (chosen))).catch((err) => {
      console.error('The letter sheet could not print', err);
      sheetStatus.textContent = "Printing didn't work in this browser window.";
    });
  };

  body.append(
    h('p', {}, hx('Watch her write the alphabet once, and mark what is already right. It skips those.')),
    h('p', { class: 'gu-hint' }, hx('Fine letters never come up in the pencil round. Judge only where she starts and which way she goes.')),
    h('div', { class: 'gu-actions' }, h('button', { type: 'button', class: 'gu-button', onClick: print }, 'Print a sheet of this week\'s letters')),
    sheetStatus,
    status,
    h('div', { class: 'gu-letters' }, letters.map(cell)));
  return () => {};
}

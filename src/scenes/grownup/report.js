import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { heroWords } from '../../profile/hero.js';
import { esc, FONT_URL, printHtml } from '../../ui/print-pages.js';
import { REPORT_FOOTER, reportCsv, reportDates, reportSections, tutorReport } from '../../engine/tutor-report.js';
import { cornerFrame } from './gate.js';


export const REPORT_TITLE = 'Reading practice report';

const same = (text) => text;
const SPLIT_FROM = 20;

export const reportFileName = (day) => `reading-report-${new Date(day * 86400000).toISOString().slice(0, 10)}.csv`;

export function reportDocument(report, hx = same) {
  const table = (head, rows) => `<table><thead><tr>${head.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map((c, i) => (i === 0 ? `<th>${esc(c)}</th>` : `<td>${esc(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
  const tableOf = (t) => (t.rows.length <= SPLIT_FROM ? table(t.head, t.rows)
    : `<div class="split">${table(t.head, t.rows.slice(0, Math.ceil(t.rows.length / 2)))}${table(t.head, t.rows.slice(Math.ceil(t.rows.length / 2)))}</div>`);
  const sections = reportSections(report).map((s) => `<section><h2>${esc(s.title)}</h2>`
    + (s.table ? tableOf(s.table) : '')
    + (s.lines ?? []).map((line) => `<p>${esc(hx(line))}</p>`).join('')
    + (s.blank ?? []).map((line) => `<p class="blank">${esc(line)}</p>`).join('')
    + '</section>').join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${REPORT_TITLE}</title><style>`
    + `@font-face { font-family: 'Andika'; src: url("${FONT_URL}") format('woff2'); font-weight: 400; font-style: normal; }`
    + '@page { margin: 10mm; }'
    + "body { margin: 0; font-family: 'Andika', sans-serif; font-size: 9.5pt; line-height: 1.22; color: #000; background: #fff; }"
    + 'header { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 0.4mm solid #000; margin-bottom: 2mm; }'
    + 'h1 { margin: 0; font-size: 15pt; } .dates { margin: 0; } .student { margin: 1mm 0 0; }'
    + 'main { column-count: 2; column-gap: 6mm; }'
    + 'section { margin-bottom: 2mm; } tr, p { break-inside: avoid; }'
    + 'h2 { margin: 0 0 0.8mm; font-size: 11pt; break-after: avoid; } p { margin: 0 0 0.8mm; }'
    + 'table { border-collapse: collapse; width: 100%; font-size: 8.5pt; line-height: 1.12; margin-bottom: 1mm; }'
    + 'th, td { text-align: left; padding: 0.1mm 1.2mm 0.1mm 0; vertical-align: top; } thead th { border-bottom: 0.3mm solid #000; } tbody th { font-weight: 400; }'
    + '.split { display: flex; gap: 3mm; } .split table { width: 50%; }'
    + '.blank { margin-top: 2mm; } footer { margin-top: 2mm; border-top: 0.3mm solid #000; font-size: 8.5pt; }'
    + `</style></head><body><header><h1>${REPORT_TITLE}</h1><p class="dates">${esc(reportDates(report))}</p></header>`
    + '<p class="student">Student: ______________________</p>'
    + `<main>${sections}</main>`
    + `<footer>${REPORT_FOOTER.map((line) => `<p>${esc(line)}</p>`).join('')}</footer></body></html>`;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'report');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  const report = tutorReport({ profile: ctx.profile, states: ctx.states, content: ctx.content, settings: ctx.settings, day: ctx.day });
  const lock = createLock();
  const urls = [];
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const print = () => lock.run(async () => {
    message.textContent = '';
    try {
      if (!(await printHtml(reportDocument(report, hx), { doc: el.ownerDocument }))) message.textContent = "The print window didn't open. Try again.";
    } catch (err) {
      console.error('The tutor report could not be printed', err);
      message.textContent = "The report couldn't be printed in this browser window.";
    }
  });
  const csv = () => {
    const name = reportFileName(ctx.day);
    const url = URL.createObjectURL(new Blob([reportCsv(report, hx)], { type: 'text/csv' }));
    urls.push(url);
    const link = h('a', { href: url, download: name, hidden: true });
    el.append(link);
    link.click();
    link.remove();
    message.textContent = `CSV file made: ${name}. Your browser puts it in your Downloads.`;
  };
  body.append(
    h('p', { class: 'gu-hint' }, hx('One page for her tutor, from this laptop only. Print it, or save it as a PDF from the print window. It has no names on it: write a name on the Student line if you like.')),
    h('p', { class: 'gu-hint' }, reportDates(report)),
    h('div', { class: 'gu-row' },
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { print().catch((err) => console.error(err)); } }, 'Print'),
      h('button', { type: 'button', class: 'gu-button', onClick: csv }, 'Save as CSV')),
    message,
    ...reportSections(report).map((s) => h('section', { class: 'gu-report-section' },
      h('h2', { class: 'gu-subtitle' }, s.title),
      s.table ? h('table', { class: 'gu-table' },
        h('thead', {}, h('tr', {}, s.table.head.map((c) => h('th', {}, c)))),
        h('tbody', {}, s.table.rows.map((row) => h('tr', {}, row.map((c, i) => (i === 0 ? h('th', {}, c) : h('td', {}, c))))))) : null,
      (s.lines ?? []).map((line) => h('p', {}, hx(line))))));
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}

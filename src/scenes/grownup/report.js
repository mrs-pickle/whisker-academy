import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { heroWords } from '../../profile/hero.js';
import { esc, printHtml } from '../../ui/print-pages.js';
import { KEEP_TOGETHER_ROWS, printReport, reportCsv, reportDates, reportSections, tutorReport } from '../../engine/tutor-report.js';
import { cornerFrame } from './gate.js';


export const REPORT_TITLE = 'Reading practice report';
export { PRINT_TITLE } from '../../engine/tutor-report.js';

const same = (text) => text;

export const reportFileName = (day) => `reading-report-${new Date(day * 86400000).toISOString().slice(0, 10)}.csv`;

export const REPORT_CSS = [
  '@page { size: letter; margin: 1in 1in 0.9in; @bottom-center { content: "Page " counter(page) " of " counter(pages); font-family: "Times New Roman", Times, "Liberation Serif", serif; font-size: 9.5pt; color: #333; } }',
  '* { box-sizing: border-box; }',
  'html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  'body { margin: 0; font-family: "Times New Roman", Times, "Liberation Serif", serif; font-size: 11.5pt; line-height: 1.38; color: #000; background: #fff; }',
  '@media screen { body { max-width: 6.5in; margin: 0.6in auto; } }',
  '.masthead { text-align: center; padding-bottom: 8pt; border-bottom: 1.6pt solid #34495e; margin-bottom: 4pt; }',
  '.masthead h1 { margin: 0; font-size: 19pt; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; }',
  '.masthead .sub { margin: 3pt 0 0; font-size: 11.5pt; font-style: italic; text-align: center; }',
  '.rule2 { border: 0; border-top: 0.5pt solid #34495e; margin: 0 0 12pt; }',
  '.ident { width: 100%; border-collapse: collapse; margin: 0 0 14pt; font-size: 11.5pt; }',
  '.ident td { padding: 2.5pt 0; vertical-align: bottom; border: 0; }',
  '.ident .k { font-weight: 700; white-space: nowrap; width: 1.45in; }',
  '.fill { display: inline-block; min-width: 2.6in; border-bottom: 0.6pt solid #000; height: 1.05em; }',
  'section { margin: 0 0 12pt; }',
  'h2 { font-size: 12.5pt; font-weight: 700; text-decoration: underline; text-underline-offset: 2.5pt; margin: 14pt 0 6pt; break-after: avoid; page-break-after: avoid; }',
  'p { margin: 0 0 7pt; text-align: justify; hyphens: auto; orphans: 3; widows: 3; }',
  '.block { margin: 0 0 10pt; }',
  '.keep { break-inside: avoid; page-break-inside: avoid; }',
  '.caption { font-weight: 700; font-size: 10.5pt; margin: 0 0 3pt; text-align: left; break-after: avoid; }',
  'table.data { width: 100%; border-collapse: collapse; font-size: 10.5pt; line-height: 1.25; }',
  'table.data th, table.data td { border: 0.75pt solid #000; padding: 3pt 6pt; text-align: left; vertical-align: top; }',
  'table.data thead th { background: #d9d9d9; font-weight: 700; }',
  'table.data tbody th { font-weight: 400; }',
  'table.data tr { break-inside: avoid; page-break-inside: avoid; }',
  'table.data thead { display: table-header-group; }',
  '.note { font-size: 9.5pt; font-style: italic; margin: 3pt 0 0; text-align: left; }',
  'ol, ul { margin: 0 0 8pt; padding-left: 22pt; } li { margin: 0 0 5pt; padding-left: 3pt; break-inside: avoid; }',
  'ul li { margin-bottom: 2pt; } .lead { margin-bottom: 3pt; }',
  '.ruled .line { border-bottom: 0.6pt solid #000; height: 21pt; }',
  '.ruled .label { font-weight: 700; display: inline-block; margin-top: 6pt; }',
  '.ruled .label + .fill { min-width: 1.2in; margin-left: 6pt; }',
  '.closing { margin-top: 18pt; break-inside: avoid; page-break-inside: avoid; }',
  '.closing p { text-align: left; }',
  '.sign { display: flex; gap: 0.5in; margin-top: 20pt; }',
  '.sign div { flex: 1; } .sign .k { font-weight: 700; }',
  '.sign .fill, .sign .given { min-width: 0; width: 100%; display: block; height: 1.5em; border-bottom: 0.6pt solid #000; margin-bottom: 3pt; }',
  '.sign small { font-size: 9.5pt; }',
  'footer { margin-top: 18pt; border-top: 0.5pt solid #888; padding-top: 4pt; font-size: 9pt; color: #333; }',
  'footer p { margin: 0; text-align: left; }',
].join('\n');

export function reportDocument(report, hx = same, meta = {}) {
  const doc = printReport(report, meta);
  const blank = '<span class="fill"></span>';
  const t = (text) => esc(hx(text));
  const block = (b) => {
    if (b.kind === 'p') return `<p>${b.label ? `<b>${t(b.label)}:</b> ` : ''}${t(b.text)}</p>`;
    if (b.kind === 'ol') return `<ol>${b.items.map((item) => `<li>${t(item)}</li>`).join('')}</ol>`;
    if (b.kind === 'ul') return `${b.label ? `<p class="lead"><b>${t(b.label)}:</b></p>` : ''}<ul>${b.items.map((item) => `<li>${t(item)}</li>`).join('')}</ul>`;
    if (b.kind === 'ruled') {
      return `<div class="ruled keep">${b.lines.map((l) => `<span class="label">${t(l)}</span>${blank}`).join('')}${'<div class="line"></div>'.repeat(b.count)}</div>`;
    }
    const cols = b.widths ? `<colgroup>${b.widths.map((w) => `<col style="width:${w}%">`).join('')}</colgroup>` : '';
    const table = `<table class="data">${cols}<thead><tr>${b.head.map((c) => `<th>${t(c)}</th>`).join('')}</tr></thead>`
      + `<tbody>${b.rows.map((row) => `<tr>${row.map((c, i) => (i === 0 ? `<th>${t(c)}</th>` : `<td>${t(c)}</td>`)).join('')}</tr>`).join('')}</tbody></table>`;
    return `<div class="block${b.rows.length <= KEEP_TOGETHER_ROWS ? ' keep' : ''}">${b.caption ? `<p class="caption">${t(b.caption)}</p>` : ''}${table}${b.note ? `<p class="note">${t(b.note)}</p>` : ''}</div>`;
  };
  const prepared = doc.preparedBy ? `<span class="given">${esc(doc.preparedBy)}</span>` : blank;
  const closing = `<div class="closing"><p>${t(doc.closing)}</p><div class="sign">`
    + `<div>${prepared}<small><span class="k">Prepared by</span> (parent)</small></div>`
    + `<div style="flex:0.6">${blank}<small><span class="k">Date</span></small></div></div></div>`;
  const sections = doc.sections.map((s, i) => {
    const blocks = s.blocks.map(block);
    if (i === doc.sections.length - 1) blocks.push(`<div class="keep">${blocks.pop() ?? ''}${closing}</div>`);
    const [first, ...rest] = blocks;
    return `<section><div class="keep"><h2>${t(s.heading)}</h2>${first ?? ''}</div>${rest.join('')}</section>`;
  }).join('');
  const ident = doc.ident.map((row) => `<tr><td class="k">${esc(row.label)}:</td><td>${row.value ? esc(row.value) : blank}</td></tr>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(doc.title)}</title><style>${REPORT_CSS}</style></head><body>`
    + `<header class="masthead"><h1>${esc(doc.title)}</h1><p class="sub">${esc(doc.subtitle)}</p></header><hr class="rule2">`
    + `<table class="ident">${ident}</table>`
    + `<main>${sections}</main>`
    + `<footer>${doc.footer.map((line) => `<p>${esc(line)}</p>`).join('')}</footer></body></html>`;
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
    h('p', { class: 'gu-hint' }, hx('A report for her tutor, from this laptop only. Print it, or save it as a PDF from the print window. It has no names on it: write a name and birth date on the blank lines if you like.')),
    h('p', { class: 'gu-hint' }, reportDates(report)),
    h('div', { class: 'gu-row' },
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { print().catch((err) => console.error(err)); } }, 'Print'),
      h('button', { type: 'button', class: 'gu-button', onClick: csv }, 'Save as CSV')),
    message,
    ...reportSections(report).map((s) => h('section', { class: 'gu-report-section' },
      h('h2', { class: 'gu-subtitle' }, hx(s.title)),
      s.table ? h('table', { class: 'gu-table' },
        h('thead', {}, h('tr', {}, s.table.head.map((c) => h('th', {}, c)))),
        h('tbody', {}, s.table.rows.map((row) => h('tr', {}, row.map((c, i) => (i === 0 ? h('th', {}, c) : h('td', {}, c))))))) : null,
      (s.lines ?? []).map((line) => h('p', {}, hx(line))))));
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}

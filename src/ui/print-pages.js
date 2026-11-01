import { keepPages, markPrinted, pageBlobId, pagesNow } from '../profile/pages.js';
import { pageUrl } from './page-parts.js';



export const FONT_URL = 'assets/fonts/Andika-Regular.woff2';
export const STRIP_MAX = 4;
export const PRINT_IGNORED_MS = 1000;
const FRAME = 'print-frame';

const list = (v) => (Array.isArray(v) ? v : []);
export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cssUrl = (u) => String(u).replace(/[\s"'\\<>()]/g, (c) => `%${c.charCodeAt(0).toString(16).padStart(2, '0').toUpperCase()}`);

export function wordsForStrip(todayRecord, content, max = STRIP_MAX) {
  const limit = Number.isInteger(max) && max > 0 ? max : 0;
  const spelled = realWords(list(todayRecord?.spelled), content).slice(0, limit);
  return spelled.length > 0 ? spelled : realWords(list(todayRecord?.answered), content).slice(0, limit);
}

function realWords(ids, content) {
  const madeUp = new Set(list(content?.nonsense).map((w) => w?.w));
  const real = new Set(list(content?.words).filter((w) => typeof w?.w === 'string' && w.real !== false && !madeUp.has(w.w)).map((w) => w.w));
  const out = [];
  for (const id of ids) {
    const word = typeof id === 'string' && id.startsWith('w:') ? id.slice(2) : '';
    if (real.has(word) && !out.includes(word)) out.push(word);
  }
  return out;
}

export function wordsBuilt(todayRecord, content) {
  return realWords([...list(todayRecord?.answered), ...list(todayRecord?.spelled)], content);
}

const nameWords = (names) => new Set(list(names).filter((n) => typeof n === 'string')
  .flatMap((n) => n.toLowerCase().split(/[^\p{L}\p{N}']+/u)).filter((w) => w !== ''));

function stripWords(words, names) {
  const banned = nameWords(names);
  const out = [];
  for (const w of list(words)) {
    const word = typeof w === 'string' ? w.trim() : '';
    if (word !== '' && !banned.has(word.toLowerCase()) && !out.includes(word)) out.push(word);
  }
  return out.slice(0, STRIP_MAX);
}

export function printDocumentFor(pages, { wordStrip = false, fontUrl = FONT_URL, names = [] } = {}) {
  const sheets = list(pages).map((page) => {
    const wide = Number(page?.w) > Number(page?.h);
    const words = wordStrip ? stripWords(page?.words, names) : [];
    return `<section class="sheet ${wide ? 'wide' : 'tall'}">`
      + `<div class="art"><img src="${esc(page?.src ?? '')}" alt=""></div>`
      + (words.length > 0 ? `<p class="strip">Words I can read: <span class="strip-words">${words.map(esc).join(' • ')}</span></p>` : '')
      + '</section>';
  });
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coloring pages</title><style>'
    + `@font-face { font-family: 'Andika'; src: url("${cssUrl(fontUrl)}") format('woff2'); font-weight: 400; font-style: normal; }`
    + '@page { margin: 10mm; } @page tall { size: portrait; margin: 10mm; } @page wide { size: landscape; margin: 10mm; }'
    + 'html, body { margin: 0; padding: 0; background: #fff; }'
    + '.sheet { display: flex; flex-direction: column; box-sizing: border-box; overflow: hidden; break-after: page; page-break-after: always; }'
    + '.sheet:last-child { break-after: auto; page-break-after: auto; }'
    + '.sheet.tall { page: tall; width: 186mm; height: 255mm; }'
    + '.sheet.wide { page: wide; width: 255mm; height: 186mm; }'
    + '.art { position: relative; flex: 1 1 auto; min-height: 0; }'
    + '.art img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }'
    + ".strip { flex: none; margin: 5mm 0 0; font-family: 'Andika', sans-serif; font-size: 48pt; font-weight: 400; line-height: 1.2; text-align: center; color: #000; }"
    + '.strip-words { display: inline-block; }'
    + `</style></head><body>${sheets.join('')}</body></html>`;
}

let waiting = (null);

export function printPages(entries, { doc = globalThis.document, ...options } = {}) {
  return printHtml(printDocumentFor(entries, options), { doc });
}

export function printHtml(html, { doc = globalThis.document } = {}) {
  waiting?.settle(false);
  return new Promise((resolve, reject) => {
    const frame = (doc.createElement('iframe'));
    let over = false;
    const end = (then) => {
      if (over) return;
      over = true;
      if (waiting === job) waiting = null;
      frame.remove();
      then();
    };
    const job = { settle: ( printed) => end(() => resolve(printed)) };
    const fail = (err) => end(() => reject(err));
    waiting = job;
    frame.className = FRAME;
    frame.setAttribute('title', 'Pages to print');
    frame.setAttribute('aria-hidden', 'true');
    frame.setAttribute('tabindex', '-1');
    frame.addEventListener('load', () => {
      const win = frame.contentWindow;
      if (!win) { fail(new Error('The print frame has no window')); return; }
      Promise.resolve(win.document?.fonts?.ready).catch(() => {}).then(() => {
        if (over) return;
        let opened = false;
        win.addEventListener('beforeprint', () => { opened = true; }, { once: true });
        win.addEventListener('afterprint', () => job.settle(true), { once: true });
        win.focus();
        win.print();
        if (!opened && !over) setTimeout(() => { if (!opened) job.settle(false); }, PRINT_IGNORED_MS);
      }).catch(fail);
    }, { once: true });
    frame.srcdoc = html;
    doc.body.append(frame);
  });
}

export const printOptions = (ctx) => ({
  wordStrip: ctx.settings?.printWords !== false,
  names: [ctx.profile?.princessName, ctx.profile?.kittenName],
});

async function madeUrl(ctx, meta) {
  try {
    const parts = await ctx.readParts?.();
    return parts ? pageUrl( (meta.recipe), parts) : null;
  } catch (err) {
    console.error(`The page ${meta.id} could not be drawn`, err);
    return null;
  }
}

export async function printLibraryPages(ctx, metas, doc = globalThis.document) {
  const catalog = list(ctx.content?.colorin);
  const urls = [];
  const sheets = [];
  const ids = [];
  try {
    for (const meta of metas) {
      let src = null;
      if (meta.source === 'story') {
        const svg = catalog.find((c) => c?.id === meta.id)?.svg;
        if (typeof svg === 'string') src = `assets/art/${svg}.svg`;
      } else if (meta.source === 'made') {
        src = await madeUrl(ctx, meta);
      } else {
        const blob = await ctx.store.getBlob(pageBlobId(meta.id));
        if (blob instanceof Blob) urls.push(src = URL.createObjectURL(blob));
      }
      if (src === null) {
        console.warn(`The picture of ${meta.id} is not here, so it was not printed`);
        continue;
      }
      sheets.push({ src, w: meta.w, h: meta.h, words: list(meta.words) });
      ids.push(meta.id);
    }
    const printed = sheets.length > 0 && await printPages(sheets, { doc, ...printOptions(ctx) });
    return { ids, printed };
  } finally {
    for (const url of urls) URL.revokeObjectURL(url);
  }
}

export async function notePrinted(ctx, ids, day) {
  const now = await pagesNow(ctx);
  if (ids.length === 0) return now;
  const next = markPrinted(now, ids, day);
  return (await keepPages(ctx, next)) ? next : null;
}

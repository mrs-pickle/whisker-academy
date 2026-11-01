import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { PAGE_TYPES, addFamilyPages, firstWaiting, keepPages, movePage, newlyEarned, pageBlobId, pagesNow, removePage, waitingQueue } from '../../profile/pages.js';
import { pageUrl } from '../../ui/page-parts.js';
import { prepare } from '../../ui/prepare-image.js';
import { notePrinted, printLibraryPages } from '../../ui/print-pages.js';
import { cornerFrame } from './gate.js';
import { shortDate } from './progress.js';
import { SETTING_HELP, updateSetting } from './settings.js';


const isEarned = (p) => Number.isFinite(p.earnedDay);

const NOT_SAVED = "Saving didn't work in this browser window.";

export function listOrder(pages) {
  const waiting = pages.filter((p) => !isEarned(p)).sort((a, b) => a.order - b.order);
  const earned = pages.filter(isEarned).sort((a, b) => (b.earnedDay) - (a.earnedDay) || b.order - a.order);
  return [...waiting, ...earned];
}

export function pageStatus(page) {
  if (Number.isFinite(page.printedDay)) return { kind: 'printed', label: `Printed ${shortDate( (page.printedDay))}` };
  if (isEarned(page)) return { kind: 'earned', label: `Earned ${shortDate( (page.earnedDay))}` };
  return { kind: 'waiting', label: 'Waiting' };
}

export const nextPageNote = (pages) => (firstWaiting(pages)
  ? 'Her next finished day offers the first waiting page below, beside the pages made from the story.'
  : 'None of your pages are waiting, so her next finished day offers pages made from the story. Add pages to give her one more choice.');

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'pages');
  if (!body) return () => {};
  const day = ctx.day;
  const lock = createLock();
  let live = true;
  let pages = null;
  let deleting = null;
  const urls = new Map();
  const drawn = new Map();

  const saved = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });
  const reread = async () => { pages = await pagesNow(ctx).catch(() => pages); };
  const syncWaitingList = () => { if (Array.isArray(ctx.pages) && pages) ctx.pages = pages; };

  const input = (h('input', { type: 'file', class: 'gu-file', hidden: true, multiple: true, accept: PAGE_TYPES.join(','),
    onChange: () => {
      const files = [...(input.files ?? [])];
      input.value = '';
      add(files).catch((err) => console.error('The pictures could not be added', err));
    } }));
  const addButton = (h('button', { type: 'button', class: 'gu-button gu-primary', disabled: true, onClick: () => input.click() }, 'Add pages'));
  const addMessage = h('div', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const add = (files) => lock.run(async () => {
    if (!pages || files.length === 0) return;
    addButton.disabled = true;
    addMessage.replaceChildren(h('p', {}, files.length === 1 ? 'Adding the picture…' : `Adding ${files.length} pictures…`));
    try {
      const result = await addFamilyPages(ctx.store, pages, files, day, { prepare });
      pages = result.pages;
      syncWaitingList();
      const added = files.length - result.rejected.length;
      addMessage.replaceChildren(
        h('p', {}, added === 0 ? 'No pages were added.' : `Added ${added === 1 ? '1 page' : `${added} pages`} at the end of the queue.`),
        ...(result.rejected.length === 0 ? [] : [h('ul', { class: 'gu-rejected' },
          result.rejected.map((r) => h('li', {}, h('strong', {}, r.name), `: ${r.reason}`)))]));
    } catch (err) {
      console.error('The pictures could not be added', err);
      addMessage.replaceChildren(h('p', {}, "The pictures couldn't be added in this browser window."));
      await reread();
    }
    addButton.disabled = false;
    draw();
  });

  const printAll = (h('button', { type: 'button', class: 'gu-button gu-primary', disabled: true,
    onClick: () => { printNew().catch((err) => console.error('The pages could not be printed', err)); } }, 'Print all new pages (0)'));
  const printMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const printNew = () => lock.run(async () => {
    if (!pages) return;
    const due = newlyEarned(pages);
    if (due.length === 0) return;
    printAll.disabled = true;
    printMessage.textContent = due.length === 1 ? 'Opening the print window for 1 page…' : `Opening the print window for ${due.length} pages…`;
    let job;
    try {
      job = await printLibraryPages(ctx, due);
    } catch (err) {
      console.error('The pages could not be printed', err);
      printMessage.textContent = "The pages couldn't be printed in this browser window.";
      draw();
      return;
    }
    if (job.ids.length === 0) {
      printMessage.textContent = "Those pages' pictures couldn't be found, so nothing was printed.";
      draw();
      return;
    }
    if (!job.printed) {
      printMessage.textContent = "The print window didn't open, so no page was marked Printed. Try again.";
      draw();
      return;
    }
    try {
      const kept = await notePrinted(ctx, job.ids, ctx.day);
      if (!kept) throw new Error('Another window plays');
      pages = kept;
      printMessage.textContent = job.ids.length === 1 ? 'Printed 1 page. It is marked Printed below.' : `Printed ${job.ids.length} pages. They are marked Printed below.`;
    } catch (err) {
      console.error('The printed pages could not be marked', err);
      printMessage.textContent = NOT_SAVED;
      await reread();
    }
    draw();
  });
  const strip = h('div', { class: 'gu-segmented', role: 'group', 'aria-label': SETTING_HELP.printWords.label });
  const drawStrip = () => strip.replaceChildren(...[[true, 'On'], [false, 'Off']].map(([value, label]) => h('button', {
    type: 'button', class: 'gu-choice', 'aria-pressed': String(ctx.settings.printWords === value),
    onClick: () => { setStrip( (value)); },
  }, label)));
  const setStrip = async (value) => {
    ctx.settings = updateSetting(ctx.settings, 'printWords', value);
    drawStrip();
    try {
      await ctx.save();
      saved.textContent = 'Saved.';
    } catch (err) {
      console.error('The strip setting could not be saved', err);
      saved.textContent = NOT_SAVED;
    }
  };
  drawStrip();

  const note = h('p', { class: 'gu-hint' });
  const list = h('ol', { class: 'gu-pages' }, h('li', { class: 'gu-empty' }, 'Reading the pages…'));

  const move = (id, dir) => lock.run(async () => {
    if (!pages) return;
    const next = movePage(pages, id, dir);
    if (next === pages) return;
    try {
      if (!(await keepPages(ctx, next))) throw new Error('Another window plays');
      pages = next;
      saved.textContent = 'Saved.';
    } catch (err) {
      console.error('The page order could not be saved', err);
      saved.textContent = NOT_SAVED;
      await reread();
    }
    draw();
  });

  const remove = (id) => lock.run(async () => {
    if (!pages) return;
    deleting = null;
    try {
      pages = await removePage(ctx.store, pages, id);
      syncWaitingList();
      saved.textContent = 'Page deleted.';
    } catch (err) {
      console.error('The page could not be deleted', err);
      saved.textContent = "The page couldn't be deleted in this browser window.";
      await reread();
    }
    draw();
  });

  const thumb = (page) => {
    const img = (h('img', { class: 'gu-thumb', alt: '', draggable: 'false' }));
    if (page.source === 'story') {
      const art = (Array.isArray(ctx.content.colorin) ? ctx.content.colorin : []).find(( c) => c?.id === page.id)?.svg;
      if (typeof art === 'string') img.src = `assets/art/${art}.svg`;
      return img;
    }
    if (page.source === 'made') {
      const shown = drawn.get(page.id);
      if (shown) {
        img.src = shown;
        return img;
      }
      ctx.readParts().then(( read) => {
        if (!live) return;
        if (!drawn.has(page.id)) drawn.set(page.id, pageUrl( (page.recipe), read));
        img.src = (drawn.get(page.id));
      }).catch(( err) => console.error(`The picture of ${page.id} could not be drawn`, err));
      return img;
    }
    const known = urls.get(page.id);
    if (known) {
      img.src = known;
      return img;
    }
    Promise.resolve(ctx.store.getBlob(pageBlobId(page.id))).then(( blob) => {
      if (!live || !(blob instanceof Blob) || !pages?.some((p) => p.id === page.id)) return;
      if (!urls.has(page.id)) urls.set(page.id, URL.createObjectURL(blob));
      img.src = (urls.get(page.id));
    }).catch(( err) => console.error(`The picture of ${page.id} could not be read`, err));
    return img;
  };

  const row = (page, queue) => {
    const status = pageStatus(page);
    const at = queue.indexOf(page);
    const actions = page.source !== 'family' ? [] : [
      ...(at < 0 ? [] : [
        h('button', { type: 'button', class: 'gu-button gu-move', 'aria-label': 'Move up', disabled: at === 0, onClick: () => { move(page.id, -1); } }, '▲'),
        h('button', { type: 'button', class: 'gu-button gu-move', 'aria-label': 'Move down', disabled: at === queue.length - 1, onClick: () => { move(page.id, 1); } }, '▼'),
      ]),
      h('button', { type: 'button', class: 'gu-button', onClick: () => { deleting = page.id; draw(); } }, 'Delete'),
    ];
    const confirm = deleting !== page.id ? null : h('div', { class: 'gu-confirm' },
      h('p', {}, isEarned(page) ? "Delete this page? Her coloring of it goes too, and it can't be undone." : "Delete this page? It can't be undone."),
      h('div', { class: 'gu-row' },
        h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { remove(page.id); } }, 'Delete it'),
        h('button', { type: 'button', class: 'gu-button', onClick: () => { deleting = null; draw(); } }, 'Keep it')));
    return h('li', { class: 'gu-page', 'data-page': page.id },
      h('div', { class: 'gu-page-row' },
        thumb(page),
        h('div', { class: 'gu-page-text' },
          h('span', { class: 'gu-page-name' }, page.source === 'story' ? `${page.name} (a built-in page)` : page.name),
          h('span', { class: ['gu-chip', status.kind] }, status.label)),
        h('div', { class: 'gu-page-actions' }, actions)),
      confirm);
  };

  const draw = () => {
    if (!live || !pages) return;
    const shown = listOrder(pages);
    const queue = waitingQueue(pages);
    note.textContent = nextPageNote(pages);
    const due = newlyEarned(pages).length;
    printAll.textContent = `Print all new pages (${due})`;
    printAll.disabled = due === 0;
    list.replaceChildren(...(shown.length > 0 ? shown.map((page) => row(page, queue)) : [h('li', { class: 'gu-empty' }, 'No pages yet.')]));
    for (const [id, url] of urls) {
      if (pages.some((p) => p.id === id)) continue;
      URL.revokeObjectURL(url);
      urls.delete(id);
    }
  };

  pagesNow(ctx).then((read) => {
    if (!live) return;
    pages = read;
    addButton.disabled = false;
    draw();
  }).catch((err) => {
    console.error('The coloring pages could not be read', err);
    list.replaceChildren(h('li', { class: 'gu-empty' }, "The pages couldn't be read in this browser window, so they can't be changed here. Reload the page to try again."));
  });

  body.append(
    saved,
    h('p', {}, 'Each day she finishes her adventure earns her one coloring page, however the day went. The game makes it from the story she read, with things from the words she has read and the words of her day printed along the bottom, and she can change it. The first of your pages waiting below is one more choice; the others wait their turn.'),
    h('section', { class: 'gu-setting', 'data-section': 'add' },
      h('h2', { class: 'gu-setting-label' }, 'Add pages'),
      h('p', { class: 'gu-help' }, 'Add your own pictures to color: PNG, JPEG or WebP. You can pick several at once; they go at the end of the queue.'),
      addButton, input, addMessage),
    h('section', { class: 'gu-setting', 'data-section': 'print' },
      h('h2', { class: 'gu-setting-label' }, 'Print new pages'),
      h('p', { class: 'gu-help' }, 'Prints every page she has earned and not printed yet, blank, in one go, one page to a sheet. To print a page as she has colored it, use Hold to print in the color-in room.'),
      printAll, printMessage),
    h('section', { class: 'gu-setting', 'data-section': 'strip' },
      h('h2', { class: 'gu-setting-label' }, SETTING_HELP.printWords.label),
      h('p', { class: 'gu-help' }, SETTING_HELP.printWords.help),
      strip),
    h('section', { class: 'gu-setting', 'data-section': 'pages' },
      h('h2', { class: 'gu-setting-label' }, 'Her pages'),
      note,
      list));
  return () => {
    live = false;
    for (const url of urls.values()) URL.revokeObjectURL(url);
    urls.clear();
  };
}

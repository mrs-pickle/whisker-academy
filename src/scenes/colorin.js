import { h } from '../core/dom.js';
import { createArrivalGuard, createLock } from '../core/lock.js';
import { composePage } from '../engine/page-recipe.js';
import { pageBlobId, pageFillKey, pagesNow, storyFillKey } from '../profile/pages.js';
import { newProfile } from '../profile/profile.js';
import { artUrl, bigButton, holdToActivate, kittenBubble, layeredArt } from '../ui/components.js';
import { ERASE_COLOR, cleanOps, fillRegion, lineMask, paintOf, replayFills } from '../ui/floodfill.js';
import { pageUrl } from '../ui/page-parts.js';
import { notePrinted, printOptions, printPages } from '../ui/print-pages.js';
import { castArt } from '../ui/story-stage.js';


export const COLORIN_LINES = Object.freeze({ pick: 'colorin.pick', start: 'colorin.start', empty: 'colorin.empty' });

const STARTER_CRAYONS = Object.freeze(newProfile().unlocked.crayons.map((c) => c.toLowerCase()));
export const ERASER = 'eraser';
const CRAYON = /^#[0-9a-f]{6}$/i;
const FILL_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
const REGION = /^r\d+$/;
const PAGE_SVG = /^colorin\/[a-z0-9-]+$/;
const FAMILY = 'family:';
const MADE = 'made:';




export const fillsKey = (pageId) => storyFillKey(pageId);

export const fillsKeyFamily = (id) => pageFillKey(id);

export const familyPageParam = (id) => FAMILY + id;

export const pageParam = (page) => (page.source === 'family' ? familyPageParam(page.id) : page.source === 'made' ? MADE + page.id : page.id);

export function applyFill(fills, pageId, region, color) {
  return { ...fills, [region]: color };
}

export function cleanFills(value) {
  const fills = {};
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return fills;
  for (const [region, color] of Object.entries(value)) {
    if (REGION.test(region) && typeof color === 'string' && FILL_COLOR.test(color)) fills[region] = color.toLowerCase();
  }
  return fills;
}


export function createColoring(pageId, saved) {
  let fills = cleanFills(saved);
  const past = [];
  return {
    fills: () => fills,
    fill(region, color) {
      if (fills[region] === color) return false;
      past.push(fills);
      fills = applyFill(fills, pageId, region, color);
      return true;
    },
    erase(region) {
      if (!Object.hasOwn(fills, region)) return false;
      past.push(fills);
      const { [region]: _gone, ...rest } = fills;
      fills = rest;
      return true;
    },
    undo() {
      const before = past.pop();
      if (!before) return false;
      fills = before;
      return true;
    },
    canUndo: () => past.length > 0,
  };
}

export function crayonList(profile) {
  const kept = profile?.unlocked?.crayons;
  const colors = (Array.isArray(kept) ? kept : []).filter((c) => typeof c === 'string' && CRAYON.test(c)).map((c) => c.toLowerCase());
  return colors.length > 0 ? [...new Set(colors)] : [...STARTER_CRAYONS];
}

export const crayonArt = (hex) => (STARTER_CRAYONS.includes(hex) ? `ui/crayon-${hex.slice(1)}` : null);

export function unlockedPages(colorin, profile) {
  const kept = profile?.unlocked?.colorin;
  const have = new Set(Array.isArray(kept) ? kept : []);
  return pageList(colorin).filter((page) => have.has(page.id));
}

const pageList = (colorin) => (Array.isArray(colorin) ? colorin : [])
  .filter((page) => typeof page?.id === 'string' && typeof page.svg === 'string' && PAGE_SVG.test(page.svg));

export function galleryPages(colorin, profile, library) {
  const list = Array.isArray(library) ? library : [];
  const kept = profile?.unlocked?.colorin;
  const unlocked = Array.isArray(kept) ? kept : [];
  const shown = [];
  const earnedStory = new Set(list.filter((p) => p.source === 'story' && Number.isFinite(p.earnedDay)).map((p) => p.id));
  const have = new Set(unlocked);
  for (const page of pageList(colorin).filter((p) => have.has(p.id) || earnedStory.has(p.id))) {
    const day = list.find((p) => p.source === 'story' && p.id === page.id)?.earnedDay;
    shown.push({ page: { source: 'story', id: page.id, page }, day: Number.isFinite(day) ? (day) : -Infinity, rank: unlocked.indexOf(page.id) });
  }
  for (const meta of list) {
    if (meta.source === 'story' || !Number.isFinite(meta.earnedDay)) continue;
    shown.push({ page: { source: meta.source, id: meta.id, meta }, day: (meta.earnedDay), rank: meta.order });
  }
  return shown.sort((a, b) => (a.day === b.day ? b.rank - a.rank : b.day - a.day)).map((s) => s.page);
}

export function askedPage(param, colorin, library) {
  if (typeof param !== 'string') return undefined;
  for (const [prefix, source] of ([[FAMILY, 'family'], [MADE, 'made']])) {
    if (!param.startsWith(prefix)) continue;
    const id = param.slice(prefix.length);
    const meta = (Array.isArray(library) ? library : []).find((p) => p.source === source && p.id === id);
    return meta ? { source, id, meta } : undefined;
  }
  const page = pageList(colorin).find((p) => p.id === param);
  return page ? { source: 'story', id: page.id, page } : undefined;
}

const PAGE_AREA = Object.freeze({ left: 176, top: 8, width: 1024, height: 640 });

export function fitPage(width, height) {
  const scale = Math.min(PAGE_AREA.width / width, PAGE_AREA.height / height);
  const wide = Math.round(width * scale);
  const tall = Math.round(height * scale);
  return { left: PAGE_AREA.left + Math.round((PAGE_AREA.width - wide) / 2), top: PAGE_AREA.top + Math.round((PAGE_AREA.height - tall) / 2), width: wide, height: tall };
}


const ROW = 20;
const ERASER_SLOTS = 2;
const CARD = Object.freeze({ width: 280, height: 175 });





export async function readFills(store, key) {
  try {
    return { saved: await store.get(key), readable: true };
  } catch (err) {
    console.error(`The coloring under ${key} could not be read, so this visit's coloring is not saved`, err);
    return { saved: undefined, readable: false };
  }
}

const storyArt = (page) => ({
  id: page.id,
  text: () => globalThis.fetch(`assets/art/${page.svg}.svg`).then((response) => {
    if (!response.ok) throw new Error(`${page.svg}.svg: HTTP ${response.status}`);
    return response.text();
  }),
});

const madeArt = (ctx, meta) => ({ id: meta.id, text: async () => composePage( (meta.recipe), await ctx.readParts()) });

async function loadPage(ctx, page, doc) {
  const [text, { saved, readable }] = await Promise.all([page.text(), readFills(ctx.store, fillsKey(page.id))]);
  const parsed = new globalThis.DOMParser().parseFromString(text, 'image/svg+xml');
  if (parsed.documentElement.nodeName !== 'svg' || parsed.getElementsByTagName('parsererror').length > 0) {
    throw new Error(`The picture of ${page.id} is not a picture`);
  }
  const svg = (doc.importNode(parsed.documentElement, true));
  svg.classList.add('colorin-svg');
  const regions = new Map();
  for (const el of svg.querySelectorAll('[data-region]')) {
    const id = el.getAttribute('data-region') ?? '';
    if (REGION.test(id)) regions.set(id, { el, drawn: el.getAttribute('fill') ?? '#ffffff' });
  }
  const coloring = createColoring(page.id, saved);
  const paint = () => {
    const fills = coloring.fills();
    for (const [id, region] of regions) region.el.setAttribute('fill', fills[id] ?? region.drawn);
  };
  paint();
  return { svg, regions, coloring, paint, readable };
}


const canvasOf = (width, height, className) => (h('canvas', { class: className, width, height }));
const context2d = (canvas, options) => (canvas.getContext('2d', options));
const colorsImage = (picture) => new globalThis.ImageData(picture.layer, picture.width, picture.height);

async function loadFamilyPicture(ctx, meta) {
  const [blob, { saved, readable }] = await Promise.all([
    Promise.resolve(ctx.store.getBlob(pageBlobId(meta.id))),
    readFills(ctx.store, fillsKeyFamily(meta.id)),
  ]);
  if (!(blob instanceof Blob)) throw new Error(`The picture of ${meta.id} is not saved`);
  const bitmap = await globalThis.createImageBitmap(blob);
  const { width, height } = bitmap;
  const lines = canvasOf(width, height);
  const g = context2d(lines, { willReadFrequently: true });
  g.fillStyle = '#fff';
  g.fillRect(0, 0, width, height);
  g.drawImage(bitmap, 0, 0);
  bitmap.close();
  const mask = lineMask(g.getImageData(0, 0, width, height).data, width, height);
  const ops = cleanOps(saved, width, height);
  return { width, height, lines, mask, ops, layer: replayFills(width, height, mask, ops), readable };
}

function drawColored(target, picture) {
  const colors = canvasOf(picture.width, picture.height);
  context2d(colors).putImageData(colorsImage(picture), 0, 0);
  const g = context2d(target);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, target.width, target.height);
  g.drawImage(colors, 0, 0, target.width, target.height);
  g.globalCompositeOperation = 'multiply';
  g.drawImage(picture.lines, 0, 0, target.width, target.height);
  g.globalCompositeOperation = 'source-over';
}

async function familyCard(ctx, meta) {
  const picture = await loadFamilyPicture(ctx, meta);
  const scale = Math.min(1, (CARD.width * 2) / picture.width, (CARD.height * 2) / picture.height);
  const card = canvasOf(Math.max(1, Math.round(picture.width * scale)), Math.max(1, Math.round(picture.height * scale)), 'colorin-card-canvas');
  drawColored(card, picture);
  return card;
}

function crayonPicture(hex) {
  const own = crayonArt(hex);
  const img = h('img', { src: artUrl(own ?? 'ui/crayon'), alt: '', draggable: 'false' });
  return own ? h('span', { class: 'colorin-crayon-art' }, img)
    : h('span', { class: 'colorin-crayon-art gift-crayon', style: { '--crayon': hex } }, img);
}

const eraserPicture = () => h('span', { class: 'colorin-eraser-art', 'aria-hidden': 'true' });

function printButton(onHeld) {
  const button = h('button', { type: 'button', class: 'colorin-print', 'aria-label': 'Print this page: grown-ups, hold for 3 seconds' },
    h('span', { class: 'colorin-print-fill', 'aria-hidden': 'true' }),
    h('span', { class: 'colorin-print-label' }, 'Hold to print'));
  return { button, ...holdToActivate(button, onHeld) };
}

const STORY_PAGE = Object.freeze({ w: 1280, h: 800 });

function printableBlob(blob, w, h) {
  const src = URL.createObjectURL(blob);
  return { src, w, h, release: () => URL.revokeObjectURL(src) };
}

const storyPrintable = (svg) => printableBlob(new Blob([new globalThis.XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml' }), STORY_PAGE.w, STORY_PAGE.h);

async function familyPrintable(picture) {
  const sheet = canvasOf(picture.width, picture.height);
  drawColored(sheet, picture);
  const blob = await new Promise((resolve) => sheet.toBlob(resolve, 'image/png'));
  if (!(blob instanceof Blob)) throw new Error('The colored page could not be drawn for printing');
  return printableBlob(blob, picture.width, picture.height);
}

async function printShown(room, page, view) {
  const meta = room.library.find((p) => p.source === page.source && p.id === page.id);
  const shown = await view.printable();
  let printed;
  try {
    printed = await printPages([{ src: shown.src, w: shown.w, h: shown.h, words: meta?.words ?? [] }], { doc: room.doc, ...printOptions(room.ctx) });
  } finally {
    shown.release();
  }
  if (meta && printed) await notePrinted(room.ctx, [meta.id], room.ctx.day);
}

const toolButton = ({ label, icon, onClick, className }) => h('button', { type: 'button', class: ['colorin-tool', className], onClick },
  icon, h('span', { class: 'colorin-tool-label' }, label));

function pagesIcon(room, page) {
  const img = (h('img', { class: 'colorin-pages-icon', alt: '', draggable: 'false' }));
  if (page.source === 'story') {
    img.src = `assets/art/${page.page.svg}.svg`;
    return img;
  }
  const { meta } = page;
  if (meta.source === 'made') {
    room.ctx.readParts().then(( parts) => {
      if (room.live()) img.src = pageUrl( (meta.recipe), parts);
    }).catch(( err) => console.error(`The picture of ${page.id} could not be drawn`, err));
    return img;
  }
  Promise.resolve(room.ctx.store.getBlob(pageBlobId(page.id))).then(( blob) => {
    if (!room.live() || !(blob instanceof Blob)) return;
    const url = URL.createObjectURL(blob);
    room.onExit(() => URL.revokeObjectURL(url));
    img.src = url;
  }).catch(( err) => console.error(`The picture of ${page.id} could not be read`, err));
  return img;
}

const backButton = (room) => bigButton({ label: 'Back', icon: 'ui/door-button', onClick: () => room.go('hub') });

async function showStoryPage(room, page, { sheet, crayon, canUndo }) {
  const loaded = await loadPage(room.ctx, page, room.doc);
  if (!room.live()) return null;
  const persist = () => {
    canUndo(loaded.coloring.canUndo());
    if (!loaded.readable) return;
    Promise.resolve(room.ctx.store.set(fillsKey(page.id), loaded.coloring.fills()))
      .catch(( err) => console.error('The coloring could not be saved', err));
  };
  loaded.svg.addEventListener('click', (event) => {
    if (!room.arrival.allows(event)) return;
    const target = (event.target);
    const id = target?.closest?.('[data-region]')?.getAttribute('data-region');
    if (!id || !loaded.regions.has(id)) return;
    const held = crayon();
    if (!(held === ERASER ? loaded.coloring.erase(id) : loaded.coloring.fill(id, held))) return;
    loaded.paint();
    persist();
  });
  sheet.append(loaded.svg);
  return {
    undo() {
      if (!loaded.coloring.undo()) return;
      loaded.paint();
      persist();
    },
    printable: async () => storyPrintable(loaded.svg),
  };
}

async function showFamilyPage(room, meta, { sheet, crayon, canUndo }) {
  const picture = await loadFamilyPicture(room.ctx, meta);
  if (!room.live()) return null;
  const { width, height, mask, ops } = picture;
  const fit = fitPage(width, height);
  sheet.classList.add('family');
  Object.assign(sheet.style, { left: `${fit.left}px`, top: `${fit.top}px`, width: `${fit.width}px`, height: `${fit.height}px` });
  const colors = canvasOf(width, height, 'colorin-family-colors');
  const paint = () => context2d(colors).putImageData(colorsImage(picture), 0, 0);
  picture.lines.classList.add('colorin-family-lines');
  let made = 0;
  const persist = () => {
    canUndo(made > 0);
    if (!picture.readable) return;
    Promise.resolve(room.ctx.store.set(fillsKeyFamily(meta.id), [...ops]))
      .catch(( err) => console.error('The coloring could not be saved', err));
  };
  const area = h('div', { class: 'colorin-family', onClick: ( event) => {
    if (!room.arrival.allows(event)) return;
    const box = area.getBoundingClientRect();
    const x = Math.min(width - 1, Math.max(0, Math.floor(((event.clientX - box.left) / box.width) * width)));
    const y = Math.min(height - 1, Math.max(0, Math.floor(((event.clientY - box.top) / box.height) * height)));
    const held = crayon();
    const color = held === ERASER ? ERASE_COLOR : held;
    const rgba = paintOf(color);
    if (!rgba || fillRegion(picture.layer, mask, width, height, x, y, rgba) === 0) return;
    ops.push({ x, y, color });
    made++;
    paint();
    persist();
  } }, colors, picture.lines);
  paint();
  sheet.append(area);
  return {
    undo() {
      if (made === 0) return;
      ops.pop();
      made--;
      picture.layer = replayFills(width, height, mask, ops);
      paint();
      persist();
    },
    printable: () => familyPrintable(picture),
  };
}

const regionsOf = (ctx, page) => (page.source === 'story' ? storyArt(page.page) : madeArt(ctx, page.meta));

function showPage(room, page, others) {
  const { ctx, root } = room;
  const colors = crayonList(ctx.profile);
  let crayon = colors[0];
  let view = null;
  const sheet = h('div', { class: 'colorin-sheet' });
  const crayons = [];
  const pick = (held, button) => {
    crayon = held;
    for (const c of crayons) c.setAttribute('aria-pressed', String(c === button));
    button.classList.remove('pop');
    void button.offsetWidth;
    button.classList.add('pop');
  };
  for (const hex of colors) {
    const button = h('button', { type: 'button', class: 'colorin-crayon', 'aria-label': `Crayon ${hex}`, 'aria-pressed': String(hex === crayon),
      'data-color': hex, onClick: () => pick(hex, button) }, crayonPicture(hex));
    crayons.push(button);
  }
  const eraser = h('button', { type: 'button', class: 'colorin-crayon colorin-eraser', 'aria-label': 'Eraser', 'aria-pressed': 'false',
    onClick: () => pick(ERASER, eraser) }, eraserPicture());
  crayons.push(eraser);
  const undo = (toolButton({ label: 'Undo', icon: h('span', { class: 'colorin-undo-icon', 'aria-hidden': 'true' }),
    className: 'colorin-undo', onClick: () => view?.undo() }));
  undo.disabled = true;
  const printing = createLock();
  const print = printButton(() => {
    const shown = view;
    if (!shown) return;
    printing.run(() => printShown(room, page, shown)).catch((err) => console.error(`The page ${page.id} could not be printed`, err));
  });
  room.onExit(print.cancel);

  root.append(
    h('div', { class: 'colorin-tools' },
      undo,
      toolButton({ label: 'Pages', icon: pagesIcon(room, others[0] ?? page), onClick: () => room.go('colorin') }),
      toolButton({ label: 'Back', icon: h('img', { src: artUrl('ui/door-button'), alt: '', draggable: 'false' }), onClick: () => room.go('hub') }),
      print.button),
    sheet,
    h('div', { class: ['colorin-tray', colors.length + ERASER_SLOTS > ROW && 'two-rows'], role: 'group', 'aria-label': 'Crayons' }, crayons));

  const host = { sheet, crayon: () => crayon, canUndo: (yes) => { undo.disabled = !yes; } };
  (page.source === 'family' ? showFamilyPage(room, page.meta, host) : showStoryPage(room, regionsOf(ctx, page), host))
    .then((shown) => {
      view = shown;
      if (shown) ctx.say(COLORIN_LINES.start);
    })
    .catch((err) => console.error(`The page ${page.id} could not be shown`, err));
}

function showGallery(room, pages) {
  const { ctx, root } = room;
  let drawing = Promise.resolve();
  const waiting = new Map();
  const draw = (p, frame) => {
    const show = (picture) => { if (room.live()) frame.append(picture); };
    const failed = (err) => console.error(`The page ${p.id} could not be shown`, err);
    if (p.source !== 'family') loadPage(ctx, regionsOf(ctx, p), room.doc).then(({ svg }) => show(svg)).catch(failed);
    else {
      const { meta } = p;
      drawing = drawing.then(() => (room.live() ? familyCard(ctx, meta).then(show) : undefined)).catch(failed);
    }
  };
  const cardFor = (p) => {
    const frame = h('span', { class: 'colorin-card-picture' });
    const param = p.source === 'story' ? p.id : pageParam(p.meta);
    const card = h('button', { type: 'button', class: 'colorin-card', 'aria-label': p.source === 'story' ? p.page.title ?? p.id : 'Coloring page', 'data-page': param,
      onClick: ( event) => { if (room.arrival.allows(event)) room.go('colorin', { page: param }); } }, frame);
    waiting.set(card, () => draw(p, frame));
    return card;
  };
  const grid = h('div', { class: 'colorin-pages colorin-shelf', role: 'group', 'aria-label': 'My coloring pages' }, pages.map(cardFor));
  root.append(grid, h('div', { class: 'colorin-leave' }, backButton(room)));
  const drawCard = (card) => {
    const start = waiting.get(card);
    waiting.delete(card);
    start?.();
  };
  const Observer = globalThis.IntersectionObserver;
  if (typeof Observer === 'function') {
    const seen = new Observer((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        seen.unobserve(entry.target);
        drawCard(entry.target);
      }
    }, { root: grid, rootMargin: '240px 0px' });
    for (const card of waiting.keys()) seen.observe(card);
    room.onExit(() => seen.disconnect());
  } else {
    for (const card of [...waiting.keys()]) drawCard(card);
  }
  ctx.say(COLORIN_LINES.pick);
}

function showEmpty(room) {
  const { ctx, root } = room;
  const bubble = h('div', { class: 'colorin-empty-bubble' }, kittenBubble({ lineId: COLORIN_LINES.empty }));
  root.append(
    h('div', { class: 'colorin-empty' },
      h('div', { class: 'colorin-blank', 'aria-hidden': 'true' }),
      h('div', { class: 'colorin-empty-kitten' }, layeredArt(castArt('kitten', ctx.profile?.look, 'sit')), bubble)),
    h('div', { class: 'colorin-leave' }, backButton(room)));
  ctx.say(COLORIN_LINES.empty).then(() => bubble.remove());
}

export function mount(el, ctx, params = {}) {
  const lock = createLock();
  let live = true;
  const exits = [];
  const root = h('div', { class: 'colorin' }, h('img', { class: 'scene-bg', src: artUrl('bg/colorin'), alt: '' }));
  el.append(root);
  const room = {
    ctx,
    root,
    doc: el.ownerDocument,
    go: (name, p) => {
      lock.run(() => ctx.router.go(name, p)).catch(( err) => console.error(`The color-in room could not open "${name}"`, err));
    },
    arrival: createArrivalGuard(),
    live: () => live,
    onExit: (fn) => { exits.push(fn); },
    library: [],
  };

  Promise.resolve().then(() => pagesNow(ctx)).catch(( err) => {
    console.error('The coloring pages could not be read', err);
    return [];
  }).then((library) => {
    if (!live) return;
    room.library = library;
    const pages = galleryPages(ctx.content?.colorin, ctx.profile, library);
    const page = askedPage(params.page, ctx.content?.colorin, library);
    if (page) showPage(room, page, pages.filter((p) => p.source !== page.source || p.id !== page.id));
    else if (pages.length > 0) showGallery(room, pages);
    else showEmpty(room);
  }).catch(( err) => console.error('The color-in room could not be shown', err));
  return () => {
    live = false;
    for (const exit of exits) exit();
  };
}

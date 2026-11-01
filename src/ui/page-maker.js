import { h } from '../core/dom.js';
import { MAX_CAST, MAX_THINGS, toggleCast, toggleThing, withPlace } from '../engine/page-recipe.js';
import { chooseDayPage, keepPages, pageBlobId, pagesNow } from '../profile/pages.js';
import { artUrl, nextButton } from './components.js';
import { pageUrl, partUrl } from './page-parts.js';





const PLACE_NAMES = Object.freeze({ door: 'The castle door', hall: 'The great hall', hub: 'The castle meadow', kitchen: 'The kitchen', toyroom: 'The toy room', workshop: 'The workshop' });

export function tileName(kind, id) {
  const person = (name) => name.charAt(0).toUpperCase() + name.slice(1);
  if (kind === 'place') return PLACE_NAMES[ (id)] ?? id;
  if (kind === 'cast') return id === 'ted-dot-hearts' ? 'Ted and Dot' : person(id.split('-')[0]);
  return id;
}

export function createPageMaker(ctx, page, { options, choices, family, parts }, { root, table, actions, say, said, onExit, live }) {
  const day = (page.earnedDay);
  const words = page.words ?? [];
  const recipes = [...options];
  const FAMILY = recipes.length;
  let chosen = 0;
  let familyUrl = '';
  let told = false;
  let release = null;
  let closing = Promise.resolve();
  let saving = Promise.resolve();

  const keep = () => {
    const choice = family && chosen === FAMILY ? { family: family.id } : { recipe: recipes[chosen] };
    saving = saving.then(async () => {
      if (!(await keepPages(ctx, chooseDayPage(await pagesNow(ctx), day, choice, words)))) throw new Error('Another window plays');
    }).catch((err) => console.error('The page could not be saved', err));
  };

  const tilePicture = (src) => (h('img', { src, alt: '', draggable: 'false' }));
  const pictures = recipes.map((recipe) => tilePicture(pageUrl(recipe, parts)));
  const tiles = pictures.map((picture, i) => h('button', { type: 'button', class: 'page-option', 'aria-label': `Page ${i + 1}`, 'aria-pressed': 'false',
    onClick: () => press(i) }, picture));
  if (family) {
    const picture = (h('img', { alt: '', draggable: 'false' }));
    const tile = h('button', { type: 'button', class: 'page-option', 'aria-label': 'A picture from home', 'aria-pressed': 'false', onClick: () => press(FAMILY) },
      picture, h('img', { class: 'page-option-star', src: artUrl('ui/sparkle'), alt: '', draggable: 'false' }));
    tiles.push(tile);
    Promise.resolve(ctx.store.getBlob(pageBlobId(family.id))).then(( blob) => {
      if (!live()) return;
      if (!(blob instanceof Blob)) { tile.remove(); return; }
      familyUrl = URL.createObjectURL(blob);
      onExit(() => URL.revokeObjectURL(familyUrl));
      picture.src = familyUrl;
    }).catch(( err) => console.error(`The picture of ${family.id} could not be read`, err));
  }

  const art = (h('img', { class: 'page-big-art', alt: '', draggable: 'false' }));
  const tools = h('div', { class: 'page-big-tools' });
  const row = (kind, name, ids, tap) => h('div', { class: ['page-row', kind], role: 'group', 'aria-label': name },
    ids.map((id) => h('button', { type: 'button', class: 'page-tile', 'data-part': id, 'aria-label': tileName(kind, id), 'aria-pressed': 'false',
      onClick: () => change(tap(recipes[chosen], id)) }, h('img', { src: partUrl(`${kind}-${id}`), alt: '', draggable: 'false' }))));
  const rows = {
    place: row('place', 'Where', choices.places, withPlace),
    cast: row('cast', 'Who', choices.cast, toggleCast),
    thing: row('thing', 'Things', choices.things, toggleThing),
  };
  const changeRows = h('div', { class: 'page-rows' }, rows.place, rows.cast, rows.thing);
  const big = h('div', { class: 'page-big' }, art, tools, changeRows);

  const drawRows = () => {
    const recipe = recipes[chosen];
    const mark = (of, on, full) => {
      for (const tile of ([...of.querySelectorAll('.page-tile')])) {
        const pressed = on(tile.getAttribute('data-part') ?? '');
        tile.setAttribute('aria-pressed', String(pressed));
        tile.disabled = !pressed && full;
      }
    };
    mark(rows.place, (id) => id === recipe.place, false);
    mark(rows.cast, (id) => recipe.cast.includes(id), recipe.cast.length >= MAX_CAST);
    mark(rows.thing, (id) => recipe.things.includes(id), recipe.things.length >= MAX_THINGS);
  };
  const draw = () => {
    const isFamily = chosen === FAMILY;
    changeRows.hidden = isFamily;
    if (isFamily) {
      art.src = familyUrl;
      return;
    }
    art.src = pictures[chosen].src = pageUrl(recipes[chosen], parts);
    drawRows();
  };
  const change = (next) => {
    if (next === recipes[chosen]) return;
    recipes[chosen] = next;
    draw();
    keep();
  };
  const open = () => {
    if (release) return;
    const home = (actions.parentNode);
    const before = said();
    const opener = tiles[chosen];
    closing = new Promise((resolve) => {
      release = () => {
        release = null;
        next.remove();
        big.remove();
        home.append(actions);
        table.inert = false;
        ctx.audio.stop();
        ctx.setReplay(before);
        opener.focus();
        resolve(undefined);
      };
    });
    const next = nextButton({ onNext: () => release?.() });
    tools.append(actions);
    big.append(next);
    root.append(big);
    table.inert = true;
    const lines = chosen === FAMILY ? ['v.spell.next'] : ['v.reward.change', 'v.spell.next'];
    ctx.setReplay(lines);
    if (!told || chosen === FAMILY) say(lines).catch((err) => console.error('The reward could not say how to change the page', err));
    told ||= chosen !== FAMILY;
  };
  const press = (i) => {
    chosen = i;
    tiles.forEach((tile, k) => tile.setAttribute('aria-pressed', String(k === i)));
    keep();
    draw();
    open();
  };

  return {
    tiles: h('div', { class: 'page-options', role: 'group', 'aria-label': 'Pick your page' }, tiles),
    current: () => (family && chosen === FAMILY ? family : page),
    saved: () => saving,
    closed: () => closing,
  };
}

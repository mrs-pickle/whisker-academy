import { h } from '../core/dom.js';
import { createLock } from '../core/lock.js';
import { artUrl, bigButton, layeredArt } from '../ui/components.js';
import { castArt, LOOK_OPTIONS } from '../ui/story-stage.js';


export const DRESSUP_LINES = Object.freeze({ start: 'dressup.start', kitten: 'dressup.kitten', done: 'dressup.done' });

export const princessLayers = (look) => castArt('princess', look).map(artUrl);



const FUR_LABELS = Object.freeze({ orange: 'Orange kitten', gray: 'Gray kitten', black: 'Black kitten', calico: 'Calico kitten' });

export function dressupChoices(wardrobe, profile) {
  const kept = profile?.unlocked?.wardrobe;
  const owned = new Set(Array.isArray(kept) ? kept : []);
  const items = (Array.isArray(wardrobe) ? wardrobe : []).filter((w) =>
    typeof w?.id === 'string' && typeof w.slot === 'string' && (w.starter === true || owned.has(w.id)));
  const named = (id, label) => (typeof label === 'string' && label !== '' ? label : id);
  const slot = (name, field, value = (id) => id) => items.filter((w) => w.slot === name)
    .map((w) => ({ field, value: value(w.id), label: named(w.id, w.label) }));
  return {
    outfit: slot('outfit', 'outfit'),
    crown: slot('crown', 'crown', (id) => id.replace(/^crown-/, '')).filter((c) => LOOK_OPTIONS.crown.includes(c.value)),
    kittenFur: LOOK_OPTIONS.kittenFur.map((fur) => ({ field: 'kittenFur', value: fur, label: FUR_LABELS[fur] ?? fur })),
    kittenAcc: slot('kitten-acc', 'kittenAcc'),
  };
}

export const withLook = (profile, field, value) => ({ ...profile, look: { ...profile.look, [field]: value } });

export function dressUpButton(look, onClick) {
  return h('button', { type: 'button', class: 'big-button', onClick },
    layeredArt(castArt('princess', look), 'big-button-princess'), h('span', { class: 'big-button-label' }, 'Dress Up'));
}


const SWATCH = 104;

const CROPS = Object.freeze({
  outfit: { size: [400, 720], center: [185, 540], span: 340 },
  crown: { size: [400, 720], center: [185, 215], span: 250 },
  kittenFur: { size: [300, 300], center: [166, 165], span: 270 },
  kittenAcc: { size: [300, 300], center: [150, 80], span: 170 },
});

function swatchArt(choice, look) {
  if (choice.field === 'outfit') return [`wardrobe/${choice.value}`];
  if (choice.field === 'crown') return castArt('princess', { ...look, crown: choice.value });
  if (choice.field === 'kittenFur') return castArt('kitten', { kittenFur: choice.value, kittenAcc: '' });
  return castArt('kitten', { ...look, kittenAcc: choice.value });
}

function swatchPicture(choice, ids) {
  const { size: [w, hgt], center: [cx, cy], span } = CROPS[choice.field];
  const scale = SWATCH / span;
  const art = layeredArt(ids, 'dressup-swatch-art');
  art.style.width = `${w * scale}px`;
  art.style.height = `${hgt * scale}px`;
  art.style.left = `${SWATCH / 2 - cx * scale}px`;
  art.style.top = `${SWATCH / 2 - cy * scale}px`;
  return art;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DONE_MAX_MS = 3500;
const SPARKLE_MS = 900;

export function mount(el, ctx, params = {}) {
  const back = params?.from === 'session' ? 'session' : 'hub';
  const lock = createLock();
  let live = true;
  const look = () => (ctx.profile?.look ?? {});

  const princess = h('div', { class: 'dressup-princess' });
  const kitten = h('div', { class: 'dressup-kitten' });
  const swatches = [];

  const draw = () => {
    princess.replaceChildren(layeredArt(castArt('princess', look())));
    kitten.replaceChildren(layeredArt(castArt('kitten', look(), 'sit')));
    for (const { choice, button, frame } of swatches) {
      button.setAttribute('aria-pressed', String(look()[choice.field] === choice.value));
      const ids = swatchArt(choice, look());
      if (frame.dataset.ids === ids.join(' ')) continue;
      frame.dataset.ids = ids.join(' ');
      frame.replaceChildren(swatchPicture(choice, ids));
    }
  };

  const sparkle = (who) => {
    const star = h('img', { class: 'sparkle-pop dressup-sparkle', src: artUrl('ui/sparkle'), alt: '', draggable: 'false' });
    who.append(star);
    setTimeout(() => star.remove(), SPARKLE_MS);
  };

  const pick = (choice, button) => {
    if (!live) return;
    button.classList.remove('pop');
    void button.offsetWidth;
    button.classList.add('pop');
    if (look()[choice.field] === choice.value) return;
    ctx.profile = withLook(ctx.profile, choice.field, choice.value);
    draw();
    sparkle(choice.field === 'outfit' || choice.field === 'crown' ? princess : kitten);
    ctx.save().catch(( err) => console.error('The new look could not be saved', err));
  };

  const group = (choices, name) => h('div', { class: ['dressup-group', `dressup-${name}`] },
    choices.map((choice) => {
      const frame = h('span', { class: 'dressup-swatch-frame' });
      const button = h('button', { type: 'button', class: 'dressup-swatch', 'aria-label': choice.label, 'aria-pressed': 'false',
        'data-field': choice.field, 'data-value': choice.value, onClick: () => pick(choice, button) }, frame);
      swatches.push({ choice, button, frame });
      return button;
    }));

  const choices = dressupChoices(ctx.content?.wardrobe, ctx.profile);
  const leave = () => {
    lock.run(async () => {
      await Promise.race([ctx.say(DRESSUP_LINES.done), wait(DONE_MAX_MS)]);
      if (live) await ctx.router.go(back);
    }).catch(( err) => console.error(`The dress-up room could not go back to the ${back === 'hub' ? 'castle' : 'adventure'}`, err));
  };

  el.append(h('div', { class: 'dressup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/dressup'), alt: '' }),
    h('div', { class: 'dressup-panel dressup-panel-princess', role: 'group', 'aria-label': 'Princess clothes' },
      group(choices.outfit, 'outfits'), group(choices.crown, 'crowns')),
    princess,
    kitten,
    h('div', { class: 'dressup-panel dressup-panel-kitten', role: 'group', 'aria-label': 'Kitten things' },
      group(choices.kittenFur, 'furs'), group(choices.kittenAcc, 'accessories')),
    h('div', { class: 'dressup-leave' }, bigButton({ label: 'Back', icon: 'ui/door-button', onClick: leave }))));
  draw();

  const intro = [`v.${DRESSUP_LINES.start}`, `v.${DRESSUP_LINES.kitten}`];
  ctx.setReplay(intro);
  ctx.audio.playSeq(intro);
  return () => { live = false; };
}

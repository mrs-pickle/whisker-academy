import { h } from '../core/dom.js';
import { newProfile } from '../profile/profile.js';
import { artUrl } from './components.js';

export const STAGE_EFFECTS = Object.freeze(['vex-slip', 'vex-bonk', 'crow-flap', 'item-pop', 'float', 'shrink', 'sparkle', 'ring-found', 'kitten-cheer', 'bounce']);


const DEFAULT_LOOK = Object.freeze(newProfile().look);
const SKINS = Object.freeze(['s1', 's2', 's3', 's4', 's5']);
const HAIRS = Object.freeze(['long', 'curly', 'bun']);
const HAIR_COLORS = Object.freeze(['brown', 'black', 'blonde', 'red']);
const CROWNS = Object.freeze(['gold', 'flower', 'book']);
const FURS = Object.freeze(['orange', 'gray', 'black', 'calico']);
export const LOOK_OPTIONS = Object.freeze({ skin: SKINS, hair: HAIRS, hairColor: HAIR_COLORS, crown: CROWNS, kittenFur: FURS });
const OUTFIT = /^o-[a-z0-9-]+$/;
const KITTEN_ACC = /^k-[a-z0-9-]+$/;

const valid = (value, allowed, fallback) => {
  const ok = typeof value === 'string' && (Array.isArray(allowed) ? allowed.includes(value) : (allowed).test(value));
  return ok ? (value) : fallback;
};

const optional = (value, allowed, fallback) => (value === undefined ? fallback : valid(value, allowed, '') || null);

const isPrince = (look) => look?.hero === 'prince';

export const outfitArt = (id, look) => `${isPrince(look) ? 'prince' : 'wardrobe'}/${id}`;

export function castArt(id, look, pose = 'sit') {
  const l = look ?? DEFAULT_LOOK;
  if (id === 'princess') {
    const hero = isPrince(l) ? 'prince' : 'princess';
    const crown = optional(l.crown, CROWNS, DEFAULT_LOOK.crown);
    return [
      `${hero}/body-${valid(l.skin, SKINS, DEFAULT_LOOK.skin)}`,
      outfitArt(valid(l.outfit, OUTFIT, DEFAULT_LOOK.outfit), l),
      `${hero}/hair-${valid(l.hair, HAIRS, DEFAULT_LOOK.hair)}-${valid(l.hairColor, HAIR_COLORS, DEFAULT_LOOK.hairColor)}`,
      ...(crown ? [`${hero}/crown-${crown}`] : []),
    ];
  }
  if (id === 'kitten') {
    const acc = optional(l.kittenAcc, KITTEN_ACC, DEFAULT_LOOK.kittenAcc);
    return [`kitten/kitten-${valid(l.kittenFur, FURS, DEFAULT_LOOK.kittenFur)}-${pose}`, ...(acc ? [`wardrobe/${acc}`] : [])];
  }
  return [id.includes('/') ? id : `cast/${id}`];
}


const STAGE_W = 1280;
const STAGE_H = 800;
const SIZES = Object.freeze({ princess: [176, 317], kitten: [150, 150], cast: [196, 294] });
const LEFT_SLOTS = Object.freeze({ princess: 24, kitten: 178 });
const RIGHT_STEP = 192;
const PROP_SIZE = 168;
const PROP_SPOTS = Object.freeze([[556, 28], [380, 44], [732, 44]]);
const CENTER = Object.freeze({ x: 640, y: 560 });

const EFFECT_MS = Object.freeze({
  'vex-slip': 1500, 'vex-bonk': 1600, 'crow-flap': 1600, 'item-pop': 1000, float: 2400,
  shrink: 1300, sparkle: 1000, 'ring-found': 1800, 'kitten-cheer': 1300, bounce: 1600,
});
const POP_MS = 600;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const artId = (id, group) => (id.includes('/') ? id : `${group}/${id}`);

export const sceneArt = (bg) => artId(bg, 'bg');

const img = (src, className) => h('img', { class: className, src: artUrl(src), alt: '', draggable: 'false' });

function restart(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}



export function createStoryStage(el, { bg, cast, look }) {
  const castLayer = h('div', { class: 'story-cast-layer' });
  const propLayer = h('div', { class: 'story-prop-layer' });
  const overlay = h('div', { class: 'story-overlay', 'aria-hidden': 'true' });
  const root = h('div', { class: 'story-stage', 'aria-hidden': 'true' },
    img(sceneArt(bg), 'scene-bg'), castLayer, propLayer, overlay);
  el.append(root);
  const timers = new Set();
  let destroyed = false;
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); };
  const pause = (ms) => (destroyed ? Promise.resolve() : wait(ms));

  const actor = (id, art, box, className, style) => {
    const layers = (art.map(a => img(a)));
    const idle = h('div', { class: 'story-idle' }, layers);
    const fx = h('div', { class: 'story-fx' }, idle);
    return { id, art, box, layers, fx, el: h('div', { class: className, 'data-id': id, style }, fx) };
  };

  const actors = [];
  let right = 0;
  for (const [i, id] of (cast ?? []).entries()) {
    const [w, hgt] = id === 'princess' || id === 'kitten' ? SIZES[id] : SIZES.cast;
    const left = Object.hasOwn(LEFT_SLOTS, id) ? LEFT_SLOTS[ (id)] : null;
    const x = left ?? STAGE_W - 8 - right++ * RIGHT_STEP - w;
    const bottom = id === 'kitten' ? 8 : 4;
    const a = actor(id, castArt(id, look), { x, y: STAGE_H - bottom - hgt, w, h: hgt }, 'story-cast', {
      left: `${x}px`, bottom: `${bottom}px`, width: `${w}px`, height: `${hgt}px`, '--idle-delay': `${-900 * i}ms`,
    });
    actors.push(a);
    castLayer.append(a.el);
  }
  const castMember = (test) => actors.find(a => test(a.id)) ?? null;

  const props = new Map();
  let spots = 0;
  const ensureProp = (trick) => {
    const id = artId(trick, 'tricks');
    const had = props.get(id);
    if (had) return { prop: had, fresh: false };
    const n = spots++;
    const [x0, bottom] = PROP_SPOTS[n % PROP_SPOTS.length];
    const x = x0 + Math.floor(n / PROP_SPOTS.length) * 40;
    const prop = actor(id, [id], { x, y: STAGE_H - bottom - PROP_SIZE, w: PROP_SIZE, h: PROP_SIZE }, 'story-prop',
      { left: `${x}px`, bottom: `${bottom}px`, width: `${PROP_SIZE}px`, height: `${PROP_SIZE}px` });
    props.set(id, prop);
    propLayer.append(prop.el);
    return { prop, fresh: true };
  };

  const centerOf = (a) => (a ? { x: a.box.x + a.box.w / 2, y: a.box.y + a.box.h / 2 } : CENTER);

  const overlayAt = (node, at, size, removeAfter) => {
    Object.assign(node.style, { left: `${Math.round(at.x - size / 2)}px`, top: `${Math.round(at.y - size / 2)}px`, width: `${size}px`, height: `${size}px` });
    overlay.append(node);
    if (removeAfter !== null) later(() => node.remove(), removeAfter);
    return node;
  };

  const burst = (at) => {
    const spots5 = [[-80, -40], [70, -70], [90, 30], [-60, 60], [0, -110]];
    for (const [i, [dx, dy]] of spots5.entries()) {
      const s = overlayAt(img('ui/sparkle', 'fx-sparkle'), { x: at.x + dx, y: at.y + dy }, 76, EFFECT_MS.sparkle + 200);
      s.style.animationDelay = `${i * 80}ms`;
    }
  };

  const bubbles = (at) => {
    for (let i = 0; i < 6; i++) {
      const s = overlayAt(img('ui/sparkle', 'fx-rise'), { x: at.x - 100 + i * 40, y: at.y + (i % 2) * 30 }, 56, EFFECT_MS.float + 200);
      s.style.animationDelay = `${i * 140}ms`;
    }
  };

  const act = (a, cls, ms, { pose, keep = false, settle } = {}) => {
    if (pose) a.layers[0].src = artUrl(pose);
    a.el.classList.add('acting');
    restart(a.fx, cls);
    later(() => {
      settle?.();
      a.fx.classList.remove(cls);
      a.el.classList.remove('acting');
      if (pose && !keep) a.layers[0].src = artUrl(a.art[0]);
    }, ms);
  };

  const bring = async (trick) => {
    if (!trick) return null;
    const { prop, fresh } = ensureProp(trick);
    if (fresh) {
      act(prop, 'fx-item-pop', EFFECT_MS['item-pop']);
      await pause(POP_MS);
    }
    return prop;
  };

  const effects = {
    async 'vex-slip'(trick) {
      const prop = await bring(trick);
      const vex = castMember(id => id.startsWith('vex'));
      if (vex) act(vex, 'fx-vex-slip', EFFECT_MS['vex-slip'], { pose: vex.id === 'vex-wig' ? 'cast/vex-wig-slip' : 'cast/vex-slip', keep: true });
      else burst(centerOf(prop));
      await pause(EFFECT_MS['vex-slip']);
    },
    async 'vex-bonk'(trick) {
      const vex = castMember(id => id.startsWith('vex'));
      if (!vex) { await effects.sparkle(trick); return; }
      const head = { x: vex.box.x + vex.box.w / 2, y: vex.box.y + 40 };
      if (trick) {
        const id = artId(trick, 'tricks');
        props.get(id)?.el.remove();
        props.delete(id);
        overlayAt(img(id, 'fx-drop'), head, 130, EFFECT_MS['vex-bonk']);
      }
      const stars = overlayAt(h('div', { class: 'fx-stars' }, img('ui/sparkle'), img('ui/sparkle'), img('ui/sparkle')),
        { x: head.x, y: head.y - 10 }, 150, EFFECT_MS['vex-bonk']);
      stars.style.animationDelay = '550ms';
      act(vex, 'fx-vex-bonk', EFFECT_MS['vex-bonk']);
      await pause(EFFECT_MS['vex-bonk']);
    },
    async 'crow-flap'(trick) {
      const prop = await bring(trick);
      const gus = castMember(id => id.startsWith('gus'));
      if (gus) act(gus, 'fx-crow-flap', EFFECT_MS['crow-flap'], { pose: 'cast/gus-flap' });
      else burst(centerOf(prop));
      await pause(EFFECT_MS['crow-flap']);
    },
    async 'item-pop'(trick) {
      if (!trick) { burst(CENTER); await pause(EFFECT_MS['item-pop']); return; }
      const { prop } = ensureProp(trick);
      act(prop, 'fx-item-pop', EFFECT_MS['item-pop']);
      burst(centerOf(prop));
      await pause(EFFECT_MS['item-pop']);
    },
    async float(trick) {
      const prop = await bring(trick);
      if (prop) act(prop, 'fx-float', EFFECT_MS.float);
      else bubbles(CENTER);
      await pause(EFFECT_MS.float);
    },
    async shrink(trick) {
      const prop = await bring(trick);
      if (!prop) { burst(CENTER); await pause(EFFECT_MS.shrink); return; }
      prop.el.classList.remove('shrunk');
      burst(centerOf(prop));
      act(prop, 'fx-shrink', EFFECT_MS.shrink, { settle: () => prop.el.classList.add('shrunk') });
      await pause(EFFECT_MS.shrink);
    },
    async sparkle(trick) {
      const prop = await bring(trick);
      burst(centerOf(prop));
      await pause(EFFECT_MS.sparkle);
    },
    async 'ring-found'(trick) {
      const prop = await bring(trick);
      for (const old of overlay.querySelectorAll('.story-rings')) old.remove();
      const at = centerOf(prop);
      overlayAt(h('div', { class: 'story-rings fx-ring-found' }, img('tricks/rings')), { x: at.x, y: at.y - 70 }, 150, null);
      burst({ x: at.x, y: at.y - 70 });
      await pause(EFFECT_MS['ring-found']);
    },
    async 'kitten-cheer'(trick) {
      const prop = await bring(trick);
      const kitten = castMember(id => id === 'kitten');
      if (kitten) act(kitten, 'fx-kitten-cheer', EFFECT_MS['kitten-cheer'], { pose: castArt('kitten', look, 'cheer')[0] });
      else burst(centerOf(prop));
      await pause(EFFECT_MS['kitten-cheer']);
    },
    async bounce(trick) {
      const prop = await bring(trick);
      if (prop) act(prop, 'fx-bounce', EFFECT_MS.bounce);
      else burst(CENTER);
      await pause(EFFECT_MS.bounce);
    },
  };

  return {
    async play(effect, opts = {}) {
      if (destroyed) return;
      const run = Object.hasOwn(effects, effect) ? effects[effect] : effects.sparkle;
      await run(opts.trick ?? null);
    },
    place(trick) {
      if (!destroyed && trick) ensureProp(trick);
    },
    destroy() {
      destroyed = true;
      for (const t of timers) clearTimeout(t);
      timers.clear();
      root.remove();
    },
  };
}

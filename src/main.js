import { openStore } from './core/storage.js';
import { createOneWindow, flagFailedSaves } from './core/one-window.js';
import { loadContent } from './content/load.js';
import { readSaved } from './profile/saved.js';
import { heroVariant } from './profile/hero.js';
import { todayFrom } from './core/dates.js';
import { createRng } from './core/rng.js';
import { createAudio, unlockOnGestures } from './core/audio.js';
import { createRouter, parseLaunch } from './core/router.js';
import { mountStage, applyComfort } from './core/stage.js';
import { h } from './core/dom.js';
import { speakerButton, fullscreenButton } from './ui/components.js';
import { createHome, homeParams } from './ui/home.js';
import { cachedParts } from './ui/page-parts.js';

const AUDIO_BASE = 'assets/audio/';
const AUDIO_MANIFEST = 'assets/audio/manifest.json';
const WINDOWS_CHANNEL = 'meadows-world';
const ELSEWHERE = 'elsewhere';


async function readJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

async function loadManifest() {
  try {
    const manifest = await readJson(AUDIO_MANIFEST);
    if (isPlainObject(manifest)) return manifest;
    console.error(`${AUDIO_MANIFEST} is not a list of clips; playing without sound.`);
  } catch (err) {
    if (err instanceof SyntaxError) console.error(`${AUDIO_MANIFEST} is not valid JSON; playing without sound.`, err);
  }
  return {};
}

const stateEntries = (ctx) => [
  ['settings', ctx.settings],
  ['profile', ctx.profile],
  ['states', Object.fromEntries(ctx.states)],
  ['today', ctx.today ?? undefined],
  ...(Array.isArray(ctx.pages) ? ([['pages', ctx.pages]]) : []),
];

async function finishCutOff(game) {
  if (!isPlainObject(game.today)) return;
  try {
    const { finishCutOffDay } = await import('./scenes/session.js');
    await finishCutOffDay(game);
  } catch (err) {
    console.error('A day cut off in its last clip could not be finished', err);
  }
}

async function boot() {
  const launch = parseLaunch(location.search, location.hostname);
  const root = document.getElementById('stage');
  if (!root) throw new Error('index.html has no #stage element');
  const stage = mountStage(root);
  const sceneLayer = h('div', { class: 'scene-layer' });

  const store = await openStore({ backend: launch.store });
  let ctx;
  let catchUp = null;
  const catchUpNow = () => {
    if (!catchUp) return false;
    try { catchUp(); } catch (err) { console.error('Progress could not be gathered', err); }
    return true;
  };
  let away = false;
  const standAside = () => {
    if (away || !ctx) return;
    away = true;
    ctx.audio.stop();
    ctx.router.go(ELSEWHERE).catch((err) => console.error('The game could not stop here', err));
  };
  const windows = createOneWindow({
    store,
    channel: store.persistent && typeof BroadcastChannel === 'function' ? new BroadcastChannel(WINDOWS_CHANNEL) : null,
    entries: () => (ctx ? stateEntries(ctx) : []),
    beforeStandDown: async () => { catchUpNow(); },
    onStop: () => standAside(),
  });
  const starting = windows.start();
  const content = await loadContent(readJson);
  if (content.missing.length) console.warn('Content files not found:', content.missing.join(', '));
  const audio = createAudio({
    manifest: await loadManifest(),
    base: AUDIO_BASE,
    store,
    onMissing: (id) => console.debug(`No audio for ${id}`),
    variant: () => heroVariant(ctx?.profile),
  });
  await audio.reloadOverrides();
  const playing = await starting;
  const { settings, profile, states, today } = await readSaved(store);

  let replay = null;
  let replayGap;
  const speaker = speakerButton({ onReplay: () => { if (replay) audio.playSeq(replay, replayGap); } });
  const setReplay = (ids, gap) => {
    replay = ids && ids.length ? [...ids] : null;
    replayGap = gap;
    speaker.hidden = replay === null;
  };
  setReplay(null);
  applyComfort(stage.el, settings);
  const home = createHome({ audio, open: async () => { if (!away) await game.router.goNow('hub', homeParams(game.router.current())); } });
  stage.el.append(sceneLayer, h('div', { class: 'chrome' }, speaker, home.button, fullscreenButton()));

  const game = ({
    store,
    content,
    settings,
    profile,
    states,
    today,
    pages: null,
    audio,
    readParts: cachedParts(),
    router: (null),
    get day() { return todayFrom(launch.dayOffset); },
    rng: createRng(Date.now()),
    saveFailed: false,
    async save(extra) {
      applyComfort(stage.el, game.settings);
      const pages = game.pages;
      const saved = await windows.save(extra);
      if (saved && game.pages === pages) game.pages = null;
      return saved;
    },
    onLeave(gather) {
      catchUp = gather;
      return () => { if (catchUp === gather) catchUp = null; };
    },
    onHome: home.ask,
    async playHere() {
      await windows.takeOver();
      Object.assign(game, await readSaved(store), { pages: null });
      await audio.reloadOverrides();
      applyComfort(stage.el, game.settings);
      away = false;
      await game.router.go(launch.scene && launch.scene !== ELSEWHERE ? launch.scene : 'hub', launch.params);
    },
    say(lineId) {
      const id = `v.${lineId}`;
      setReplay([id]);
      return audio.play(id);
    },
    setReplay,
  });
  ctx = game;
  game.save = flagFailedSaves(game, game.save);
  const saveHidden = flagFailedSaves(game, () => windows.hide());
  game.router = createRouter(sceneLayer, game, { onNavigate: (name) => { audio.stop(); setReplay(null); home.arrived(name); } });

  unlockOnGestures(window, audio);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'hidden') windows.check().catch((err) => console.error('The saved progress could not be read', err));
    else if (catchUpNow()) saveHidden().catch((err) => console.error('Progress could not be saved', err));
  });
  window.addEventListener('pagehide', () => {
    if (document.visibilityState === 'visible' && catchUpNow()) windows.flush().catch((err) => console.error('Progress could not be saved', err));
  });
  document.fonts?.load('400 28px Andika').catch(() => {});
  document.fonts?.load('700 28px Andika').catch(() => {});
  if (launch.scene) Object.assign(window, { meadowsWorld: game });

  if (playing && windows.playing()) {
    await finishCutOff(game);
    if (!away) await game.router.go(launch.scene ?? 'hub', launch.params);
  } else {
    away = true;
    await game.router.go(ELSEWHERE);
  }
}

boot().catch((err) => {
  console.error("Whisker Academy could not start.", err);
  document.body.append(h('p', { class: 'boot-error' }, 'The castle is still waking up. Close this window and open the game again.'));
}).finally(() => { window.dispatchEvent(new Event('game-settled')); });

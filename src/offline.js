export const GAME_SETTLED = 'game-settled';
const LATEST_MS = 15000;
export const LOCAL_HOSTS = Object.freeze(['localhost', '127.0.0.1', '[::1]']);

export async function setUpOffline(forced, { location = globalThis.location, workers = globalThis.navigator?.serviceWorker, fetchFile = (path, options) => fetch(path, options), cacheStore = globalThis.caches } = {}) {
  if (!workers) return;
  if (LOCAL_HOSTS.includes(location.hostname) && !forced) {
    const left = await workers.getRegistrations();
    if (!left.length) return;
    await Promise.all(left.map((registration) => registration.unregister()));
    for (const name of await cacheStore.keys()) if (name.startsWith('mw-')) await cacheStore.delete(name);
    return;
  }
  const response = await fetchFile('precache.json', { cache: 'no-cache' }).catch(() => null);
  if (!response) return;
  if (!response.ok) {
    console.warn(`precache.json: HTTP ${response.status}. Run npm run precache to make the game work offline.`);
    return;
  }
  const { version } = await response.json();
  if (typeof version === 'string' && version) await workers.register(`sw.js?v=${encodeURIComponent(version)}`);
}

export function watchForGame({ check, target = globalThis, setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (id) => clearTimeout(id) }) {
  let asked = false;
  const ask = () => {
    if (asked) return;
    asked = true;
    clearTimer(timer);
    check().catch((err) => console.warn('The offline copy of the game could not be set up.', err));
  };
  const timer = setTimer(ask, LATEST_MS);
  target.addEventListener(GAME_SETTLED, ask);
  target.addEventListener('error', ask, { once: true, capture: true });
}

if (globalThis.navigator?.serviceWorker) {
  const forced = new URLSearchParams(globalThis.location.search).get('sw') === '1';
  watchForGame({ check: () => setUpOffline(forced) });
}

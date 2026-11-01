const VERSION = new URL(self.location.href).searchParams.get('v');
const CACHE = `mw-${VERSION}`;
const BATCH = 4;
const GONE = new Set([404, 410]);

const urlOf = (file) => new URL(file.split('/').map(encodeURIComponent).join('/'), self.location.href).href;

async function save(cache, file) {
  const url = urlOf(file);
  if (await cache.match(url)) return;
  const response = await fetch(`${url}?v=${encodeURIComponent(VERSION)}`, { cache: 'no-cache' });
  if (GONE.has(response.status)) {
    console.warn(`sw.js: ${file}: HTTP ${response.status}, not cached`);
    return;
  }
  if (!response.ok) throw new Error(`sw.js: ${file}: HTTP ${response.status}, the install stops and is tried again later`);
  await cache.put(url, response);
}

async function precache() {
  if (!VERSION) throw new Error('sw.js: register it as sw.js?v=<the version in precache.json>');
  const response = await fetch(urlOf('precache.json'), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`sw.js: precache.json: HTTP ${response.status}`);
  const { version, files } = await response.json();
  if (version !== VERSION) throw new Error(`sw.js: precache.json is now version ${version}, not ${VERSION}; the page registers that one next`);
  if (!Array.isArray(files)) throw new Error('sw.js: precache.json has no list of files');
  const cache = await caches.open(CACHE);
  for (let i = 0; i < files.length; i += BATCH) {
    const results = await Promise.allSettled(files.slice(i, i + BATCH).map((file) => save(cache, file)));
    const stopped = results.find((result) => result.status === 'rejected');
    if (stopped) throw stopped.reason;
  }
  if (!(await caches.has(CACHE))) throw new Error(`sw.js: ${CACHE} was deleted during the install`);
  const latest = await fetch(urlOf('precache.json'), { cache: 'no-cache' });
  const now = latest.ok ? (await latest.json()).version : null;
  if (now !== VERSION) throw new Error(`sw.js: precache.json is now version ${now}, not ${VERSION}; the page registers that one next`);
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith('mw-') && name !== CACHE) await caches.delete(name);
    }
  })());
});

function cached(request) {
  let key = (request);
  if (request.mode === 'navigate') {
    const url = new URL(request.url);
    url.search = '';
    if (url.pathname.endsWith('/')) url.pathname += 'index.html';
    key = url.href;
  }
  return caches.match(key, { cacheName: CACHE, ignoreVary: true });
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  const reply = cached(request).then((hit) => hit ?? fetch(request));
  event.respondWith(request.url === urlOf('precache.json') ? reply.catch(() => Response.json({})) : reply);
});

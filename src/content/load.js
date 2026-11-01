const FILES = Object.freeze([
  ['words', 'content/words.json', () => []],
  ['nonsense', 'content/nonsense.json', () => []],
  ['instant', 'content/instant-words.json', () => []],
  ['chains', 'content/chains.json', () => []],
  ['pairs', 'content/pairs.json', () => ({ ie: [], ssh: [] })],
  ['warmup', 'content/warmup.json', () => []],
  ['entrance', 'content/entrance.json', () => ({ lines: [], dictation: [], passage: null })],
  ['names', 'content/names.json', () => []],
  ['voice', 'content/voice.json', () => ({})],
  ['wardrobe', 'content/wardrobe.json', () => []],
  ['colorin', 'content/colorin.json', () => []],
  ['rewards', 'content/rewards.json', () => []],
  ['blocklist', 'content/blocklist.json', () => ({ format: 'sha256-lower', entries: [] })],
]);

const STORY_INDEX = 'content/story/index.json';

export async function loadContent(readJson) {
  const read = async (path) => {
    try {
      return { ok: true, value: await readJson(path) };
    } catch (err) {
      if (err instanceof SyntaxError) throw new SyntaxError(`${path}: ${err.message}`, { cause: err });
      return { ok: false };
    }
  };
  const missing = [];
  const valueOf = (path, r, fallback) => {
    if (!r.ok) missing.push(path);
    return r.ok && r.value != null ? r.value : fallback();
  };

  const [results, index] = await Promise.all([Promise.all(FILES.map(([, path]) => read(path))), read(STORY_INDEX)]);
  const loaded = {};
  FILES.forEach(([key, path, fallback], i) => { loaded[key] = valueOf(path, results[i], fallback); });
  loaded.pairs = { ie: [], ssh: [], ...loaded.pairs };

  const names = valueOf(STORY_INDEX, index, () => []);
  if (!Array.isArray(names)) throw new TypeError(`${STORY_INDEX}: must be a list of chapter file names`);
  const chapterPaths = names.map(name => `content/story/${name}`);
  const chapters = await Promise.all(chapterPaths.map(read));
  const story = chapters.flatMap((r, i) => { if (!r.ok) missing.push(chapterPaths[i]); return r.ok && r.value != null ? [r.value] : []; });

  const list = ( v) => (Array.isArray(v) ? v : []);
  const byWord = new Map([...list(loaded.words), ...list(loaded.nonsense), ...list(loaded.instant)].map(x => [x.w, x]));
  return ({ ...loaded, story, byWord, missing });
}

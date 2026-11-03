import { h } from '../../core/dom.js';
import { PHONEMES } from '../../curriculum/phonemes.js';
import { heroWords } from '../../profile/hero.js';
import { cornerFrame } from './gate.js';

export const FLAGS_KEY = 'soundFlags';
const MANIFEST = 'assets/audio/manifest.json';
const RECORDING_PREFIX = 'rec:';
const PRINCE_TWIN = '.prince';
const MIME_TYPES = Object.freeze(['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm']);
const MAX_RECORDING_MS = 15000;
const SEARCH_LIMIT = 80;

const GROUPS = Object.freeze([
  ['p', 'Sounds'],
  ['ln', 'Letter names'],
  ['w', 'Words'],
  ['ws', 'Stretched words: each word said slowly, sound by sound'],
  ['s', 'Sentences'],
  ['v', 'Narrator lines'],
  ['rr', "Gus's silly readings, not the real word on purpose, in his own voice, for robot reading. The tutor may want to hear them"],
]);
const OTHER = Object.freeze(['other', 'Other clips']);

export const NAME_SLOTS = Object.freeze([
  Object.freeze({ id: 'name.princess', label: "Say her princess's name" }),
  Object.freeze({ id: 'name.kitten', label: "Say her kitten's name" }),
]);
const NAME_TEXT = Object.freeze({ 'name.princess': "Her princess's name", 'name.kitten': "Her kitten's name" });

export function keywordSlots(deck, audio, recorded = new Set()) {
  const slots = new Map();
  for (const card of deck ?? []) {
    const word = typeof card?.keyword === 'string' ? card.keyword.trim().toLowerCase() : '';
    const id = `w.${word}`;
    if (word === '' || (audio.has(id) && !recorded.has(id))) continue;
    const slot = slots.get(id);
    if (slot) slot.cards.push(card.g);
    else slots.set(id, { word, cards: [card.g] });
  }
  return [...slots].map(([id, { word, cards }]) => ({ id, label: `Say "${word}", the key word for ${cards.join(' and ')}` }));
}

export function pickRecorderMime(Recorder = globalThis.MediaRecorder) {
  if (!Recorder || typeof Recorder.isTypeSupported !== 'function') return '';
  return MIME_TYPES.find((type) => {
    try {
      return Recorder.isTypeSupported?.(type) === true;
    } catch {
      return false;
    }
  }) ?? '';
}

const byCodePoint = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

export function groupClips(ids) {
  const byKey = new Map();
  for (const id of ids) {
    const prefix = id.includes('.') ? id.slice(0, id.indexOf('.')) : '';
    const key = GROUPS.some(([p]) => p === prefix) ? prefix : OTHER[0];
    byKey.set(key, [...(byKey.get(key) ?? []), id]);
  }
  return [...GROUPS, OTHER].flatMap(([key, title]) => (byKey.has(key) ? [{ key, title, ids: [... (byKey.get(key))].sort(byCodePoint) }] : []));
}

function labeler(content, hx = (text) => text) {
  const sentences = new Map();
  for (const chapter of content?.story ?? []) {
    for (const scene of [...(chapter.scenes ?? []), ...(chapter.side ?? [])]) {
      for (const sentence of scene.sentences ?? []) {
        sentences.set(sentence.id, sentence.text);
        if (sentence.prince) sentences.set(`${sentence.id}.prince`, sentence.prince);
      }
    }
  }
  const passage = content?.entrance?.passage;
  if (passage?.id) sentences.set(passage.id, passage.text);
  return (id) => {
    if (Object.hasOwn(NAME_TEXT, id)) return hx(NAME_TEXT[ (id)]);
    const dot = id.indexOf('.');
    const kind = id.slice(0, dot);
    const rest = id.slice(dot + 1);
    if (kind === 'p') return Object.hasOwn(PHONEMES, rest) && rest !== '' ? PHONEMES[rest].label : id;
    if (kind === 'ln') return `the letter name ${rest}`;
    if (kind === 'w') return rest;
    if (kind === 'ws') return `${rest}, stretched`;
    if (kind === 'rr') return `${rest}, Gus's silly reading, on purpose`;
    if (kind === 's') return sentences.get(rest) ?? id;
    if (kind === 'v' && rest.endsWith(PRINCE_TWIN)) return content?.voice?.[rest.slice(0, -PRINCE_TWIN.length)]?.prince ?? id;
    if (kind === 'v') return content?.voice?.[rest]?.text ?? id;
    return id;
  };
}

export const clipText = (id, content) => labeler(content)(id);

export function toggleFlag(flags, id) {
  return flags.includes(id) ? flags.filter((f) => f !== id) : [...flags, id].sort(byCodePoint);
}

export async function readManifest(fetchFn = (url) => globalThis.fetch(url)) {
  try {
    const response = await fetchFn(MANIFEST);
    if (!response?.ok) return [];
    const manifest = await response.json();
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) return [];
    return Object.entries(manifest).filter(([, file]) => typeof file === 'string' && file !== '').map(([id]) => id);
  } catch {
    return [];
  }
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'soundcheck');
  if (!body) return () => {};

  let alive = true;
  const hx = heroWords(ctx);
  const text = labeler(ctx.content, hx);
  const recorded = new Set();
  let flags = [];
  let active = null;
  const rows = new Set();
  const searchRows = new Set();
  const redraw = () => { for (const draw of [...rows, ...searchRows]) draw(); };

  const message = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });
  const say = (t) => { message.textContent = t; };

  const release = (stream) => { for (const track of stream?.getTracks() ?? []) track.stop(); };

  async function keepRecording(id, blob) {
    if (blob.size === 0) { say('Nothing was recorded. Check the microphone and try again.'); return; }
    try {
      await ctx.store.putBlob(RECORDING_PREFIX + id, blob);
    } catch (err) {
      console.error(`The recording of ${id} could not be saved`, err);
      say("The recording couldn't be saved in this browser window.");
      return;
    }
    await ctx.audio.setOverride(id, blob);
    recorded.add(id);
    redraw();
    say(`Saved your recording of "${text(id)}". It plays everywhere in the game from now on. Here it is:`);
    if (alive) ctx.audio.play(id);
  }

  function stopRecording(keep) {
    const rec = active;
    if (!rec) return;
    rec.keep = keep;
    if (rec.recorder && rec.recorder.state !== 'inactive') { rec.recorder.stop(); return; }
    clearTimeout(rec.timer);
    release(rec.stream);
    active = null;
    redraw();
  }

  async function startRecording(id) {
    const media = globalThis.navigator?.mediaDevices;
    const Recorder = globalThis.MediaRecorder;
    if (!media?.getUserMedia || !Recorder) { say("This browser can't record sound here."); return; }
    ctx.audio.stop();
    const rec = { id, recorder: (null), stream: (null), timer: (undefined), keep: true };
    active = rec;
    redraw();
    say('Asking to use the microphone...');
    let stream;
    try {
      stream = await media.getUserMedia({ audio: true });
    } catch (err) {
      console.warn('No microphone', err);
      if (active === rec) { active = null; redraw(); }
      say("The microphone isn't available. Allow this page to use the microphone (the icon in the address bar), then try again.");
      return;
    }
    if (!alive || active !== rec) { release(stream); return; }
    rec.stream = stream;
    const mime = pickRecorderMime(Recorder);
    const chunks = [];
    try {
      const recorder = new Recorder(stream, mime ? { mimeType: mime } : undefined);
      recorder.addEventListener('dataavailable', (event) => { if (event.data?.size) chunks.push(event.data); });
      recorder.addEventListener('stop', () => {
        clearTimeout(rec.timer);
        release(stream);
        if (active === rec) active = null;
        redraw();
        if (!alive || !rec.keep) return;
        keepRecording(id, new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' }))
          .catch((err) => console.error(`The recording of ${id} could not be kept`, err));
      });
      recorder.start();
      rec.recorder = recorder;
    } catch (err) {
      console.error('MediaRecorder could not start', err);
      release(stream);
      active = null;
      redraw();
      say("This browser can't record sound here.");
      return;
    }
    rec.timer = setTimeout(() => { if (active === rec) stopRecording(true); }, MAX_RECORDING_MS);
    say(`Recording "${text(id)}"... Say it, then press Stop.`);
    redraw();
  }

  async function deleteRecording(id) {
    try {
      await ctx.store.delBlob(RECORDING_PREFIX + id);
    } catch (err) {
      console.error(`The recording of ${id} could not be deleted`, err);
      say("The recording couldn't be deleted in this browser window.");
      return;
    }
    await ctx.audio.setOverride(id, null);
    recorded.delete(id);
    redraw();
    say(ctx.audio.has(id) ? `Deleted your recording; the narrator's "${text(id)}" plays again.` : 'Deleted the recording.');
  }

  async function flag(id) {
    flags = toggleFlag(flags, id);
    redraw();
    try {
      await ctx.store.set(FLAGS_KEY, flags);
    } catch (err) {
      console.error('Flags could not be saved', err);
      say("The flag couldn't be saved in this browser window.");
    }
  }

  function clipRow(id, { title, flaggable = true, registry = rows } = {}) {
    const play = h('button', { type: 'button', class: 'gu-button gu-small', onClick: () => { ctx.audio.play(id); } }, 'Play');
    const record = h('button', { type: 'button', class: 'gu-button gu-small gu-record', onClick: () => {
      if (active?.id === id) stopRecording(true);
      else if (!active) startRecording(id);
    } }, 'Record');
    const remove = h('button', { type: 'button', class: 'gu-button gu-small', onClick: () => { deleteRecording(id); } }, 'Delete recording');
    const flagButton = flaggable ? h('button', { type: 'button', class: 'gu-button gu-small gu-flag', onClick: () => { flag(id); } }, 'Flag') : null;
    const badges = h('span', { class: 'gu-badges' });
    const row = h('div', { class: 'gu-clip', 'data-clip': id },
      h('span', { class: 'gu-clip-text' }, h('span', {}, title ?? text(id)), h('span', { class: 'gu-clip-id' }, `clip: ${id}`), badges),
      h('span', { class: 'gu-clip-buttons' }, play, record, remove, flagButton));
    const draw = () => {
      const recording = active?.id === id;
      const mine = recorded.has(id);
      const flagged = flags.includes(id);
      (play).disabled = recording || !ctx.audio.has(id);
      record.textContent = recording ? 'Stop' : mine ? 'Record again' : 'Record';
      record.classList.toggle('recording', recording);
      (record).disabled = active !== null && !recording;
      (remove).disabled = !mine || recording;
      if (flagButton) flagButton.setAttribute('aria-pressed', String(flagged));
      badges.replaceChildren(...[mine && h('span', { class: 'gu-badge' }, 'your recording'), flagged && h('span', { class: 'gu-badge flagged' }, 'flagged')].filter((b) => b));
    };
    draw();
    registry.add(draw);
    return row;
  }

  const listing = h('div', { class: 'gu-clips' }, h('p', { class: 'gu-empty' }, 'Loading the clips...'));
  const keywords = h('section', { class: 'gu-names gu-keywords', hidden: true });
  const results = h('div', { class: 'gu-clip-results' });
  const search = (h('input', { class: 'gu-input', type: 'search', placeholder: 'Find a clip (a word, a sound, a line)', 'aria-label': 'Find a clip', autocomplete: 'off' }));

  body.append(
    h('p', {}, "Listen to each clip. If one sounds off, flag it, or record it again in your own voice: your recording replaces it everywhere in the game. Start with Sounds (about 45 short clips, 5 minutes). Sounds should have no extra \"uh\": /b/, not \"buh\"."),
    h('p', { class: 'gu-hint' }, hx('Flag marks a clip you want to come back to (to record it again, or to ask her tutor). It adds a "flagged" tag here and changes nothing in the game. Type "flagged" in the search to list the clips you flagged. The small "clip" name under each line is only a label for finding it.')),
    message,
    h('section', { class: 'gu-names' },
      h('h2', { class: 'gu-subtitle' }, hx('Her names (optional)')),
      h('p', { class: 'gu-hint' }, hx('The narrator says "Princess" and "Kitty". Record the names she chose, and they are said after the greeting at the castle and when the Entrance Quest ends.')),
      NAME_SLOTS.map((slot) => clipRow(slot.id, { title: hx(slot.label), flaggable: false }))),
    keywords,
    h('h2', { class: 'gu-subtitle' }, "The narrator's clips"),
    search,
    results,
    listing);

  (async () => {
    const [ids, blobIds, savedFlags] = await Promise.all([
      readManifest(),
      ctx.store.blobIds().catch(() => ([])),
      ctx.store.get(FLAGS_KEY).catch(() => undefined),
    ]);
    if (!alive) return;
    for (const blobId of blobIds) if (blobId.startsWith(RECORDING_PREFIX)) recorded.add(blobId.slice(RECORDING_PREFIX.length));
    flags = Array.isArray(savedFlags) ? savedFlags.filter((f) => typeof f === 'string').sort(byCodePoint) : [];
    redraw();
    showKeywords(keywordSlots(ctx.profile.deck, ctx.audio, recorded));
    const groups = groupClips(ids);
    if (groups.length === 0) {
      search.hidden = true;
      listing.replaceChildren(h('p', { class: 'gu-empty' }, hx("The narrator's clips haven't been made yet, so there is nothing to listen to here yet. You can still record her names above.")));
      return;
    }
    listing.replaceChildren(...groups.map((group) => {
      const list = h('div', { class: 'gu-clip-list' });
      const details = h('details', { class: 'gu-group', open: group.key === 'p' },
        h('summary', { class: 'gu-group-title' }, `${group.title} (${group.ids.length})`), list);
      const fill = () => { if (!list.hasChildNodes()) list.append(...group.ids.map((id) => clipRow(id))); };
      if (group.key === 'p') fill();
      details.addEventListener('toggle', () => { if ( (details).open) fill(); });
      return details;
    }));
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      searchRows.clear();
      if (!q) { results.replaceChildren(); return; }
      const askedFlags = q.length >= 4 && 'flagged'.startsWith(q);
      const found = ids.filter((id) => id.toLowerCase().includes(q) || text(id).toLowerCase().includes(q) || (askedFlags && flags.includes(id))).sort(byCodePoint);
      results.replaceChildren(
        h('p', { class: 'gu-hint' }, found.length > SEARCH_LIMIT ? `${found.length} clips match; the first ${SEARCH_LIMIT} are shown.` : `${found.length} ${found.length === 1 ? 'clip matches' : 'clips match'}.`),
        ...found.slice(0, SEARCH_LIMIT).map((id) => clipRow(id, { registry: searchRows })));
    });
  })().catch((err) => console.error('Sound check could not load the clips', err));

  function showKeywords(slots) {
    if (slots.length === 0) return;
    const slotRows = slots.map((slot) => clipRow(slot.id, { title: slot.label, flaggable: false }));
    keywords.replaceChildren(
      h('h2', { class: 'gu-subtitle' }, 'Key words'),
      h('p', { class: 'gu-hint' }, 'These key words from the sound card deck have no narrator clip. Record each one, and the "Letter name, key word, sound" routine says it.'),
      ...slotRows);
    keywords.hidden = false;
    const asked = slotRows[slots.findIndex((slot) => slot.id === params.slot)];
    if (!asked) return;
    asked.classList.add('gu-asked');
    asked.scrollIntoView?.({ block: 'center' });
    (asked.querySelector('.gu-record'))?.focus();
  }

  return () => {
    alive = false;
    stopRecording(false);
  };
}

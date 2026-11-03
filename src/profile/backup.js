import { REV_KEY } from '../core/one-window.js';
import { isItemState } from '../engine/itemstate.js';
import { isProfileShape } from './profile.js';
import { isSettingsShape } from './settings.js';
import { BACKUP_KEY_PREFIX, DEVICE_SETTINGS, MAX_STUDENTS, STUDENTS_KEY, normalizeStudents } from './students.js';


const isLocalKey = (key) => key === REV_KEY || key.startsWith(BACKUP_KEY_PREFIX);
const STUDENT_KEY = /^s:s[1-9][0-9]{0,3}:(.*)$/;
const SHAPES = Object.freeze({
  settings: isSettingsShape,
  profile: isProfileShape,
  states: ( states) => isPlainObject(states) && Object.values(states).every(isItemState),
});

const FORMAT = 'meadows-world-backup';
const VERSION = 1;
const DATA_URL = /^data:([^,]*);base64,([A-Za-z0-9+/]*={0,2})$/;
const BYTES_PER_CHUNK = 0x8000;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function strictJson(key, value) {
  const original = this[key];
  if (original === undefined || original === null || typeof original === 'string' || typeof original === 'boolean') return value;
  if (typeof original === 'number' && Number.isFinite(original)) return value;
  if (Array.isArray(original) || isPlainObject(original)) return value;
  throw new TypeError(`unsupported value of type ${Object.prototype.toString.call(original)}`);
}

async function blobToDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += BYTES_PER_CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BYTES_PER_CHUNK));
  }
  return `data:${blob.type};base64,${btoa(binary)}`;
}

function dataUrlToBlob(url) {
  const match = typeof url === 'string' ? DATA_URL.exec(url) : null;
  if (!match) return null;
  let binary;
  try {
    binary = atob(match[2]);
  } catch {
    return null;
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: match[1] });
}

export async function exportBackup(store) {
  const kv = Object.create(null);
  for (const key of await store.keys()) {
    if (isLocalKey(key)) continue;
    const value = await store.get(key);
    if (value === undefined) continue;
    try {
      kv[key] = JSON.parse(JSON.stringify(value, strictJson));
    } catch (err) {
      throw new TypeError(`The saved value "${key}" cannot be put in a backup file: ${err instanceof Error ? err.message : err}`);
    }
  }
  const blobs = Object.create(null);
  for (const id of await store.blobIds()) {
    const blob = await store.getBlob(id);
    if (blob === undefined) continue;
    blobs[id] = await blobToDataUrl(blob);
  }
  return JSON.stringify({ format: FORMAT, version: VERSION, kv, blobs });
}

function parseBackup(text) {
  const notBackup = { ok: false, reason: "That file isn't a Whisker Academy backup." };
  if (typeof text !== 'string') return notBackup;
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return notBackup;
  }
  if (!isPlainObject(data) || data.format !== FORMAT) return notBackup;
  if (data.version !== VERSION) {
    const made = typeof data.version === 'number' ? ` (version ${data.version})` : '';
    const newer = typeof data.version === 'number' && data.version > VERSION ? ' Update the game on this computer, then try again.' : '';
    return { ok: false, reason: `That backup was made by a different version of the game${made}, so it can't be loaded here.${newer}` };
  }
  const damaged = { ok: false, reason: 'That backup file looks damaged, so nothing was changed.' };
  if (!isPlainObject(data.kv) || !isPlainObject(data.blobs)) return damaged;
  for (const [key, value] of Object.entries(data.kv)) {
    const own = STUDENT_KEY.exec(key)?.[1] ?? key;
    const ok = Object.hasOwn(SHAPES, own) ? SHAPES[ (own)] : null;
    if (ok && !ok(value)) return damaged;
  }
  if (Object.hasOwn(data.kv, STUDENTS_KEY)) {
    const raw = data.kv[STUDENTS_KEY];
    if (!Array.isArray(raw) || normalizeStudents(raw).length !== raw.length || raw.length === 0 || raw.length > MAX_STUDENTS) return damaged;
  }
  const blobs = new Map();
  for (const [id, url] of Object.entries(data.blobs)) {
    const blob = dataUrlToBlob(url);
    if (!blob) return damaged;
    blobs.set(id, blob);
  }
  return { ok: true, kv: new Map(Object.entries(data.kv).filter(([key]) => !isLocalKey(key))), blobs };
}

const hasSessions = (profile) => profile !== null && typeof profile === 'object' && Array.isArray(profile.sessions) && profile.sessions.length > 0;

export function checkBackup(text) {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  const hasPin = typeof parsed.kv.get('settings')?.pin === 'string';
  if (parsed.kv.has(STUDENTS_KEY)) {
    const ids = normalizeStudents(parsed.kv.get(STUDENTS_KEY)).map((s) => s.id);
    return { ok: true, kind: 'device', students: ids.length, hasPin, hasProgress: ids.some((id) => hasSessions(parsed.kv.get(`s:${id}:profile`))) };
  }
  return { ok: true, kind: 'student', students: 1, hasPin, hasProgress: hasSessions(parsed.kv.get('profile')) };
}

async function replaceAll(store, kv, blobs) {
  for (const [key, value] of kv) await store.set(key, value);
  for (const [id, blob] of blobs) await store.putBlob(id, blob);
  for (const key of await store.keys()) if (!kv.has(key) && !isLocalKey(key)) await store.del(key);
  for (const id of await store.blobIds()) if (!blobs.has(id)) await store.delBlob(id);
}

async function snapshot(store) {
  const kv = new Map();
  for (const key of await store.keys()) kv.set(key, await store.get(key));
  const blobs = new Map();
  for (const id of await store.blobIds()) {
    const blob = await store.getBlob(id);
    if (blob !== undefined) blobs.set(id, blob);
  }
  return { kv, blobs };
}

export async function importBackup(store, text, { keepPin = false } = {}) {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  const deviceFile = parsed.kv.has(STUDENTS_KEY);
  const oneStudent = typeof ( (store).student) === 'string';
  if (deviceFile && oneStudent) return { ok: false, reason: 'That backup holds everything on a device, so it restores only as everything on this device; nothing was changed.' };
  if (!deviceFile && !oneStudent && await store.get(STUDENTS_KEY) !== undefined) return { ok: false, reason: "That backup holds one student's progress, so it restores only as one student; nothing was changed." };
  if (keepPin) {
    const here = ((await store.get('settings')) ?? {});
    const file = parsed.kv.get('settings');
    const device = DEVICE_SETTINGS;
    parsed.kv.set('settings', {
      ...Object.fromEntries(Object.entries(isPlainObject(file) ? file : {}).filter(([k]) => !device.includes(k))),
      ...Object.fromEntries(device.filter((k) => Object.hasOwn(here, k)).map((k) => [k, here[k]])),
    });
  }
  let before;
  try {
    before = await snapshot(store);
  } catch {
    return { ok: false, reason: "The progress already saved here couldn't be read, so nothing was changed." };
  }
  try {
    await replaceAll(store, parsed.kv, parsed.blobs);
    return { ok: true };
  } catch {
    try {
      await replaceAll(store, before.kv, before.blobs);
    } catch {
      return { ok: false, reason: "The backup couldn't be saved in this browser window, and the progress saved here may be incomplete." };
    }
    return { ok: false, reason: "The backup couldn't be saved in this browser window, so nothing was changed." };
  }
}

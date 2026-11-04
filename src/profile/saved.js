import { normalizeSettings } from './settings.js';
import { normalizeProfile, withTaughtLessons } from './profile.js';
import { normalizeItemState } from '../engine/itemstate.js';
import { createStudentStore } from './students.js';


const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

export async function readSaved(store, id) {
  if (id !== undefined) store = createStudentStore( (store).base ?? store, { students: [{ id }], current: id });
  const storedSettings = await store.get('settings');
  const settings = normalizeSettings(storedSettings);
  const profile = withTaughtLessons(normalizeProfile(await store.get('profile'), settings.taughtUpTo), settings.taughtUpTo);
  const storedStates = await store.get('states');
  const states = new Map(isPlainObject(storedStates)
    ? Object.entries(storedStates).filter(([, s]) => isPlainObject(s)).map(([key, s]) => [key, normalizeItemState(key, s)])
    : []);
  const storedToday = await store.get('today');
  return { settings, profile, states, today: isPlainObject(storedToday) ? carryToday(storedToday, storedSettings, settings) : null };
}

export function carryToday(today, stored, settings) {
  if (!isPlainObject(stored)) return today;
  const plannedUnder = today.taughtUpTo === stored.taughtUpTo && today.sShContrast === (stored.sShContrast === true);
  if (!plannedUnder || (today.taughtUpTo === settings.taughtUpTo && today.sShContrast === settings.sShContrast)) return today;
  return { ...today, taughtUpTo: settings.taughtUpTo, sShContrast: settings.sShContrast };
}

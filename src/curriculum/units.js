import { LESSONS } from './lessons.js';


export const UNITS = Object.freeze([
  { id: 'first-words', from: 1, to: 50, name: 'First sounds and words' },
  { id: 'digraphs-end', from: 51, to: 53, name: 'Endings ng and nk' },
  { id: 'vce', from: 54, to: 62, name: 'Silent e words' },
  { id: 'longer-words', from: 63, to: 68, name: 'Longer words and endings' },
  { id: 'ending-patterns', from: 69, to: 76, name: 'Ending spelling patterns' },
  { id: 'r-controlled', from: 77, to: 83, name: 'Vowels with r' },
  { id: 'long-teams', from: 84, to: 88, name: 'Long vowel teams' },
  { id: 'other-teams', from: 89, to: 94, name: 'Other vowel teams' },
  { id: 'diphthongs', from: 95, to: 97, name: 'Sliding vowels oi and ou' },
  { id: 'silent-letters', from: 98, to: 98, name: 'Silent letters' },
  { id: 'affixes-1', from: 99, to: 106, name: 'Prefixes and suffixes, part one' },
  { id: 'suffix-changes', from: 107, to: 110, name: 'Spelling changes before suffixes' },
  { id: 'rare-spellings', from: 111, to: 118, name: 'Less common spellings' },
  { id: 'affixes-2', from: 119, to: 128, name: 'Prefixes and suffixes, part two' },
].map((unit) => Object.freeze(unit)));

export function unitOf(lesson) {
  if (!Number.isFinite(lesson)) return null;
  return UNITS.find((u) => lesson >= u.from && lesson <= u.to) ?? null;
}

const HEART_LESSON = new Map();
for (const lesson of LESSONS) for (const word of lesson.heartWords) if (!HEART_LESSON.has(word)) HEART_LESSON.set(word, lesson.n);

export function heartWordsKnownByUnit(instant) {
  const counts = new Map();
  for (const [word, status] of Object.entries(instant ?? {})) {
    if (status !== 'known') continue;
    const unit = unitOf(HEART_LESSON.get(word) ?? Number.NaN);
    if (unit) counts.set(unit.id, (counts.get(unit.id) ?? 0) + 1);
  }
  return UNITS.filter((u) => counts.has(u.id)).map((u) => ({ id: u.id, from: u.from, to: u.to, name: u.name, known: (counts.get(u.id)) }));
}

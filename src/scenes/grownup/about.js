import { h } from '../../core/dom.js';
import { cornerFrame } from './gate.js';
import { PRINT_TIP } from './tips.js';

export const NOTICES = Object.freeze([
  "Created to align with UFLI Foundations' scope and sequence. The game's stories, sentences, art and audio are original and were not created or endorsed by UFLI.",
  'Andika (SIL Open Font License 1.1): the typeface used for all text.',
  'Kokoro-82M (Apache-2.0): the speech model used to make the narrator\'s voice clips, on the build computer.',
  'LJSpeech (public domain): the speech recordings behind the long e sound and the f, s and sh sounds.',
  'HiFi-GAN (MIT): the vocoder used to make the long e sound, on the build computer.',
  'CMUdict (BSD-2-Clause): the pronunciation dictionary used to check word pronunciations.',
]);

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'about');
  if (!body) return () => {};
  body.append(
    h('p', {}, "Meadowlark's World: Whisker Academy is a home practice game for reading and spelling, played with a grown-up beside her. It practices only what has been taught, in UFLI Foundations order."),
    h('p', {}, 'Her names, progress and your recordings stay in this browser on this computer. Nothing is sent anywhere: there are no accounts, ads or tracking. Use Backup to keep a copy.'),
    h('p', {}, PRINT_TIP),
    h('h2', { class: 'gu-subtitle' }, 'Notices'),
    h('p', {}, NOTICES[0]),
    h('p', {}, 'Third-party material used in this game:'),
    h('ul', { class: 'gu-notices' }, NOTICES.slice(1).map((notice) => h('li', {}, notice))));
  return () => {};
}

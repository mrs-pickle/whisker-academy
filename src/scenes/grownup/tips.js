import { h } from '../../core/dom.js';
import { heroWords } from '../../profile/hero.js';
import { COPILOT_HELP } from '../../ui/components.js';
import { cornerFrame } from './gate.js';

export const STOP_TIP = 'To stop part-way, press the Home button (the house), or close the tab. The rounds she finished are kept, and she carries on from the next stone.';
export const PRINT_TIP = 'To print a coloring page, open it in the color-in room and hold the print button for 3 seconds. To print every page she has earned and not printed yet, press Print all new pages on the Coloring pages screen.';

export const UNDO_TIP = 'Tapped by mistake? Press ↶ Undo. It takes back your last tap, and the word comes up again.';
export const CONTINUE_TIP = 'At the end of a part, you get one more step: Continue or Undo. Press 1 or Enter to go on.';
export const PASS_TIP = 'Stuck? Press → Pass (key 4). It is not scored, and it comes back at the end of the lesson and early in a later one.';
export const TAKE_BACK_TIP = 'When she builds a word, the big ⌫ button takes back her last letter. So does the Backspace key. It never counts as a miss.';

export const TIPS = Object.freeze([
  COPILOT_HELP,
  'Say "check each sound" instead of giving her the word.',
  'Praise her effort specifically: name what she did ("You checked every sound before you said it").',
  'Never compare her with other children, or with how fast anyone else reads.',
  'This game supplements her tutoring; it does not replace it.',
]);

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'tips');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  body.append(
    h('ul', { class: 'gu-tips' }, TIPS.map((tip) => h('li', {}, hx(tip)))),
    h('h2', { class: 'gu-subtitle' }, "On the Grown-up's turn"),
    h('p', {}, 'Press 1 for ✓ Yes, 2 for ↻ Try again, 3 for 🔊 Help, and 4 for → Pass, without reaching for the trackpad. The "?" on the banner shows the scoring rule.'),
    h('p', {}, UNDO_TIP),
    h('p', {}, CONTINUE_TIP),
    h('p', {}, PASS_TIP),
    h('p', {}, hx(TAKE_BACK_TIP)),
    h('p', {}, 'On the screen before each adventure, "Grown-up playing today?" has Yes or No. On days with no grown-up, choose No: those moments become self-checks and are not scored. (Settings has the usual answer.)'),
    h('h2', { class: 'gu-subtitle' }, 'Stopping and printing'),
    h('p', {}, hx(STOP_TIP)),
    h('p', {}, hx(PRINT_TIP)));
  return () => {};
}

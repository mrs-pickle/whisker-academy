import { h } from '../../core/dom.js';
import { TINTS } from '../../core/stage.js';
import { CHOOSABLE_LESSONS, LESSONS } from '../../curriculum/lessons.js';
import { HEROES, heroOf, heroWords, withHero } from '../../profile/hero.js';
import { withTaughtLessons } from '../../profile/profile.js';
import { MIX_IT_UP, normalizeSettings } from '../../profile/settings.js';
import { BREAK_STYLES } from '../break.js';
import { checkPin, cornerFrame, hashPin, isValidPin } from './gate.js';
import { cleanName, contentNote, HERO_LABELS, NAME_MAX } from './setup.js';
import { startOverSection } from './start-over.js';


export const SETTING_HELP = Object.freeze({
  taughtUpTo: { label: 'Taught up to UFLI lesson',
    help: "The last UFLI lesson her tutor has taught. Everything she reads or spells uses only patterns up to this lesson. Moving it forward marks each new lesson's heart words as known, and you can change them in Instant words. Moving it back hides later words from her sessions; her progress on them is kept for when it moves forward again." },
  sessionMinutes: { label: 'Session length',
    help: "About how long a day's adventure lasts, in active minutes, with short movement breaks between rounds." },
  copilot: { label: 'Co-pilot (a grown-up plays with her)',
    help: "Whether a grown-up usually sits with her. On: you judge her reading with ✓ Yes, ↻ Try again or 🔊 Help. Off: she hears the word or sound said and checks herself, and those moments aren't scored. She can switch it at the start of each session." },
  sShContrast: { label: 's and sh contrasts',
    help: "On: 's' and 'sh' are put side by side as choices: listening pairs from lesson 45 (sip or ship?), sound cards, letter tiles and word chains. Off: 'sh' words are still read and spelled, but 's' is never put beside 'sh' as a choice." },
  ieEmphasis: { label: 'Extra short i and short e practice',
    help: 'Adds i/e listening pairs (pig/peg, sit/set) and picks words with short i or e more often.' },
  newWordPace: { label: 'New-word pace',
    help: "How many new words come into each session. Steady is the usual pace. Gentle brings fewer, for a child who likes more practice first. Quick brings more, and more again in a big lesson, for a child racing ahead; with \"Play more\" at the end of a session she can play several sessions a day, each with its own new words. Every pace uses only the lessons her tutor has taught: when she has met them all, she practices them until the lesson moves on." },
  cardRoutine: { label: 'Sound card routine',
    help: "How she answers a sound card, to match her tutor's drill. \"Letter name, key word, sound\" is used only for cards with a key word (set them in Sound cards); other cards stay sound only." },
  breakStyle: { label: 'Movement break style',
    help: 'The kind of 30–60 second movement break between rounds. Mix it up plays all five in turn, so none comes back until the others have had a go. Pick one to play only that.' },
  textSpacing: { label: 'Text spacing',
    help: 'Wide spaces the letters and the words a little further apart.' },
  tint: { label: 'Background tint',
    help: 'Changes the background color of the game.' },
  muted: { label: 'Game sound',
    help: 'Off: nothing in the game plays aloud, not the narrator, the words and sounds, your recordings or the effects, and nothing waits for them. It is the same as the speaker-with-a-slash button beside the replay speaker at the top left, and it is kept on this device for both students. Pressing the replay speaker while the sound is off turns it back on.' },
  pin: { label: 'Grown-up PIN',
    help: 'The PIN that opens this corner (4 to 8 digits). Holding the button on the gate for 3 seconds also opens it, so if you forget the PIN, open the corner that way and choose a new one here.' },
  printWords: { label: '"Words I can read" strip',
    help: 'A printed coloring page has a line along the bottom with up to 4 words she built that day, like "Words I can read: mop • net • bell". Turn it off to print the page alone.' },
  flash: { label: "Kitty's blink game",
    help: "On: at the end of story time on a reread day (every 5th lesson), with you beside her, a word she already reads well shows, then fades. She can peek again as often as she likes, and there is never a limit on answering; the word always comes back with its sound. It opens only when she has 20 words she reads well and high accuracy over her last 5 sessions, so it may not appear for a while. The research suggests this only as an option once accuracy is secure, and found no study of it as training; rereads are what build fluency. If she dislikes it, turn it off: nothing is lost." },
  tipsSeen: { label: 'Grown-up tips',
    help: 'Directions meant for you (when to judge, waiting before you help, when to start timing) are never spoken aloud. Each shows once, in a small box, the first time it is needed, and goes after your first tap. Press the button to see them all once more.' },
});

const capitalized = (id) => id.charAt(0).toUpperCase() + id.slice(1);
const BREAK_LABELS = Object.freeze({ ballet: 'Ballet', jumps: 'Jumping', swim: 'Swimming', stretch: 'Cat stretch', parade: 'Royal parade' });

const CHOICES = Object.freeze({
  sessionMinutes: [[10, '10 minutes'], [15, '15 minutes'], [20, '20 minutes']],
  copilot: [[true, 'On'], [false, 'Off']],
  sShContrast: [[true, 'On'], [false, 'Off']],
  ieEmphasis: [[true, 'On'], [false, 'Off']],
  newWordPace: [['gentle', 'Gentle'], ['steady', 'Steady'], ['quick', 'Quick']],
  flash: [[true, 'On'], [false, 'Off']],
  cardRoutine: [['sound', 'Sound only'], ['name-key-sound', 'Letter name, key word, sound']],
  breakStyle: [[MIX_IT_UP, 'Mix it up'], ...BREAK_STYLES.map((style) => [style, BREAK_LABELS[ (style)] ?? capitalized(style)])],
  textSpacing: [['normal', 'Normal'], ['wide', 'Wide']],
  tint: TINTS.map((tint) => [tint, capitalized(tint)]),
  muted: [[false, 'On'], [true, 'Off']],
});

export const updateSetting = (settings, key, value) => normalizeSettings({ ...settings, [key]: value });

export function newHeartWords(instant, taughtUpTo) {
  const words = LESSONS.filter((lesson) => lesson.n <= taughtUpTo).flatMap((lesson) => lesson.heartWords);
  return [...new Set(words)].filter((word) => !Object.hasOwn(instant, word));
}

export async function checkPinChange({ current, next, again, hash, viaHold }) {
  if (!viaHold && !(await checkPin(current, hash))) return "The current PIN doesn't match.";
  if (!isValidPin(next)) return 'Choose a new PIN of 4 to 8 digits.';
  if (next !== again) return "The two new PINs don't match.";
  return null;
}

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'settings');
  if (!body) return () => {};
  const hx = heroWords(ctx);

  const status = h('p', { class: 'gu-saved', role: 'status', 'aria-live': 'polite' });
  const say = (text) => { status.textContent = text; };
  const save = async () => {
    try {
      await ctx.save();
      say('Saved.');
    } catch (err) {
      console.error('Settings could not be saved', err);
      say("Saving didn't work in this browser window.");
    }
  };
  const change = (key, value) => {
    ctx.settings = updateSetting(ctx.settings, key, value);
    if (key === 'taughtUpTo') ctx.profile = withTaughtLessons(ctx.profile, ctx.settings.taughtUpTo);
    save();
  };

  const row = (key, ...control) => h('section', { class: 'gu-setting', 'data-setting': key },
    h('h2', { class: 'gu-setting-label' }, hx(SETTING_HELP[key].label)),
    h('p', { class: 'gu-help' }, hx(SETTING_HELP[key].help)),
    ...control);

  const segmented = (key) => {
    const group = h('div', { class: 'gu-segmented', role: 'group', 'aria-label': hx(SETTING_HELP[key].label) });
    const draw = () => group.replaceChildren(...CHOICES[key].map(([value, label]) => h('button', {
      type: 'button', class: 'gu-choice', 'aria-pressed': String(ctx.settings[key] === value),
      onClick: () => { change(key, value); draw(); },
    }, label)));
    draw();
    return group;
  };

  const lessonNotes = h('div', { class: 'gu-notes' });
  const addedWords = [];
  let addedCard = false;
  const drawLessonNotes = () => {
    const n = ctx.settings.taughtUpTo;
    const missing = newHeartWords(ctx.profile.instant, n);
    const beyond = contentNote(n, ctx.content);
    lessonNotes.replaceChildren(...[
      beyond && h('p', { class: 'gu-hint' }, beyond),
      addedWords.length > 0 && h('p', { class: 'gu-hint' }, `Added as known: ${addedWords.join(', ')}. Change them in Instant words.`),
      addedCard && h('p', { class: 'gu-hint' }, 'Added a ph sound card, as learning. Change it in Sound cards.'),
      missing.length > 0 && h('p', { class: 'gu-hint' }, `Heart words up to lesson ${n} ${hx("that aren't on her Instant words list yet:")} ${missing.join(', ')}. ${hx('Mark them in Instant words once her tutor has taught them.')}`),
    ].filter((note) => note));
  };
  const lesson = h('select', { class: 'gu-select', 'aria-label': SETTING_HELP.taughtUpTo.label,
    onChange: ( e) => {
      const before = ctx.profile;
      change('taughtUpTo', Number( (e.target).value));
      addedWords.push(...Object.keys(ctx.profile.instant).filter((word) => !Object.hasOwn(before.instant, word)));
      addedCard ||= ctx.profile.deck.length > before.deck.length;
      drawLessonNotes();
    } },
  CHOOSABLE_LESSONS.map((l) => h('option', { value: String(l.n), selected: l.n === ctx.settings.taughtUpTo }, `${l.n}: ${l.concept}`)));
  drawLessonNotes();

  const viaHold = ctx.cornerEntry === 'hold';
  const pinMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const pinField = (label, id) => h('div', { class: 'gu-field' }, h('label', { class: 'gu-label', for: id }, label),
    h('input', { class: 'gu-input', id, type: 'password', inputmode: 'numeric', maxlength: '8', autocomplete: 'off' }));
  const pinForm = h('form', { class: 'gu-pin-form', onSubmit: async ( event) => {
    event.preventDefault();
    const value = ( id) => (pinForm.querySelector(`[id="${id}"]`))?.value ?? '';
    const problem = await checkPinChange({ current: value('gu-pin-old'), next: value('gu-pin-new'), again: value('gu-pin-new2'), hash: ctx.settings.pin, viaHold });
    if (problem) { pinMessage.textContent = problem; return; }
    ctx.settings = updateSetting(ctx.settings, 'pin', await hashPin(value('gu-pin-new')));
    for (const input of pinForm.querySelectorAll('input')) (input).value = '';
    pinMessage.textContent = 'The PIN is changed.';
    save();
  } },
  viaHold && h('p', { class: 'gu-hint' }, "You opened the corner with the hold button, so the current PIN isn't asked for. Choose a new one."),
  h('div', { class: 'gu-row gu-wrap' }, ...(viaHold ? [] : [pinField('Current PIN', 'gu-pin-old')]), pinField('New PIN', 'gu-pin-new'), pinField('New PIN again', 'gu-pin-new2')),
  h('button', { type: 'submit', class: 'gu-button' }, 'Change PIN'),
  pinMessage);

  const tipsMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const tipsAgain = h('button', { type: 'button', class: 'gu-button', onClick: () => {
    change('tipsSeen', {});
    tipsMessage.textContent = 'The grown-up tips will show again, each the next time it is needed.';
  } }, 'Show grown-up tips again');

  const heroChoices = h('div', { class: 'gu-segmented', role: 'group', 'aria-label': 'The hero' });
  const drawHero = () => heroChoices.replaceChildren(...HEROES.map((hero) => h('button', {
    type: 'button', class: 'gu-choice', 'aria-pressed': String(heroOf(ctx.profile) === hero),
    onClick: () => { ctx.profile = withHero(ctx.profile, hero); drawHero(); save(); },
  }, HERO_LABELS[hero])));
  drawHero();

  const nameMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const nameField = (label, id, value) => h('div', { class: 'gu-field' }, h('label', { class: 'gu-label', for: id }, label),
    h('input', { class: 'gu-input', id, value, maxlength: String(NAME_MAX), autocomplete: 'off' }));
  const nameForm = h('form', { class: 'gu-name-form', onSubmit: ( event) => {
    event.preventDefault();
    const princessName = cleanName( (nameForm.querySelector('#gu-name-princess')).value);
    const kittenName = cleanName( (nameForm.querySelector('#gu-name-kitten')).value);
    if (!princessName || !kittenName) { nameMessage.textContent = 'Both names are needed.'; return; }
    ctx.profile = { ...ctx.profile, princessName: princessName.slice(0, NAME_MAX), kittenName: kittenName.slice(0, NAME_MAX) };
    nameMessage.textContent = 'Names saved.';
    save();
  } },
  h('div', { class: 'gu-row gu-wrap' },
    nameField(hx("Her princess's name"), 'gu-name-princess', ctx.profile.princessName ?? ''),
    nameField(hx("Her kitten's name"), 'gu-name-kitten', ctx.profile.kittenName ?? '')),
  h('button', { type: 'submit', class: 'gu-button' }, 'Save names'),
  nameMessage);

  body.append(
    status,
    row('taughtUpTo', lesson, lessonNotes),
    row('sessionMinutes', segmented('sessionMinutes')),
    row('newWordPace', segmented('newWordPace')),
    row('copilot', segmented('copilot')),
    row('sShContrast', segmented('sShContrast')),
    row('ieEmphasis', segmented('ieEmphasis')),
    row('cardRoutine', segmented('cardRoutine')),
    row('breakStyle', segmented('breakStyle')),
    row('textSpacing', segmented('textSpacing')),
    row('tint', segmented('tint')),
    row('muted', segmented('muted')),
    row('flash', segmented('flash')),
    row('tipsSeen', tipsAgain, tipsMessage),
    row('pin', pinForm),
    h('section', { class: 'gu-setting', 'data-setting': 'names' },
      h('h2', { class: 'gu-setting-label' }, 'Names'),
      h('p', { class: 'gu-help' }, hx('Her princess and her kitten, as she sees them in the game. To have the narrator say them, record them in Sound check.')),
      h('div', { 'data-setting': 'hero' },
        h('p', { class: 'gu-label' }, 'The hero'),
        heroChoices,
        h('p', { class: 'gu-help' }, hx('The hero she sees, and the word the narrator uses. Coloring pages she has already earned keep their pictures.'))),
      nameForm),
    startOverSection(ctx));
  return () => {};
}

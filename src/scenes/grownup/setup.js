import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { LESSONS } from '../../curriculum/lessons.js';
import { newProfile } from '../../profile/profile.js';
import { clampTaughtUpTo, normalizeSettings } from '../../profile/settings.js';
import { artUrl, layeredArt } from '../../ui/components.js';
import { castArt, LOOK_OPTIONS } from '../../ui/story-stage.js';
import { hashPin, isValidPin, unsavedBanner } from './gate.js';
import { RESTORED_MESSAGE, restoreControls } from './restore.js';



export const SETUP_STEPS = Object.freeze(['pin', 'names', 'look', 'lesson', 'copilot', 'soundcheck']);

export const NAME_MAX = 24;
const FIRST_LESSON = 1;
const LAST_LESSON = 68;

const capitalized = (id) => id.charAt(0).toUpperCase() + id.slice(1);

export const LOOK_CHOICES = Object.freeze({
  skin: Object.freeze(LOOK_OPTIONS.skin.map((id) => ({ id, label: `Skin ${id.slice(1)}` }))),
  hair: Object.freeze(LOOK_OPTIONS.hair.map((id) => ({ id, label: capitalized(id) }))),
  hairColor: Object.freeze(LOOK_OPTIONS.hairColor.map((id) => ({ id, label: capitalized(id) }))),
  kittenFur: Object.freeze(LOOK_OPTIONS.kittenFur.map((id) => ({ id, label: capitalized(id) }))),
});

export const lastContentLesson = (content) => Math.max(0, ...(content.words ?? []).map((w) => w.lesson).filter(Number.isFinite));

export function contentNote(taughtUpTo, content) {
  const last = lastContentLesson(content);
  return taughtUpTo > last ? `This version has practice words up to lesson ${last}; later lessons arrive in updates.` : null;
}

export const cleanName = (name) => String(name ?? '').replace(/\s+/g, ' ').trim();

export function checkSetupStep(step, answers) {
  if (step === 'pin') {
    if (!isValidPin(answers.pin)) return 'Choose a PIN of 4 to 8 digits.';
    if (answers.pin !== answers.pin2) return "The two PINs don't match. Type the same PIN in both boxes.";
  }
  if (step === 'names') {
    const princess = cleanName(answers.princessName);
    const kitten = cleanName(answers.kittenName);
    if (!princess) return 'Type a name for her princess.';
    if (!kitten) return 'Type a name for her kitten.';
    if (princess.length > NAME_MAX || kitten.length > NAME_MAX) return `Keep each name to ${NAME_MAX} characters or fewer.`;
  }
  if (step === 'lesson') {
    const n = answers.taughtUpTo;
    if (!Number.isInteger(n) || (n) < FIRST_LESSON || (n) > LAST_LESSON) return `Choose a lesson from ${FIRST_LESSON} to ${LAST_LESSON}.`;
  }
  return null;
}

export async function finishSetup(settings, answers) {
  const taughtUpTo = clampTaughtUpTo(answers.taughtUpTo);
  const next = normalizeSettings({ ...settings, taughtUpTo, copilot: answers.copilot !== false, pin: await hashPin(String(answers.pin)) });
  const profile = newProfile(taughtUpTo);
  profile.princessName = cleanName(answers.princessName).slice(0, NAME_MAX);
  profile.kittenName = cleanName(answers.kittenName).slice(0, NAME_MAX);
  for (const [key, choices] of Object.entries(LOOK_CHOICES)) {
    const value = answers.look?.[ (key)];
    if (choices.some((choice) => choice.id === value)) profile.look[ (key)] = (value);
  }
  return { settings: next, profile };
}

export function mount(el, ctx) {
  if (typeof ctx.settings.pin === 'string') {
    ctx.router.go('grownup/gate').catch(( err) => console.error('The grown-up gate could not open', err));
    return () => {};
  }
  const lock = createLock();
  const draft = ctx.setupDraft ?? { index: 0, answers: { pin: '', pin2: '', princessName: '', kittenName: '', look: { ...ctx.profile.look },
    taughtUpTo: ctx.settings.taughtUpTo, copilot: ctx.settings.copilot } };
  ctx.setupDraft = draft;
  const { answers } = draft;

  const count = h('p', { class: 'gu-step-count' });
  const panel = h('div', { class: 'gu-setup-step' });
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const back = h('button', { type: 'button', class: 'gu-button', onClick: () => { draft.index = Math.max(0, draft.index - 1); show(); } }, 'Back');
  const next = h('button', { type: 'submit', class: 'gu-button gu-primary' }, 'Next');

  const field = (label, id, value, set, attrs = {}) => h('div', { class: 'gu-field' },
    h('label', { class: 'gu-label', for: id }, label),
    h('input', { class: 'gu-input', id, value, autocomplete: 'off', onInput: ( e) => set( (e.target).value), ...attrs }));

  const swatches = (key, title) => h('div', { class: 'gu-swatch-row', role: 'group', 'aria-label': title },
    h('p', { class: 'gu-label' }, title),
    h('div', { class: 'gu-swatches' }, LOOK_CHOICES[key].map(({ id, label }) => {
      const look = { ...answers.look, [key]: id };
      const art = key === 'kittenFur' ? layeredArt(castArt('kitten', look), 'gu-swatch-kitten') : layeredArt(castArt('princess', look), 'gu-swatch-princess');
      return h('button', { type: 'button', class: 'gu-swatch', 'data-choice': `${key}:${id}`, 'aria-pressed': String(answers.look[key] === id),
        onClick: () => { answers.look[key] = id; show(`${key}:${id}`); } },
      h('span', { class: 'gu-swatch-art' }, art), h('span', {}, label));
    })));

  const lessonSelect = () => h('select', { class: 'gu-select', id: 'gu-setup-lesson',
    onChange: ( e) => { answers.taughtUpTo = Number( (e.target).value); show(); } },
  LESSONS.map((lesson) => h('option', { value: String(lesson.n), selected: lesson.n === answers.taughtUpTo }, `${lesson.n}: ${lesson.concept}`)));

  const restoring = restoreControls(ctx, { needsPin: true, onRestored: () => restored() });
  const restored = () => {
    ctx.setupDraft = null;
    count.textContent = '';
    back.hidden = true;
    next.hidden = true;
    message.textContent = '';
    panel.replaceChildren(
      h('h1', { class: 'gu-title' }, 'Welcome back!'),
      h('p', {}, RESTORED_MESSAGE),
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { lock.run(() => ctx.router.go('hub')).catch((err) => console.error('The castle could not open', err)); } }, 'Go to the castle'));
  };

  const lessonNote = () => {
    const note = contentNote(answers.taughtUpTo, ctx.content);
    return note ? h('p', { class: 'gu-hint' }, note) : null;
  };

  const views = {
    pin: () => [
      h('h1', { class: 'gu-title' }, "Welcome! A few questions for the grown-up"),
      h('p', {}, 'First, choose a PIN for the grown-up corner, where the settings and her progress are. It keeps little fingers out; holding a button for 3 seconds opens the corner too.'),
      field('PIN (4 to 8 digits)', 'gu-setup-pin', answers.pin, (v) => { answers.pin = v; }, { type: 'password', inputmode: 'numeric', maxlength: '8' }),
      field('The same PIN again', 'gu-setup-pin2', answers.pin2, (v) => { answers.pin2 = v; }, { type: 'password', inputmode: 'numeric', maxlength: '8' }),
      h('section', { class: 'gu-restore' },
        h('h2', { class: 'gu-subtitle' }, 'Restoring from a backup?'),
        h('p', { class: 'gu-hint' }, 'If she already plays on another computer, skip these questions: choose the backup file saved there. It brings back her progress, the settings, the recordings and the PIN.'),
        ...restoring.nodes),
    ],
    names: () => [
      h('h1', { class: 'gu-title' }, 'Her princess and her kitten'),
      h('p', {}, 'She will see these names in the game. The narrator says "Princess" and "Kitty"; you can record the names in your own voice later, in Sound check.'),
      field("Her princess's name", 'gu-setup-princess', answers.princessName, (v) => { answers.princessName = v; }, { maxlength: String(NAME_MAX) }),
      field("Her kitten's name", 'gu-setup-kitten', answers.kittenName, (v) => { answers.kittenName = v; }, { maxlength: String(NAME_MAX) }),
    ],
    look: () => [
      h('h1', { class: 'gu-title' }, 'How they look'),
      h('div', { class: 'gu-look' },
        h('div', { class: 'gu-look-preview', 'aria-hidden': 'true' }, layeredArt(castArt('princess', answers.look), 'gu-look-princess'), layeredArt(castArt('kitten', answers.look), 'gu-look-kitten')),
        h('div', { class: 'gu-look-choices' },
          swatches('skin', 'Skin'), swatches('hair', 'Hair'), swatches('hairColor', 'Hair color'), swatches('kittenFur', 'Kitten fur'))),
      h('p', { class: 'gu-hint' }, 'She can change outfits and crowns herself in the dress-up room.'),
    ],
    lesson: () => [
      h('h1', { class: 'gu-title' }, 'Which UFLI lesson has she been taught up to?'),
      h('p', {}, "Everything she reads or spells in the game uses only the patterns taught up to this lesson. Ask her tutor if you're not sure; you can change it any time in Settings as her tutor moves on."),
      h('div', { class: 'gu-field' }, h('label', { class: 'gu-label', for: 'gu-setup-lesson' }, 'Taught up to lesson'), lessonSelect()),
      lessonNote(),
    ],
    copilot: () => [
      h('h1', { class: 'gu-title' }, 'Will a grown-up play with her?'),
      h('p', {}, "The game works best with a grown-up beside her (the co-pilot). When it's your turn, you judge her reading with ✓ Yes, ↻ Try again or 🔊 Help. On days with no grown-up, she checks herself instead. She can switch this at the start of each session too."),
      h('div', { class: 'gu-segmented', role: 'group', 'aria-label': 'Co-pilot' },
        [[true, 'Yes, a grown-up plays with her (co-pilot on)'], [false, 'No, she plays on her own']].map(([value, label]) =>
          h('button', { type: 'button', class: 'gu-choice', 'aria-pressed': String(answers.copilot === value), onClick: () => { answers.copilot = (value); show(); } }, (label)))),
    ],
    soundcheck: () => [
      h('h1', { class: 'gu-title' }, 'One more thing: a 5-minute sound check'),
      h('p', {}, "The narrator's voice was made by a computer, and nobody has listened to it for her yet. Before her first session, please spend about 5 minutes in Sound check listening to the letter sounds (about 45 short clips)."),
      h('p', {}, 'If a sound is off (an extra "uh" on /b/, say), flag it, or record it again in your own voice. Your recording replaces it everywhere in the game.'),
      h('div', { class: 'gu-row' },
        h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => finish('grownup/soundcheck', { unlocked: true }) }, 'Finish and open Sound check'),
        h('button', { type: 'button', class: 'gu-button', onClick: () => finish('hub') }, 'Finish and go to the castle')),
    ],
  };

  function show(focusChoice) {
    const step = SETUP_STEPS[draft.index];
    count.textContent = `Step ${draft.index + 1} of ${SETUP_STEPS.length}`;
    panel.replaceChildren(...views[step]().filter((node) => node !== null));
    back.hidden = draft.index === 0;
    next.hidden = draft.index === SETUP_STEPS.length - 1;
    message.textContent = '';
    const focus = focusChoice ? panel.querySelector(`[data-choice="${focusChoice}"]`) : panel.querySelector('input, select');
    (focus)?.focus();
  }

  function forward() {
    const problem = checkSetupStep(SETUP_STEPS[draft.index], answers);
    if (problem) { message.textContent = problem; return; }
    draft.index = Math.min(SETUP_STEPS.length - 1, draft.index + 1);
    show();
  }

  const finish = (scene, params) => lock.run(async () => {
    const done = await finishSetup(ctx.settings, answers);
    ctx.settings = done.settings;
    ctx.profile = done.profile;
    try {
      await ctx.save();
    } catch (err) {
      console.error('Setup could not be saved', err);
      message.textContent = "Saving didn't work in this browser window. Please try Finish again.";
      return;
    }
    ctx.setupDraft = null;
    await ctx.router.go(scene, params);
  }).catch((err) => console.error('Setup could not finish', err));

  el.append(h('div', { class: 'grownup' },
    h('img', { class: 'scene-bg', src: artUrl('bg/grownup'), alt: '' }),
    h('form', { class: 'gu-card gu-setup', onSubmit: ( event) => { event.preventDefault(); forward(); } },
      unsavedBanner(ctx),
      count,
      panel,
      message,
      h('div', { class: 'gu-row gu-setup-nav' }, back, next))));
  show();
  return () => {};
}

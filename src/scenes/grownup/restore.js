import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { checkBackup, importBackup } from '../../profile/backup.js';
import { readSaved } from '../../profile/saved.js';

export const EMPTY_BACKUP = 'This backup has no progress in it; restoring it removes her progress here.';

export const restoreQuestion = (name, { hasProgress = true } = {}) => (hasProgress
  ? `Restore "${name}"? It replaces her progress, the settings (including the grown-up PIN) and the recordings in this browser with the ones in the file.`
  : `Restore "${name}"? ${EMPTY_BACKUP} It also replaces the settings (including the grown-up PIN) and the recordings in this browser with the ones in the file.`);

export const RESTORED_MESSAGE = 'Backup restored. Her progress, the settings and the recordings are back. The grown-up PIN is now the one from the backup, so use that PIN from now on.';

export const NO_PIN_MESSAGE = "That backup was made before setup was finished, so it can't be used to start here. Answer the setup questions instead.";

export function restoreControls(ctx, { needsPin = false, onRestored } = {}) {
  const lock = createLock();
  const message = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });
  const confirmBox = h('div', { class: 'gu-confirm', hidden: true });
  let picked = null;

  const input = (h('input', { type: 'file', class: 'gu-file', hidden: true, accept: '.json,application/json',
    onChange: () => { pick(input.files?.[0] ?? null).catch((err) => console.error('The backup file could not be checked', err)); } }));

  const pick = (file) => lock.run(async () => {
    input.value = '';
    picked = null;
    confirmBox.hidden = true;
    message.textContent = '';
    if (!file) return;
    let text;
    try {
      text = await file.text();
    } catch (err) {
      console.error('The backup file could not be read', err);
      message.textContent = "That file couldn't be read, so nothing was changed.";
      return;
    }
    const checked = checkBackup(text);
    if (!checked.ok) { message.textContent = checked.reason; return; }
    if (needsPin && !checked.hasPin) { message.textContent = NO_PIN_MESSAGE; return; }
    picked = { name: file.name, text };
    confirmBox.replaceChildren(
      h('p', {}, restoreQuestion(file.name, checked)),
      h('div', { class: 'gu-row' },
        h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { restore(); } }, 'Restore this backup'),
        h('button', { type: 'button', class: 'gu-button', onClick: () => { picked = null; confirmBox.hidden = true; } }, 'Cancel')));
    confirmBox.hidden = false;
    confirmBox.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
  });

  const restore = () => lock.run(async () => {
    const file = picked;
    picked = null;
    confirmBox.hidden = true;
    if (!file) return;
    const result = await importBackup(ctx.store, file.text);
    if (!result.ok) { message.textContent = result.reason; return; }
    const saved = await readSaved(ctx.store);
    ctx.settings = saved.settings;
    ctx.profile = saved.profile;
    ctx.states = saved.states;
    ctx.today = saved.today;
    ctx.pages = null;
    await ctx.audio.reloadOverrides();
    await ctx.save();
    message.textContent = RESTORED_MESSAGE;
    onRestored?.();
  }).catch((err) => {
    console.error('The backup could not be restored', err);
    message.textContent = "The backup couldn't be restored in this browser window.";
  });

  const choose = h('button', { type: 'button', class: 'gu-button', onClick: () => input.click() }, 'Choose a backup file');
  return { nodes: [choose, input, confirmBox, message], message };
}

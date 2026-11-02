import { h } from '../../core/dom.js';
import { createLock } from '../../core/lock.js';
import { exportBackup } from '../../profile/backup.js';
import { heroWords } from '../../profile/hero.js';
import { cornerFrame } from './gate.js';
import { restoreControls } from './restore.js';

const MS_PER_DAY = 86400000;

export const backupFileName = (day) => `whisker-academy-backup-${new Date(day * MS_PER_DAY).toISOString().slice(0, 10)}.json`;

export function mount(el, ctx, params = {}) {
  const body = cornerFrame(el, ctx, params, 'backup');
  if (!body) return () => {};
  const hx = heroWords(ctx);
  const lock = createLock();
  const urls = [];

  const exportMessage = h('p', { class: 'gu-message', role: 'status', 'aria-live': 'polite' });

  const save = () => lock.run(async () => {
    let text;
    try {
      await ctx.save();
      text = await exportBackup(ctx.store);
    } catch (err) {
      console.error('The backup could not be made', err);
      exportMessage.textContent = `The backup couldn't be made: ${err instanceof Error ? err.message : err}`;
      return;
    }
    const name = backupFileName(ctx.day);
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    urls.push(url);
    const link = h('a', { href: url, download: name, hidden: true });
    el.append(link);
    link.click();
    link.remove();
    exportMessage.textContent = `Backup file made: ${name}. ${hx('Your browser puts it in your Downloads. Keep it somewhere safe; it holds her progress and your recordings.')}`;
  });

  const restoring = restoreControls(ctx);

  body.append(
    h('p', {}, hx("Her progress lives only in this browser on this computer. Save a backup now and then, and before moving to another computer: restore it there from this screen.")),
    h('section', { class: 'gu-setting' },
      h('h2', { class: 'gu-setting-label' }, 'Save a backup file'),
      h('p', { class: 'gu-help' }, hx('One .json file with her progress, the settings, the color-in pages and your recordings.')),
      h('button', { type: 'button', class: 'gu-button gu-primary', onClick: () => { save().catch((err) => console.error(err)); } }, 'Save a backup file'),
      exportMessage),
    h('section', { class: 'gu-setting' },
      h('h2', { class: 'gu-setting-label' }, 'Restore from a backup file'),
      h('p', { class: 'gu-help' }, 'Pick a backup file saved from this game. It is checked first; a file that is not a good backup changes nothing. A restore also brings back the grown-up PIN from the file.'),
      ...restoring.nodes));
  return () => { for (const url of urls) URL.revokeObjectURL(url); };
}

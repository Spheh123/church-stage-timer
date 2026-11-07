import { db, ref, onValue } from './firebase.js';
import { normalizeDisplaySettings } from './console-model.js';

export function watchDisplaySettings() {
  onValue(ref(db, 'displaySettings'), snapshot => {
    const settings = normalizeDisplaySettings(snapshot.val() || {});
    document.body.classList.toggle('high-contrast', settings.theme === 'contrast');
    document.body.classList.toggle('large-display', settings.size === 'large');
    document.querySelectorAll('[data-church-logo]').forEach(image => {
      image.hidden = !settings.logo;
      if (settings.logo) image.src = settings.logo;
      else image.removeAttribute('src');
    });
    for (const [id, key] of [['displayTheme', 'theme'], ['displaySize', 'size']]) {
      const input = document.getElementById(id);
      if (input) input.value = settings[key];
    }
  });
}

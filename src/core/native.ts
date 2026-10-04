import { IS_APP } from '../config/platform';
import { SAVE_KEY } from '../config/game';
import { setStorageMirror } from './save';

// The iPhone app's native touches. Everything here does nothing on the website.

// iOS may clear a web view's storage when the phone runs short of space, so in the app
// every save is mirrored into the app's own preferences and copied back on launch.
export async function initNative(): Promise<void> {
  if (!IS_APP) return;
  const { Preferences } = await import('@capacitor/preferences');
  try {
    const { keys } = await Preferences.keys();
    for (const key of keys) {
      if (!key.startsWith(SAVE_KEY) || localStorage.getItem(key) !== null) continue;
      const { value } = await Preferences.get({ key });
      if (value !== null) localStorage.setItem(key, value);
    }
  } catch {
    // Preferences unavailable: the web view's own storage still holds the saves.
  }
  setStorageMirror((key, value) => {
    void (value === null ? Preferences.remove({ key }) : Preferences.set({ key, value })).catch(() => undefined);
  });

  // Game sound mixes with the player's own music and follows the silent switch, as games do.
  const nav = navigator as Navigator & { audioSession?: { type: string } };
  if (nav.audioSession) nav.audioSession.type = 'ambient';
}

// A soft tap of the phone's vibration motor: 'light' for a solve, 'medium' for a finished region.
export function haptic(weight: 'light' | 'medium'): void {
  if (!IS_APP) return;
  void import('@capacitor/haptics')
    .then(({ Haptics, ImpactStyle }) => Haptics.impact({ style: weight === 'light' ? ImpactStyle.Light : ImpactStyle.Medium }))
    .catch(() => undefined);
}

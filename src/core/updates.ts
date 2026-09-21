import { registerSW } from 'virtual:pwa-register';

// The installed app checks for a new version on every launch and every hour, downloads it
// in the background, and applies it at the next quiet moment (title or map), never mid-level.
let updateReady = false;
let activate: (() => Promise<void>) | null = null;

export function installUpdates(): void {
  activate = registerSW({
    immediate: true,
    onNeedRefresh() {
      updateReady = true;
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      setInterval(() => void registration.update(), 60 * 60 * 1000);
    },
  });
}

// Called by the game when it reaches a safe screen; reloads into the new version if one is waiting.
export function applyUpdateIfReady(): void {
  if (!updateReady || !activate) return;
  updateReady = false;
  // Tells the waiting service worker to take over, then reloads into the new version.
  void activate();
}

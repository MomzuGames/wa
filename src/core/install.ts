// Where the install link was opened, which decides what the install guide shows.
// Phones never let a page add itself to the home screen: Android can raise its own
// install prompt from one tap, iPhone needs the player to use Safari's menu.

export type InstallContext =
  | 'installed' // already running from the home screen
  | 'desktop' // laptops play in the browser; no guide
  | 'android' // Chrome-like browser that can install
  | 'android-inapp' // a chat or social app's built-in browser
  | 'ios-safari'
  | 'ios-other'; // another iPhone browser or an app's built-in browser

export const INSTALL_PARAM = 'install';

const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|Twitter|LinkedInApp|WhatsApp|MicroMessenger|GSA\/|; wv\)/;
const IOS_OTHER_BROWSER = /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/;

export function installContext(ua: string, standalone: boolean, touchPoints: number): InstallContext {
  if (standalone) return 'installed';
  // iPads report themselves as Macs; touch support gives them away.
  const ios = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1);
  if (ios) return IN_APP.test(ua) || IOS_OTHER_BROWSER.test(ua) ? 'ios-other' : 'ios-safari';
  if (/Android/.test(ua)) return IN_APP.test(ua) ? 'android-inapp' : 'android';
  return 'desktop';
}

export function wantsInstallGuide(search: string): boolean {
  return new URLSearchParams(search).has(INSTALL_PARAM);
}

// The address to send people: the game, opening on the install guide.
export function installLink(origin: string, pathname: string): string {
  return `${origin}${pathname}?${INSTALL_PARAM}`;
}

// Opens the same page in Chrome from an Android app's built-in browser.
export function chromeIntent(host: string, pathname: string): string {
  return `intent://${host}${pathname}?${INSTALL_PARAM}#Intent;scheme=https;package=com.android.chrome;end`;
}

// Opens the same page in Safari from another iPhone app (iOS 17 and later).
export function safariLink(host: string, pathname: string): string {
  return `x-safari-https://${host}${pathname}?${INSTALL_PARAM}`;
}

export function isStandalone(): boolean {
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia('(display-mode: standalone)').matches;
}

// Chrome announces that the page can be installed once; keep the event until the player taps.
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
const waiting: Array<() => void> = [];

export function captureInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    waiting.splice(0).forEach((cb) => cb());
  });
}

export function installPrompt(): InstallPromptEvent | null {
  return deferred;
}

export function onInstallPromptReady(cb: () => void): void {
  if (deferred) cb();
  else waiting.push(cb);
}

export function clearInstallPrompt(): void {
  deferred = null;
}

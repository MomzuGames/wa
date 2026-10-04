import { IS_APP } from '../config/platform';
import { isFullGame, setFullGame } from './save';
import { events } from './events';

// How the full journey is unlocked.
// - Website: a family code. Only its SHA-256 lives here, so the page source never shows
//   the code itself (a determined person could still bypass a check that runs in the
//   browser; this is a family code, not copy protection).
// - iPhone app: an Apple in-app purchase (Apple does not allow codes). Until the paid
//   developer account exists, a test store stands in: Unlock works at once, and the
//   profile card can lock the journey again to test it twice.
export const STORE: 'code' | 'test' = IS_APP ? 'test' : 'code';

// The website code. To change it, run: printf 'yourcode' | shasum -a 256
// (lowercase, letters and digits only) and paste the result here.
export const CODE_HASH = 'cdbbbc341bebabfe58ae5c26de8c1585423a46971b421e647dad079de32198d3';

// Codes are forgiving: case, spaces and dashes do not matter.
export function normaliseCode(code: string): string {
  return code.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function setUnlocked(value: boolean): void {
  setFullGame(value);
  events.emit('unlock:changed');
  events.emit('progress:changed');
}

export async function unlockWithCode(code: string): Promise<boolean> {
  const ok = (await sha256Hex(normaliseCode(code))) === CODE_HASH;
  if (ok) setUnlocked(true);
  return ok;
}

// The app's Unlock button.
export async function purchase(): Promise<boolean> {
  setUnlocked(true);
  return true;
}

// The app's Restore button: with the test store there is nothing to restore from.
export async function restore(): Promise<boolean> {
  return isFullGame();
}

// Test store only: lock the journey again.
export function relock(): void {
  if (STORE === 'test') setUnlocked(false);
}

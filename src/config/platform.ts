// True in the copy built for the iPhone app (`vite build --mode app`), false on the website.
// A build-time constant, so website-only code is dropped from the app and the other way round.
export const IS_APP = import.meta.env.MODE === 'app';

// A test build for the owner (VITE_TEST_TOOLS=1): the profile card gains a Testing section
// that shows the world before and after every land is finished, and plays the opening or
// the ending on demand. Progress is never touched. Released builds have none of it.
export const TEST_TOOLS = import.meta.env.VITE_TEST_TOOLS === '1';

const ENDING_KEY = 'chowa.test.ending';

// Whether the world is shown as if every land were finished (a test build's switch).
export function previewEnding(): boolean {
  if (!TEST_TOOLS) return false;
  try {
    return localStorage.getItem(ENDING_KEY) === '1';
  } catch {
    return false;
  }
}

export function setPreviewEnding(on: boolean): void {
  try {
    localStorage.setItem(ENDING_KEY, on ? '1' : '0');
  } catch {
    // ignore
  }
}

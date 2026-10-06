// True in the copy built for the iPhone app (`vite build --mode app`), false on the website.
// A build-time constant, so website-only code is dropped from the app and the other way round.
export const IS_APP = import.meta.env.MODE === 'app';

// A preview build for the owner (build with VITE_PREVIEW_ENDING=1): the book plays the whole
// story to its ending, and the map shows the world come alive, without finishing every land.
// Progress is never touched.
export const PREVIEW_ENDING = import.meta.env.VITE_PREVIEW_ENDING === '1';

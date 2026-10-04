// True in the copy built for the iPhone app (`vite build --mode app`), false on the website.
// A build-time constant, so website-only code is dropped from the app and the other way round.
export const IS_APP = import.meta.env.MODE === 'app';

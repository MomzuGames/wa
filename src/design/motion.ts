// All timings and easings live here. See CLAUDE.md §4.
export const easings = {
  ambient: 'sine.inOut',
  response: 'expo.out',
  tileSnap: 'back.out(1.4)',
} as const;

export const durations = {
  microFeedback: 0.2,
  pieceMove: 0.32,
  sceneTransition: 1.1,
  completion: 3.2,
  breathe: 4,
  logoFadeIn: 2.4,
  hudHover: 0.25,
  panelToggle: 0.45,
} as const;

export const breathe = {
  scaleFrom: 1.0,
  scaleTo: 1.05,
} as const;

// For a single focal element (title dot): a fuller breath, inhale shorter than exhale.
export const heroBreathe = {
  scaleFrom: 1.0,
  scaleTo: 1.18,
  glowFrom: 1.2,
  glowTo: 3.4,
  haloFrom: 0.0,
  haloTo: 0.22,
  haloScaleTo: 1.25,
  inhale: 1.7,
  exhale: 2.5,
} as const;

export const dust = {
  count: 32,
  speedMin: 5,
  speedMax: 16,
  radiusMin: 1.6,
  radiusMax: 4,
  wobble: 0.9,
} as const;

let reducedBySetting = false;
const reducedByOS = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

export function setReducedMotion(value: boolean): void {
  reducedBySetting = value;
}

export function reducedMotion(): boolean {
  return reducedBySetting || reducedByOS;
}

// Scales any long-form duration down when reduced motion is on; feedback stays intact.
export function scaled(duration: number): number {
  return reducedMotion() ? duration * 0.4 : duration;
}

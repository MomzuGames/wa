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
} as const;

export const breathe = {
  scaleFrom: 1.0,
  scaleTo: 1.05,
} as const;

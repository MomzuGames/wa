import gsap from 'gsap';
import type { Container } from 'pixi.js';
import { durations, easings, scaled } from '../design/motion';

export function fadeIn(target: Container, duration = durations.sceneTransition): Promise<void> {
  target.alpha = 0;
  return new Promise((resolve) => {
    gsap.to(target, { alpha: 1, duration: scaled(duration), ease: easings.ambient, onComplete: resolve });
  });
}

export function fadeOut(target: Container, duration = durations.sceneTransition): Promise<void> {
  return new Promise((resolve) => {
    gsap.to(target, { alpha: 0, duration: scaled(duration), ease: easings.ambient, onComplete: resolve });
  });
}

export function crossFade(outgoing: Container | null, incoming: Container): Promise<void> {
  const tasks = [fadeIn(incoming)];
  if (outgoing) tasks.push(fadeOut(outgoing));
  return Promise.all(tasks).then(() => undefined);
}

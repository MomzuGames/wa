import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import { palette } from '../design/palette';
import { easings } from '../design/motion';
import { drawIcon, type IconName } from './icons';

// Small shared pieces for the instruction-card demonstrations: a pearl "finger" that taps,
// holds or drags, and a miniature of an on-screen button.

export const glyphStyle = {
  fingerRadius: 8,
  fingerAlpha: 0.65,
  tapScale: 0.7,
  holdRingRadius: 15,
  buttonRadius: 13,
} as const;

// A looping demo timeline with the usual pause between repeats.
export function loopTimeline(repeatDelay = 1): gsap.core.Timeline {
  return gsap.timeline({ repeat: -1, repeatDelay });
}

export function makeFinger(): Graphics {
  const g = new Graphics().circle(0, 0, glyphStyle.fingerRadius).fill({ color: palette.pearl, alpha: glyphStyle.fingerAlpha });
  g.alpha = 0;
  return g;
}

// Appears at a point and taps once. Returns the timeline for chaining.
export function tapAt(tl: gsap.core.Timeline, finger: Graphics, x: number, y: number, delay = 0.4, position?: string): gsap.core.Timeline {
  return tl
    .set(finger, { x, y }, position)
    .to(finger, { alpha: 1, duration: 0.2, delay })
    .to(finger.scale, { x: glyphStyle.tapScale, y: glyphStyle.tapScale, duration: 0.14, yoyo: true, repeat: 1 });
}

// Presses and stays: a ring closes around the finger while it holds.
export function holdAt(tl: gsap.core.Timeline, finger: Graphics, ring: Graphics, x: number, y: number, seconds = 0.8, delay = 0.4): gsap.core.Timeline {
  const state = { p: 0 };
  return tl
    .set(finger, { x, y })
    .to(finger, { alpha: 1, duration: 0.2, delay })
    .to(finger.scale, { x: glyphStyle.tapScale, y: glyphStyle.tapScale, duration: 0.14 })
    .set(state, { p: 0 })
    .to(state, {
      p: 1,
      duration: seconds,
      ease: 'none',
      onUpdate: () => {
        ring.clear().arc(x, y, glyphStyle.holdRingRadius, -Math.PI / 2, -Math.PI / 2 + state.p * Math.PI * 2).stroke({ color: palette.pearl, width: 1.5, alpha: 0.8 });
      },
    })
    .call(() => ring.clear())
    .to(finger.scale, { x: 1, y: 1, duration: 0.14 });
}

export function liftFinger(tl: gsap.core.Timeline, finger: Graphics, delay = 0.3): gsap.core.Timeline {
  return tl.to(finger, { alpha: 0, duration: 0.25, delay });
}

// A miniature HUD button, so a page can show "press this button" without words.
export function miniButton(name: IconName, accent: number): Container {
  const root = new Container();
  const ring = new Graphics().circle(0, 0, glyphStyle.buttonRadius).fill({ color: palette.ink }).stroke({ color: accent, width: 1 });
  const icon = drawIcon(new Graphics(), name, glyphStyle.buttonRadius * 1.3, palette.pearl);
  root.addChild(ring, icon);
  return root;
}

// A soft flash to say "no": the target dips and recovers.
export function refuse(tl: gsap.core.Timeline, target: Container): gsap.core.Timeline {
  return tl.to(target, { alpha: 0.35, duration: 0.12, yoyo: true, repeat: 1, ease: easings.response });
}

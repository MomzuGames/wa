import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { RegionId } from '../regions/types';
import { REGION_ACCENT } from '../regions/catalog';
import { alphas, palette } from '../design/palette';
import { breathe, durations, easings, scaled } from '../design/motion';
import { layout } from '../design/layout';
import { createGlow } from '../fx/glow';

export type RegionState = 'locked' | 'unlocked' | 'complete';

export const regionNodeStyle = {
  size: 120,
  strokeWidth: 1.5,
  completeFillAlpha: 0.22,
  hoverScale: 1.06,
} as const;

// Each figure is drawn inside a box of `size`, centred on (0,0).
function drawFigure(g: Graphics, id: RegionId, size: number): void {
  const s = size / 2;
  switch (id) {
    case 'tidepools':
      g.circle(0, s * 0.1, s * 0.22);
      g.arc(0, s * 0.1, s * 0.5, Math.PI * 0.15, Math.PI * 1.85);
      g.moveTo(Math.cos(Math.PI * 0.05) * s * 0.8, s * 0.1 + Math.sin(Math.PI * 0.05) * s * 0.8);
      g.arc(0, s * 0.1, s * 0.8, Math.PI * 0.05, Math.PI * 0.95);
      break;
    case 'nightsky': {
      const pts = [
        [-0.7, 0.3],
        [-0.3, -0.5],
        [0.1, -0.1],
        [0.5, -0.6],
        [0.75, 0.2],
        [0.2, 0.55],
      ];
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x! * s, y! * s) : g.lineTo(x! * s, y! * s)));
      g.lineTo(pts[0]![0]! * s, pts[0]![1]! * s);
      pts.forEach(([x, y]) => g.circle(x! * s, y! * s, s * 0.05));
      break;
    }
    case 'stonegarden':
      g.ellipse(0, s * 0.55, s * 0.75, s * 0.28);
      g.ellipse(-s * 0.05, s * 0.02, s * 0.55, s * 0.24);
      g.ellipse(s * 0.05, -s * 0.42, s * 0.36, s * 0.2);
      break;
    case 'crystalcaves':
      g.moveTo(-s * 0.7, s * 0.7).lineTo(-s * 0.55, -s * 0.2).lineTo(-s * 0.3, s * 0.7);
      g.moveTo(-s * 0.25, s * 0.7).lineTo(0, -s * 0.75).lineTo(s * 0.3, s * 0.7);
      g.moveTo(s * 0.3, s * 0.7).lineTo(s * 0.5, -s * 0.1).lineTo(s * 0.72, s * 0.7);
      g.moveTo(-s * 0.8, s * 0.7).lineTo(s * 0.8, s * 0.7);
      break;
    case 'moonlake': {
      // Crescent: outer arc on the left, inner arc curving back between the same two tips.
      const cy = -s * 0.3;
      const R = s * 0.42;
      const dx = s * 0.26;
      const r = Math.hypot(dx, R);
      const tipAngle = Math.atan2(R, -dx);
      g.moveTo(0, cy + R);
      g.arc(0, cy, R, Math.PI / 2, Math.PI * 1.5);
      g.arc(dx, cy, r, -tipAngle + Math.PI * 2, tipAngle, true);
      g.moveTo(-s * 0.8, s * 0.55);
      g.quadraticCurveTo(-s * 0.4, s * 0.35, 0, s * 0.55);
      g.quadraticCurveTo(s * 0.4, s * 0.75, s * 0.8, s * 0.55);
      break;
    }
  }
}

export class RegionNode extends Container {
  private outline = new Graphics();
  private fill = new Graphics();
  private hit = new Graphics();
  private breatheTween: gsap.core.Tween | null = null;
  private _state: RegionState = 'locked';
  readonly accent: number;

  constructor(readonly id: RegionId, onPress: () => void) {
    super();
    this.accent = palette[REGION_ACCENT[id]];
    const half = regionNodeStyle.size / 2;
    this.hit.circle(0, 0, Math.max(layout.minHitSize, half * 0.9)).fill({ color: palette.pearl, alpha: 0.001 });
    this.addChild(this.hit, this.fill, this.outline);
    this.eventMode = 'static';
    this.on('pointertap', () => {
      if (this._state !== 'locked') onPress();
    });
    this.on('pointerover', () => this.hover(true));
    this.on('pointerout', () => this.hover(false));
    this.setState('locked', false);
  }

  get state(): RegionState {
    return this._state;
  }

  setState(state: RegionState, animate: boolean): Promise<void> {
    this._state = state;
    this.cursor = state === 'locked' ? 'default' : 'pointer';
    const color = state === 'locked' ? palette.dim : this.accent;
    this.outline.clear();
    drawFigure(this.outline, this.id, regionNodeStyle.size);
    this.outline.stroke({ color, width: regionNodeStyle.strokeWidth, cap: 'round', join: 'round' });
    this.outline.filters = state === 'locked' ? [] : [createGlow(this.accent, { distance: 22, strength: state === 'complete' ? 1.6 : 0.8 })];

    this.breatheTween?.kill();
    this.breatheTween = null;
    this.scale.set(1);
    if (state === 'unlocked') {
      this.breatheTween = gsap.to(this.scale, {
        x: breathe.scaleTo,
        y: breathe.scaleTo,
        duration: durations.breathe / 2,
        ease: easings.ambient,
        yoyo: true,
        repeat: -1,
      });
    }

    this.fill.clear();
    if (state === 'complete') {
      drawFigure(this.fill, this.id, regionNodeStyle.size);
      this.fill.circle(0, 0, regionNodeStyle.size * 0.55);
      this.fill.fill({ color: this.accent, alpha: regionNodeStyle.completeFillAlpha });
      this.fill.filters = [createGlow(this.accent, { distance: 40, strength: 1.2, quality: 0.3 })];
      if (animate) {
        this.fill.alpha = 0;
        this.fill.scale.set(0.4);
        return new Promise((resolve) => {
          gsap
            .timeline({ onComplete: resolve })
            .to(this.fill, { alpha: 1, duration: scaled(durations.completion) * 0.5, ease: easings.ambient })
            .to(this.fill.scale, { x: 1, y: 1, duration: scaled(durations.completion) * 0.5, ease: easings.response }, 0);
        });
      }
    }
    return Promise.resolve();
  }

  private hover(over: boolean): void {
    if (this._state === 'locked') return;
    gsap.to(this, { alpha: over ? 1 : alphas.hudHover, duration: durations.hudHover });
  }
}

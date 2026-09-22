import gsap from 'gsap';
import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import type { RegionId } from '../regions/types';
import { REGION_ACCENT, REGION_NAME } from '../regions/catalog';
import { alphas, palette, rgba } from '../design/palette';
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
    case 'shadowterrace': {
      // Three stones stacked in a corner, seen from above at an angle.
      const w = s * 0.42;
      const h = s * 0.21;
      const c = s * 0.34;
      const cube = (cx: number, cy: number) => {
        g.moveTo(cx, cy - h).lineTo(cx + w, cy).lineTo(cx, cy + h).lineTo(cx - w, cy).closePath();
        g.moveTo(cx - w, cy).lineTo(cx - w, cy + c).lineTo(cx, cy + h + c).lineTo(cx + w, cy + c).lineTo(cx + w, cy);
        g.moveTo(cx, cy + h).lineTo(cx, cy + h + c);
      };
      cube(0, s * 0.25);
      cube(0, s * 0.25 - c);
      cube(-w, s * 0.25 - h);
      cube(w, s * 0.25 - h);
      break;
    }
  }
}

export class RegionNode extends Container {
  private outline = new Graphics();
  private fill = new Graphics();
  private hit = new Graphics();
  private life = new Graphics();
  private nameLabel: Text;
  private aura = new Graphics();
  private time = 0;
  private focused = false;
  private breatheTween: gsap.core.Tween | null = null;
  private _state: RegionState = 'locked';
  readonly accent: number;

  constructor(readonly id: RegionId, onPress: () => void) {
    super();
    this.accent = palette[REGION_ACCENT[id]];
    const half = regionNodeStyle.size / 2;
    this.hit.circle(0, 0, Math.max(layout.minHitSize, half * 0.9)).fill({ color: palette.pearl, alpha: 0.001 });
    this.life.eventMode = 'none';
    this.aura.eventMode = 'none';
    // A soft pool of the region's own colour beneath the figure, brighter when focused.
    const gradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba(REGION_ACCENT[id], 0.16) },
        { offset: 1, color: rgba(REGION_ACCENT[id], 0) },
      ],
    });
    this.aura.circle(0, 0, regionNodeStyle.size * 2.2).fill(gradient);
    this.aura.blendMode = 'screen';
    this.aura.alpha = 0;
    this.nameLabel = new Text({
      text: REGION_NAME[id],
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 15, letterSpacing: 5, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    this.nameLabel.anchor.set(0.5);
    this.nameLabel.y = regionNodeStyle.size * 0.72;
    this.nameLabel.alpha = 0;
    this.nameLabel.eventMode = 'none';
    this.addChild(this.aura, this.hit, this.fill, this.outline, this.life, this.nameLabel);
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

    if (state !== 'locked' && !this.focused) this.aura.alpha = 0.45;
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

  // Idle life for each figure; only unlocked and complete regions stir.
  tick(dt: number): void {
    this.time += dt;
    const g = this.life;
    g.clear();
    if (this._state === 'locked') return;
    const s = regionNodeStyle.size / 2;
    const strength = this._state === 'complete' ? 1 : 0.6;
    switch (this.id) {
      case 'tidepools': {
        const p = (this.time / 5) % 1;
        g.circle(0, s * 0.1, s * (0.22 + p * 0.7)).stroke({ color: this.accent, width: 1, alpha: 0.35 * (1 - p) * strength });
        break;
      }
      case 'nightsky': {
        const pts = [[-0.7, 0.3], [-0.3, -0.5], [0.1, -0.1], [0.5, -0.6], [0.75, 0.2], [0.2, 0.55]];
        pts.forEach(([x, y], i) => {
          const tw = 0.5 + 0.5 * Math.sin(this.time * 1.4 + i * 1.7);
          g.circle(x! * s, y! * s, s * 0.05 + tw * 3).fill({ color: palette.pearl, alpha: 0.35 * tw * strength });
        });
        break;
      }
      case 'stonegarden': {
        for (let i = 0; i < 3; i++) {
          const p = ((this.time / 6 + i / 3) % 1);
          g.circle(-s * 0.5 + i * s * 0.5, s * 0.75 - p * s * 1.3, 1.5).fill({ color: this.accent, alpha: 0.35 * (1 - p) * strength });
        }
        break;
      }
      case 'crystalcaves': {
        const tips = [[-0.55, -0.2], [0, -0.75], [0.5, -0.1]];
        tips.forEach(([x, y], i) => {
          const tw = Math.max(0, Math.sin(this.time * 0.9 + i * 2.1));
          g.circle(x! * s, y! * s, 1.5 + tw * 3).fill({ color: palette.pearl, alpha: 0.5 * tw * strength });
        });
        break;
      }
      case 'shadowterrace': {
        // A lantern light drifting over the stones, its shadow band sweeping below.
        const p = (this.time / 7) % 1;
        const x = Math.sin(p * Math.PI * 2) * s * 0.5;
        g.circle(x, -s * 0.55 + Math.cos(p * Math.PI * 2) * s * 0.08, 2).fill({ color: palette.pearl, alpha: 0.5 * strength });
        g.moveTo(-s * 0.85, s * 0.78).lineTo(s * 0.85, s * 0.78).stroke({ color: this.accent, width: 1, alpha: 0.2 * strength });
        g.moveTo(x - s * 0.3, s * 0.78).lineTo(x + s * 0.3, s * 0.78).stroke({ color: this.accent, width: 2, alpha: 0.3 * strength });
        break;
      }
      case 'moonlake': {
        const w = Math.sin(this.time * 0.8) * s * 0.05;
        g.moveTo(-s * 0.8, s * 0.62 + w);
        g.quadraticCurveTo(-s * 0.4, s * 0.45 - w, 0, s * 0.62 + w);
        g.quadraticCurveTo(s * 0.4, s * 0.8 - w, s * 0.8, s * 0.62 + w);
        g.stroke({ color: this.accent, width: 1, alpha: 0.25 * strength });
        break;
      }
    }
  }

  private hover(over: boolean): void {
    if (this._state === 'locked') return;
    gsap.to(this, { alpha: over ? 1 : alphas.hudHover, duration: durations.hudHover });
    this.showName(over || this.focused);
    gsap.to(this.aura, { alpha: over || this.focused ? 1 : 0.45, duration: durations.panelToggle });
  }

  // The region the player is "at" keeps its name and aura showing.
  setFocused(focused: boolean): void {
    this.focused = focused;
    this.showName(focused);
    gsap.to(this.aura, { alpha: focused ? 1 : this._state === 'locked' ? 0 : 0.45, duration: durations.panelToggle });
  }

  private showName(visible: boolean): void {
    gsap.to(this.nameLabel, { alpha: visible ? alphas.hudHover : 0, y: regionNodeStyle.size * (visible ? 0.72 : 0.78), duration: durations.panelToggle, ease: easings.response });
  }
}

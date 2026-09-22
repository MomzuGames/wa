import gsap from 'gsap';
import { Container, FillGradient, Graphics, Text } from 'pixi.js';
import type { RegionId } from '../regions/types';
import { REGION_ACCENT, REGION_NAME } from '../regions/catalog';
import { palette, rgba } from '../design/palette';
import { durations, easings, reducedMotion, scaled } from '../design/motion';
import { layout } from '../design/layout';
import { createGlow } from '../fx/glow';

export type RegionState = 'locked' | 'unlocked' | 'complete';

export const regionNodeStyle = {
  size: 120,
  strokeWidth: 1.5,
  completeFillAlpha: 0.22,
  nameIdleAlpha: 0.3,
  nameNearAlpha: 0.75,
  auraIdle: 0.25,
  auraNear: 0.9,
  nearRadius: 190, // px: how close the light must come for a region to brighten
} as const;

// Each figure is drawn inside a box of `size`, centred on (0,0), and moves with time:
// the map is never still.
function drawFigure(g: Graphics, id: RegionId, size: number, t: number): void {
  const s = size / 2;
  const still = reducedMotion();
  const wave = (speed: number, phase = 0) => (still ? 0 : Math.sin(t * speed + phase));
  switch (id) {
    case 'tidepools': {
      // Rings breathing outward one after another, like a drop that keeps landing.
      const breathe = (i: number) => 1 + 0.07 * wave(1.6, -i * 1.1);
      g.circle(0, s * 0.1, s * 0.22 * breathe(0));
      g.arc(0, s * 0.1, s * 0.5 * breathe(1), Math.PI * 0.15, Math.PI * 1.85);
      const r2 = s * 0.8 * breathe(2);
      g.moveTo(Math.cos(Math.PI * 0.05) * r2, s * 0.1 + Math.sin(Math.PI * 0.05) * r2);
      g.arc(0, s * 0.1, r2, Math.PI * 0.05, Math.PI * 0.95);
      break;
    }
    case 'nightsky': {
      // The constellation sways as a whole and each star drifts a little on its own.
      const pts = [
        [-0.7, 0.3],
        [-0.3, -0.5],
        [0.1, -0.1],
        [0.5, -0.6],
        [0.75, 0.2],
        [0.2, 0.55],
      ].map(([x, y], i) => [x! * s + wave(0.7, i * 1.9) * s * 0.04, y! * s + wave(0.9, i * 1.3) * s * 0.04]);
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x!, y!) : g.lineTo(x!, y!)));
      g.lineTo(pts[0]![0]!, pts[0]![1]!);
      pts.forEach(([x, y], i) => g.circle(x!, y!, s * (0.05 + 0.02 * Math.max(0, wave(1.4, i * 1.7)))));
      break;
    }
    case 'stonegarden':
      // Balanced stones rocking ever so slightly, each on its own beat.
      g.ellipse(0, s * 0.55 + wave(1.1, 0) * s * 0.015, s * 0.75, s * 0.28);
      g.ellipse(-s * 0.05 + wave(0.8, 1) * s * 0.03, s * 0.02 + wave(1.1, 0.8) * s * 0.02, s * 0.55, s * 0.24);
      g.ellipse(s * 0.05 + wave(0.8, 2) * s * 0.05, -s * 0.42 + wave(1.1, 1.6) * s * 0.03, s * 0.36, s * 0.2);
      break;
    case 'crystalcaves': {
      // Crystals that grow and settle, their tips never quite still.
      const tip = (i: number) => wave(1.2, i * 2.1) * s * 0.05;
      g.moveTo(-s * 0.7, s * 0.7).lineTo(-s * 0.55, -s * 0.2 + tip(0)).lineTo(-s * 0.3, s * 0.7);
      g.moveTo(-s * 0.25, s * 0.7).lineTo(0, -s * 0.75 + tip(1)).lineTo(s * 0.3, s * 0.7);
      g.moveTo(s * 0.3, s * 0.7).lineTo(s * 0.5, -s * 0.1 + tip(2)).lineTo(s * 0.72, s * 0.7);
      g.moveTo(-s * 0.8, s * 0.7).lineTo(s * 0.8, s * 0.7);
      break;
    }
    case 'moonlake': {
      // The crescent rocks gently and its reflection rolls beneath.
      const cy = -s * 0.3 + wave(0.6) * s * 0.03;
      const R = s * 0.42;
      const dx = s * 0.26;
      const r = Math.hypot(dx, R);
      const tipAngle = Math.atan2(R, -dx);
      g.moveTo(0, cy + R);
      g.arc(0, cy, R, Math.PI / 2, Math.PI * 1.5);
      g.arc(dx, cy, r, -tipAngle + Math.PI * 2, tipAngle, true);
      const w = wave(0.8) * s * 0.06;
      g.moveTo(-s * 0.8, s * 0.55 + w);
      g.quadraticCurveTo(-s * 0.4, s * 0.35 - w, 0, s * 0.55 + w);
      g.quadraticCurveTo(s * 0.4, s * 0.75 - w, s * 0.8, s * 0.55 + w);
      break;
    }
    case 'shadowterrace': {
      // Stacked stones seen from above, each bobbing as if the terrace breathed.
      const w = s * 0.42;
      const h = s * 0.21;
      const c = s * 0.34;
      const cube = (cx: number, cy: number, k: number) => {
        const y = cy + wave(1.3, k * 1.4) * s * 0.03;
        g.moveTo(cx, y - h).lineTo(cx + w, y).lineTo(cx, y + h).lineTo(cx - w, y).closePath();
        g.moveTo(cx - w, y).lineTo(cx - w, y + c).lineTo(cx, y + h + c).lineTo(cx + w, y + c).lineTo(cx + w, y);
        g.moveTo(cx, y + h).lineTo(cx, y + h + c);
      };
      cube(0, s * 0.25, 0);
      cube(0, s * 0.25 - c, 1);
      cube(-w, s * 0.25 - h, 2);
      cube(w, s * 0.25 - h, 3);
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
  private near = 0; // 0..1: how close the light is
  private hovered = false;
  private chosen = false;
  private _state: RegionState = 'locked';
  readonly accent: number;

  constructor(readonly id: RegionId, onPress: () => void) {
    super();
    this.accent = palette[REGION_ACCENT[id]];
    const half = regionNodeStyle.size / 2;
    this.hit.circle(0, 0, Math.max(layout.minHitSize, half * 0.9)).fill({ color: palette.pearl, alpha: 0.001 });
    this.life.eventMode = 'none';
    this.aura.eventMode = 'none';
    // A soft pool of the region's own colour beneath the figure, brighter when the light is near.
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
    this.aura.alpha = regionNodeStyle.auraIdle;
    this.nameLabel = new Text({
      text: REGION_NAME[id],
      style: { fontFamily: 'Quicksand', fontWeight: '300', fontSize: 15, letterSpacing: 5, fill: palette.pearl },
      resolution: window.devicePixelRatio || 1,
    });
    this.nameLabel.anchor.set(0.5);
    this.nameLabel.y = regionNodeStyle.size * 0.74;
    this.nameLabel.alpha = regionNodeStyle.nameIdleAlpha;
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

  private redrawFigure(): void {
    const color = this._state === 'locked' ? palette.dim : this.accent;
    this.outline.clear();
    drawFigure(this.outline, this.id, regionNodeStyle.size, this.time);
    this.outline.stroke({ color, width: regionNodeStyle.strokeWidth, cap: 'round', join: 'round' });
    if (this._state === 'complete') {
      this.fill.clear();
      drawFigure(this.fill, this.id, regionNodeStyle.size, this.time);
      this.fill.circle(0, 0, regionNodeStyle.size * 0.55);
      this.fill.fill({ color: this.accent, alpha: regionNodeStyle.completeFillAlpha });
    }
  }

  setState(state: RegionState, animate: boolean): Promise<void> {
    this._state = state;
    this.cursor = state === 'locked' ? 'default' : 'pointer';
    this.outline.filters = state === 'locked' ? [] : [createGlow(this.accent, { distance: 22, strength: state === 'complete' ? 1.6 : 0.8 })];
    this.fill.clear();
    this.fill.filters = state === 'complete' ? [createGlow(this.accent, { distance: 40, strength: 1.2, quality: 0.3 })] : [];
    this.redrawFigure();
    if (state === 'complete' && animate) {
      this.fill.alpha = 0;
      this.fill.scale.set(0.4);
      return new Promise((resolve) => {
        gsap
          .timeline({ onComplete: resolve })
          .to(this.fill, { alpha: 1, duration: scaled(durations.completion) * 0.5, ease: easings.ambient })
          .to(this.fill.scale, { x: 1, y: 1, duration: scaled(durations.completion) * 0.5, ease: easings.response }, 0);
      });
    }
    return Promise.resolve();
  }

  // How close the light is (0 far, 1 on top of it): the name and aura brighten to meet it.
  setNear(strength: number): void {
    this.near = Math.max(0, Math.min(1, strength));
  }

  // The region the player chose: name fully lit while the light dives in.
  setChosen(chosen: boolean): void {
    this.chosen = chosen;
  }

  // The figure moves every frame; the ripples, twinkles and sparks live on top of it.
  tick(dt: number): void {
    this.time += dt;
    this.redrawFigure();
    const lift = this.chosen ? 1 : this.hovered ? 0.9 : this.near;
    const k = Math.min(1, dt * 5);
    const nameTarget = this.chosen ? 1 : regionNodeStyle.nameIdleAlpha + (regionNodeStyle.nameNearAlpha - regionNodeStyle.nameIdleAlpha) * lift;
    this.nameLabel.alpha += (nameTarget - this.nameLabel.alpha) * k;
    this.aura.alpha += (regionNodeStyle.auraIdle + (regionNodeStyle.auraNear - regionNodeStyle.auraIdle) * lift - this.aura.alpha) * k;
    const targetScale = 1 + 0.06 * lift + (reducedMotion() ? 0 : 0.02 * Math.sin(this.time * 0.8));
    this.scale.set(this.scale.x + (targetScale - this.scale.x) * k);
    const g = this.life;
    g.clear();
    if (this._state === 'locked') return;
    const s = regionNodeStyle.size / 2;
    const strength = (this._state === 'complete' ? 1 : 0.7) * (0.7 + 0.3 * lift);
    switch (this.id) {
      case 'tidepools': {
        // Two clear ripples rolling outward, one behind the other.
        for (let n = 0; n < 2; n++) {
          const p = ((this.time / 3.2 + n * 0.5) % 1 + 1) % 1;
          g.circle(0, s * 0.1, s * (0.15 + p * 0.95)).stroke({ color: this.accent, width: 2 - p, alpha: 0.85 * (1 - p) * strength });
        }
        break;
      }
      case 'nightsky': {
        const pts = [[-0.7, 0.3], [-0.3, -0.5], [0.1, -0.1], [0.5, -0.6], [0.75, 0.2], [0.2, 0.55]];
        pts.forEach(([x, y], i) => {
          const tw = 0.5 + 0.5 * Math.sin(this.time * 1.4 + i * 1.7);
          g.circle(x! * s, y! * s, s * 0.05 + tw * 4).fill({ color: palette.pearl, alpha: 0.4 * tw * strength });
        });
        break;
      }
      case 'stonegarden': {
        for (let i = 0; i < 3; i++) {
          const p = (this.time / 6 + i / 3) % 1;
          g.circle(-s * 0.5 + i * s * 0.5, s * 0.75 - p * s * 1.3, 1.5).fill({ color: this.accent, alpha: 0.45 * (1 - p) * strength });
        }
        break;
      }
      case 'crystalcaves': {
        const tips = [[-0.55, -0.2], [0, -0.75], [0.5, -0.1]];
        tips.forEach(([x, y], i) => {
          const tw = Math.max(0, Math.sin(this.time * 0.9 + i * 2.1));
          g.circle(x! * s, y! * s, 1.5 + tw * 4).fill({ color: palette.pearl, alpha: 0.6 * tw * strength });
        });
        break;
      }
      case 'shadowterrace': {
        // A light drifting over the stones, its shadow band sweeping below.
        const p = (this.time / 7) % 1;
        const x = Math.sin(p * Math.PI * 2) * s * 0.5;
        g.circle(x, -s * 0.55 + Math.cos(p * Math.PI * 2) * s * 0.08, 2).fill({ color: palette.pearl, alpha: 0.6 * strength });
        g.moveTo(-s * 0.85, s * 0.78).lineTo(s * 0.85, s * 0.78).stroke({ color: this.accent, width: 1, alpha: 0.25 * strength });
        g.moveTo(x - s * 0.3, s * 0.78).lineTo(x + s * 0.3, s * 0.78).stroke({ color: this.accent, width: 2, alpha: 0.4 * strength });
        break;
      }
      case 'moonlake': {
        // A glint travelling along the reflection.
        const p = (this.time / 4) % 1;
        const x = -s * 0.8 + p * s * 1.6;
        g.circle(x, s * 0.55 + Math.sin(p * Math.PI * 2) * s * 0.06, 2).fill({ color: palette.pearl, alpha: 0.5 * Math.sin(p * Math.PI) * strength });
        break;
      }
    }
  }

  private hover(over: boolean): void {
    if (this._state === 'locked') return;
    this.hovered = over;
  }
}

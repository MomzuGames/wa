import gsap from 'gsap';
import { Container, FillGradient, Graphics } from 'pixi.js';
import { palette, rgba, type PaletteToken } from '../design/palette';
import { breathe, durations, easings, reducedMotion, scaled } from '../design/motion';
import { createGlow } from '../fx/glow';
import type { ParticleSystem } from '../fx/particles';
import { events } from '../core/events';
import { Face } from './face';

export const spiritStyle = {
  radius: 9,
  haloRadius: 28,
  glideSeconds: 1.1,
  hopSeconds: 0.55,
  arcLift: 44,
  reactScale: 1.35,
  dimAlpha: 0.35,
  trailInterval: 0.022,
  trailLife: 1.1,
  orbitSpeed: 0.45,
  idleEvery: [4, 8] as const,
  squash: 0.78,
  wanderRadius: 26,
  wanderEvery: [1.6, 3.2] as const,
  swayAmount: 4,
} as const;

// The light that travels with the player: a small breathing creature with a face.
// It listens to spirit events so scenes never need a reference to it.
export class Spirit extends Container {
  private dot = new Graphics();
  private halo = new Graphics();
  private body = new Container();
  private sway = new Container();
  private face: Face;
  private breatheTween: gsap.core.Tween;
  private moving: gsap.core.Timeline | null = null;
  private trailClock = 0;
  private lastPos = { x: 0, y: 0 };
  private orbit: { cx: number; cy: number; r: number; angle: number } | null = null;
  private idleTimer: gsap.core.Tween | null = null;
  private busy = false;
  private hue: PaletteToken = 'mint';
  private anchor: { x: number; y: number } | null = null;
  private wanderTarget: { x: number; y: number } | null = null;
  private wanderClock = 0;
  private clock = 0;

  constructor(private particles: ParticleSystem) {
    super();
    this.halo.blendMode = 'screen';
    this.dot.circle(0, 0, spiritStyle.radius).fill({ color: palette.pearl });
    this.setTint('mint');
    this.face = new Face(spiritStyle.radius);
    this.body.addChild(this.halo, this.dot, this.face);
    this.sway.addChild(this.body);
    this.addChild(this.sway);
    this.eventMode = 'none';
    this.alpha = 0;
    this.breatheTween = gsap.to(this.body.scale, {
      x: breathe.scaleTo + 0.05,
      y: breathe.scaleTo + 0.05,
      duration: durations.breathe / 2,
      ease: easings.ambient,
      yoyo: true,
      repeat: -1,
    });
    events.on('spirit:glide', ({ x, y, duration, hop }) => (hop ? this.hop(x, y) : this.glideTo(x, y, duration)));
    events.on('spirit:orbit', ({ x, y, radius }) => this.startOrbit(x, y, radius));
    events.on('spirit:react', (r) => this.react(r));
    events.on('spirit:tint', (t) => this.setTint(t));
    this.scheduleIdle();
  }

  // Each player's light has its own colour.
  setTint(token: PaletteToken): void {
    this.hue = token;
    const gradient = new FillGradient({
      type: 'radial',
      center: { x: 0.5, y: 0.5 },
      innerRadius: 0,
      outerCenter: { x: 0.5, y: 0.5 },
      outerRadius: 0.5,
      colorStops: [
        { offset: 0, color: rgba(token, 0.8) },
        { offset: 1, color: rgba(token, 0) },
      ],
    });
    this.halo.clear().circle(0, 0, spiritStyle.haloRadius).fill(gradient);
    this.dot.filters = [createGlow(palette[token], { distance: 16, strength: 1.4 })];
  }

  show(x?: number, y?: number): void {
    if (x !== undefined && y !== undefined) this.position.set(x, y);
    gsap.to(this, { alpha: 1, duration: scaled(durations.pieceMove), overwrite: 'auto' });
  }

  hide(): void {
    this.orbit = null;
    gsap.to(this, { alpha: 0, duration: scaled(durations.pieceMove), overwrite: 'auto' });
  }

  private stopMoving(): void {
    this.moving?.kill();
    this.moving = null;
    this.orbit = null;
    this.anchor = null;
    this.wanderTarget = null;
  }

  // Once it arrives somewhere it keeps drifting gently around that spot.
  private settleAt(x: number, y: number): void {
    this.anchor = { x, y };
    this.wanderTarget = null;
    this.wanderClock = 0;
  }

  glideTo(x: number, y: number, duration: number = spiritStyle.glideSeconds): Promise<void> {
    this.stopMoving();
    if (this.alpha === 0) this.show();
    this.face.lookAt(Math.sign(x - this.x), 0);
    const d = scaled(duration);
    return new Promise((resolve) => {
      this.moving = gsap
        .timeline({
          onComplete: () => {
            this.moving = null;
            this.face.lookAt(0, 0);
            this.settleAt(x, y);
            resolve();
          },
        })
        .to(this, { x, duration: d, ease: easings.ambient }, 0)
        .to(this, { y: y - spiritStyle.arcLift * 0.5, duration: d * 0.5, ease: 'sine.out' }, 0)
        .to(this, { y, duration: d * 0.5, ease: 'sine.in' }, d * 0.5)
        .to(this.body.scale, { x: 1.15, y: 0.88, duration: d * 0.5, ease: 'sine.out' }, 0)
        .to(this.body.scale, { x: 1, y: 1, duration: d * 0.5, ease: easings.tileSnap }, d * 0.5);
    });
  }

  hop(x: number, y: number): Promise<void> {
    this.stopMoving();
    const d = scaled(spiritStyle.hopSeconds);
    return new Promise((resolve) => {
      this.moving = gsap
        .timeline({
          onComplete: () => {
            this.moving = null;
            this.settleAt(x, y);
            resolve();
          },
        })
        .to(this.body.scale, { x: 1.2, y: spiritStyle.squash, duration: d * 0.2, ease: 'sine.in' })
        .to(this.body.scale, { x: 0.9, y: 1.15, duration: d * 0.3, ease: 'sine.out' })
        .to(this, { x, duration: d, ease: 'sine.inOut' }, d * 0.2)
        .to(this, { y: Math.min(this.y, y) - spiritStyle.arcLift, duration: d * 0.5, ease: 'sine.out' }, d * 0.2)
        .to(this, { y, duration: d * 0.5, ease: 'sine.in' }, d * 0.7)
        .to(this.body.scale, { x: 1.2, y: spiritStyle.squash, duration: d * 0.15, ease: 'sine.in' }, d * 1.1)
        .to(this.body.scale, { x: 1, y: 1, duration: d * 0.35, ease: easings.tileSnap });
    });
  }

  // Circles slowly around a point (a chosen region on the map) until told to move.
  private startOrbit(cx: number, cy: number, r: number): void {
    this.stopMoving();
    if (this.alpha === 0) this.show();
    this.orbit = { cx, cy, r, angle: Math.atan2(this.y - cy, this.x - cx) };
  }

  private react(reaction: 'move' | 'attempt' | 'solved' | 'hide' | 'show'): void {
    switch (reaction) {
      case 'move':
        gsap.fromTo(this.body.scale, { x: 1.25, y: 0.85 }, { x: 1, y: 1, duration: durations.microFeedback * 2, ease: easings.tileSnap });
        break;
      case 'attempt':
        this.face.lookAt(0, 1);
        gsap.to(this.body, { alpha: spiritStyle.dimAlpha, duration: durations.microFeedback, yoyo: true, repeat: 1 });
        gsap.to(this, { y: this.y + 6, duration: durations.microFeedback, yoyo: true, repeat: 1, onComplete: () => this.face.lookAt(0, 0) });
        break;
      case 'solved':
        this.face.squint(0.8);
        gsap
          .timeline()
          .to(this.body.scale, { x: 1.25, y: 0.8, duration: 0.12 })
          .to(this, { y: this.y - spiritStyle.arcLift, duration: durations.pieceMove, ease: 'sine.out' })
          .to(this.body, { rotation: Math.PI * 2, duration: durations.pieceMove * 2, ease: 'sine.inOut' }, '<')
          .to(this, { y: this.y, duration: durations.pieceMove, ease: 'bounce.out' })
          .set(this.body, { rotation: 0 })
          .to(this.body.scale, { x: 1, y: 1, duration: durations.microFeedback, ease: easings.tileSnap });
        for (let i = 0; i < 18; i++) {
          const a = Math.random() * Math.PI * 2;
          this.particles.emit({
            x: this.x,
            y: this.y,
            color: palette[this.hue],
            vx: Math.cos(a) * 50,
            vy: Math.sin(a) * 50 - 20,
            life: 1,
            alphaFrom: 0.8,
            scaleFrom: 0.35,
            scaleTo: 0.05,
          });
        }
        break;
      case 'hide':
        this.hide();
        break;
      case 'show':
        this.show();
        break;
    }
  }

  // Little antics while sitting still: a wiggle, a spin, a peek around, a happy bounce.
  private scheduleIdle(): void {
    const [min, max] = spiritStyle.idleEvery;
    this.idleTimer = gsap.delayedCall(min + Math.random() * (max - min), () => {
      if (this.alpha > 0 && !this.moving && !this.busy && !reducedMotion()) this.antic();
      this.scheduleIdle();
    });
  }

  private antic(): void {
    this.busy = true;
    const done = () => {
      this.busy = false;
    };
    const pick = Math.floor(Math.random() * 4);
    if (pick === 0) {
      gsap.to(this.body, { rotation: 0.35, duration: 0.12, yoyo: true, repeat: 5, ease: 'sine.inOut', onComplete: () => { this.body.rotation = 0; done(); } });
    } else if (pick === 1) {
      this.face.lookAt(-1, 0);
      gsap.delayedCall(0.6, () => this.face.lookAt(1, 0));
      gsap.delayedCall(1.3, () => { this.face.lookAt(0, 0); done(); });
    } else if (pick === 2) {
      gsap.to(this.body, { rotation: Math.PI * 2, duration: 0.7, ease: 'power2.inOut', onComplete: () => { this.body.rotation = 0; done(); } });
    } else {
      gsap
        .timeline({ onComplete: done })
        .to(this.body.scale, { x: 1.2, y: 0.8, duration: 0.1 })
        .to(this.body.position, { y: -18, duration: 0.25, ease: 'sine.out' })
        .to(this.body.scale, { x: 0.95, y: 1.1, duration: 0.25 }, '<')
        .to(this.body.position, { y: 0, duration: 0.25, ease: 'bounce.out' })
        .to(this.body.scale, { x: 1, y: 1, duration: 0.2, ease: easings.tileSnap }, '<');
    }
  }

  // Leaves a trail of light while it travels, and keeps orbiting when asked to.
  update(dt: number): void {
    if (this.alpha <= 0) return;
    this.clock += dt;
    // A constant gentle sway of the body, so it never looks pinned.
    if (!reducedMotion()) {
      this.sway.x = Math.sin(this.clock * 1.3) * spiritStyle.swayAmount;
      this.sway.y = Math.cos(this.clock * 0.9) * spiritStyle.swayAmount * 0.7;
    }
    // Wander: pick a new spot near the anchor every couple of seconds and drift to it.
    if (this.anchor && !this.moving && !this.orbit && !reducedMotion()) {
      this.wanderClock -= dt;
      if (this.wanderClock <= 0 || !this.wanderTarget) {
        const [min, max] = spiritStyle.wanderEvery;
        this.wanderClock = min + Math.random() * (max - min);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * spiritStyle.wanderRadius;
        this.wanderTarget = { x: this.anchor.x + Math.cos(a) * r, y: this.anchor.y + Math.sin(a) * r * 0.6 };
        this.face.lookAt(Math.sign(this.wanderTarget.x - this.x) * 0.6, 0);
      }
      const k = Math.min(1, dt * 1.6);
      this.x += (this.wanderTarget.x - this.x) * k;
      this.y += (this.wanderTarget.y - this.y) * k;
    }
    if (this.orbit && !reducedMotion()) {
      this.orbit.angle += dt * spiritStyle.orbitSpeed;
      const o = this.orbit;
      const tx = o.cx + Math.cos(o.angle) * o.r;
      const ty = o.cy + Math.sin(o.angle) * o.r * 0.55;
      this.x += (tx - this.x) * Math.min(1, dt * 3);
      this.y += (ty - this.y) * Math.min(1, dt * 3);
      this.face.lookAt(Math.cos(o.angle + Math.PI / 2), 0);
    }
    const moved = Math.hypot(this.x - this.lastPos.x, this.y - this.lastPos.y);
    const from = this.lastPos;
    this.lastPos = { x: this.x, y: this.y };
    if (moved < 1.2) return;
    this.trailClock += dt;
    if (this.trailClock < spiritStyle.trailInterval) return;
    this.trailClock = 0;
    // Two motes per step, drifting back along the direction of travel: a streak of light.
    const bx = (from.x - this.x) / moved;
    const by = (from.y - this.y) / moved;
    for (let k = 0; k < 2; k++) {
      this.particles.emit({
        x: this.x + (Math.random() - 0.5) * 6,
        y: this.y + (Math.random() - 0.5) * 6,
        color: k === 0 ? palette[this.hue] : palette.pearl,
        vx: bx * 30 + (Math.random() - 0.5) * 10,
        vy: by * 30 - 6,
        life: spiritStyle.trailLife,
        alphaFrom: 0.55,
        scaleFrom: 0.4,
        scaleTo: 0.05,
        drag: 0.96,
      });
    }
  }

  override destroy(): void {
    this.breatheTween.kill();
    this.moving?.kill();
    this.idleTimer?.kill();
    super.destroy({ children: true });
  }
}

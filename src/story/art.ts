import gsap from 'gsap';
import { Container, FillGradient, Graphics } from 'pixi.js';
import { palette, rgba, type PaletteToken } from '../design/palette';
import { createGlow } from '../fx/glow';
import { Face } from '../ui/face';
import { createRng } from '../core/rng';
import { REGION_ACCENT, REGION_ORDER } from '../regions/catalog';
import { familyColor, familyColors } from './family';
import type { RegionId } from '../regions/types';
import type { Art } from './script';

// The small animations behind each line of the story. Everything is drawn in code, in the
// palette's pastels, around (0, 0) inside a square of side `size`. Each returns its root
// and a dispose that stops every tween it started.

export interface Vignette {
  root: Container;
  dispose(): void;
}

// The smallest light really is the smallest: this much of a family light's size.
const LITTLE = 0.72;

// One light: a glowing body, a soft halo, and either open eyes (a Face) or sleeping ones.
export class StoryLight extends Container {
  readonly body = new Container();
  private eyes: Container;
  face: Face | null = null;

  constructor(
    readonly token: PaletteToken,
    readonly r: number,
    asleep: boolean,
    little = false,
  ) {
    super();
    const halo = new Graphics();
    halo.blendMode = 'screen';
    halo.circle(0, 0, r * 3).fill(
      new FillGradient({
        type: 'radial',
        center: { x: 0.5, y: 0.5 },
        innerRadius: 0,
        outerCenter: { x: 0.5, y: 0.5 },
        outerRadius: 0.5,
        colorStops: [
          { offset: 0, color: rgba(token, 0.7) },
          { offset: 1, color: rgba(token, 0) },
        ],
      }),
    );
    const dot = new Graphics().circle(0, 0, r).fill({ color: little ? palette.pearl : palette[token] });
    dot.filters = [createGlow(palette[token], { distance: 12, strength: 1.2 })];
    this.eyes = asleep ? this.sleepingEyes() : (this.face = new Face(r));
    this.body.addChild(halo, dot, this.eyes);
    this.addChild(this.body);
  }

  private sleepingEyes(): Container {
    const g = new Graphics();
    for (const side of [-1, 1]) {
      const x = side * this.r * 0.34;
      g.moveTo(x - this.r * 0.14, -this.r * 0.06).arc(x, -this.r * 0.06, this.r * 0.14, Math.PI, 0, true).stroke({ color: palette.void, width: Math.max(1, this.r * 0.1), alpha: 0.85 });
    }
    return g;
  }

  sleep(): void {
    if (!this.face) return;
    this.face.destroy();
    this.face = null;
    this.eyes = this.sleepingEyes();
    this.body.addChild(this.eyes);
  }

  wake(): void {
    if (this.face) return;
    this.eyes.destroy();
    this.face = new Face(this.r);
    this.eyes = this.face;
    this.body.addChild(this.face);
  }
}

// Collects tweens so a vignette can be stopped cleanly at any moment.
class Tweens {
  private list: Array<gsap.core.Animation> = [];
  add<T extends gsap.core.Animation>(t: T): T {
    this.list.push(t);
    return t;
  }
  killAll(): void {
    this.list.forEach((t) => t.kill());
    this.list = [];
  }
}

function breathe(t: Tweens, target: Container, amount: number, seconds: number, delay = 0): void {
  t.add(gsap.to(target.scale, { x: 1 + amount, y: 1 + amount, duration: seconds / 2, yoyo: true, repeat: -1, ease: 'sine.inOut', delay }));
}

function ring(count: number, radius: number, start = -Math.PI / 2): Array<{ x: number; y: number }> {
  return Array.from({ length: count }, (_, i) => {
    const a = start + (i / count) * Math.PI * 2;
    return { x: Math.cos(a) * radius, y: Math.sin(a) * radius * 0.8 };
  });
}

// ----- the seven lights singing together (the opening, and the very end) -----

function harmony(size: number, hue: PaletteToken, finale: boolean): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  const lines = new Graphics();
  const ripples = new Graphics();
  const spin = new Container();
  root.addChild(ripples, spin);
  spin.addChild(lines);
  const tokens = [hue, ...FAMILY];
  const spots = ring(7, size * 0.3);
  spots.forEach((p, i) => {
    const next = spots[(i + 1) % 7]!;
    lines.moveTo(p.x, p.y).lineTo(next.x, next.y);
    lines.moveTo(p.x, p.y).lineTo(0, 0);
  });
  lines.stroke({ color: palette.pearl, width: 1, alpha: finale ? 0.35 : 0.2 });
  const lights = spots.map((p, i) => {
    const light = new StoryLight(tokens[i]!, i === 0 ? size * 0.04 * LITTLE : size * 0.04, false, i === 0);
    light.position.set(p.x, p.y);
    spin.addChild(light);
    // The song moves around the ring: each light swells in turn.
    t.add(gsap.to(light.body.scale, { x: 1.25, y: 1.25, duration: 0.45, yoyo: true, repeat: -1, repeatDelay: 2.7, delay: i * 0.45, ease: 'sine.inOut' }));
    return light;
  });
  t.add(gsap.to(spin, { rotation: finale ? 0.5 : 0.25, duration: 8, ease: 'sine.inOut' }));
  // Soft rings of song spreading from the middle.
  const wave = { p: 0 };
  t.add(
    gsap.to(wave, {
      p: 1,
      duration: finale ? 1.6 : 2.4,
      repeat: -1,
      ease: 'none',
      onUpdate: () => {
        ripples.clear();
        for (let k = 0; k < (finale ? 3 : 2); k++) {
          const q = (wave.p + k / (finale ? 3 : 2)) % 1;
          ripples.circle(0, 0, size * (0.1 + q * 0.45)).stroke({ color: palette[finale ? hue : 'pearl'], width: 1.2, alpha: (finale ? 0.4 : 0.25) * (1 - q) });
        }
      },
    }),
  );
  if (finale) t.add(gsap.delayedCall(1.2, () => lights.forEach((l) => l.face?.squint(1.2))));
  return { root, dispose: () => t.killAll() };
}

// ----- a small sign for each land, in its colour -----

function landGlyph(region: RegionId, s: number): Graphics {
  const g = new Graphics();
  const color = palette[REGION_ACCENT[region]];
  const line = { color, width: 1.2, alpha: 0.6 };
  switch (region) {
    case 'tidepools':
      for (const r of [0.35, 0.65, 0.95]) g.arc(0, 0, s * r, Math.PI * 1.1, Math.PI * 1.9);
      break;
    case 'nightsky':
      g.moveTo(-s * 0.8, s * 0.3).lineTo(-s * 0.2, -s * 0.5).lineTo(s * 0.3, s * 0.1).lineTo(s * 0.8, -s * 0.4);
      break;
    case 'stonegarden':
      g.roundRect(-s * 0.7, s * 0.1, s * 1.4, s * 0.45, s * 0.2).roundRect(-s * 0.45, -s * 0.4, s * 0.9, s * 0.42, s * 0.18);
      break;
    case 'crystalcaves':
      g.moveTo(-s * 0.4, s * 0.6).lineTo(0, -s * 0.8).lineTo(s * 0.4, s * 0.6).closePath();
      break;
    case 'moonlake':
      g.arc(0, 0, s * 0.7, Math.PI * 0.35, Math.PI * 1.65).arc(s * 0.3, 0, s * 0.55, Math.PI * 1.45, Math.PI * 0.55, true);
      break;
    case 'shadowterrace':
      g.moveTo(-s * 0.7, 0).lineTo(0, -s * 0.4).lineTo(s * 0.7, 0).lineTo(0, s * 0.4).closePath().moveTo(-s * 0.7, 0).lineTo(-s * 0.7, s * 0.4).lineTo(0, s * 0.8).lineTo(s * 0.7, s * 0.4).lineTo(s * 0.7, 0);
      break;
  }
  g.stroke(line);
  return g;
}

// ----- the Silence creeps in; the song fades -----

function silence(size: number, hue: PaletteToken): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  const lines = new Graphics();
  root.addChild(lines);
  const spots = ring(7, size * 0.3);
  spots.forEach((p, i) => {
    const next = spots[(i + 1) % 7]!;
    lines.moveTo(p.x, p.y).lineTo(next.x, next.y).moveTo(p.x, p.y).lineTo(0, 0);
  });
  lines.stroke({ color: palette.pearl, width: 1, alpha: 0.2 });
  const tokens = [hue, ...FAMILY];
  const lights = spots.map((p, i) => {
    const light = new StoryLight(tokens[i]!, i === 0 ? size * 0.04 * LITTLE : size * 0.04, false, i === 0);
    light.position.set(p.x, p.y);
    root.addChild(light);
    return light;
  });
  // The song's rings spread more and more slowly, and fade away.
  const ripples = new Graphics();
  root.addChildAt(ripples, 0);
  const song = { p: 0, strength: 1 };
  t.add(
    gsap.to(song, {
      p: 4,
      duration: 6,
      ease: 'power2.out',
      onUpdate: () => {
        const q = song.p % 1;
        ripples.clear().circle(0, 0, size * (0.1 + q * 0.4)).stroke({ color: palette.pearl, width: 1.2, alpha: 0.3 * (1 - q) * song.strength });
      },
    }),
  );
  t.add(gsap.to(song, { strength: 0, duration: 5, delay: 0.5 }));
  t.add(gsap.to(lines, { alpha: 0.15, duration: 4, delay: 0.8 }));
  lights.forEach((light, i) => {
    t.add(gsap.to(light, { alpha: 0.4, duration: 3.5, delay: 0.6 + i * 0.2 }));
    t.add(gsap.delayedCall(2 + i * 0.3, () => light.face?.lookAt(-Math.sign(spots[i]!.x || 1), -0.3)));
  });
  return { root, dispose: () => t.killAll() };
}

// ----- the family flies out, one light to each land -----

function depart(size: number, hue: PaletteToken): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  const lands = ring(6, size * 0.48);
  REGION_ORDER.forEach((region, i) => {
    const glyph = landGlyph(region, size * 0.08);
    glyph.position.set(lands[i]!.x, lands[i]!.y);
    glyph.alpha = 0.35;
    root.addChild(glyph);
    t.add(gsap.to(glyph, { alpha: 0.9, duration: 0.6, delay: 1.9 + i * 0.25 }));
  });
  const me = new StoryLight(hue, size * 0.04 * LITTLE, false, true);
  root.addChild(me);
  const near = ring(6, size * 0.14);
  FAMILY.forEach((token, i) => {
    const light = new StoryLight(token, size * 0.04, false);
    light.position.set(near[i]!.x, near[i]!.y);
    root.addChild(light);
    t.add(gsap.to(light, { x: lands[i]!.x, y: lands[i]!.y, duration: 1.4, delay: 0.7 + i * 0.25, ease: 'power2.inOut' }));
    t.add(gsap.to(light.scale, { x: 0.8, y: 0.8, duration: 1.4, delay: 0.7 + i * 0.25 }));
  });
  // The smallest watches them go, one after another.
  near.forEach((p, i) => t.add(gsap.delayedCall(0.8 + i * 0.25, () => me.face?.lookAt(Math.sign(p.x) || 0.01, p.y / (size * 0.14)))));
  t.add(gsap.to(me.body, { y: -size * 0.02, duration: 0.8, yoyo: true, repeat: -1, ease: 'sine.inOut', delay: 3 }));
  return { root, dispose: () => t.killAll() };
}

// ----- each sings inside its land until it falls asleep -----

function sleeping(size: number, hue: PaletteToken): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  const songs = new Graphics();
  root.addChild(songs);
  const lands = ring(6, size * 0.4);
  const lights = REGION_ORDER.map((region, i) => {
    const glyph = landGlyph(region, size * 0.08);
    glyph.position.set(lands[i]!.x, lands[i]!.y);
    root.addChild(glyph);
    const light = new StoryLight(FAMILY[i]!, size * 0.035, false);
    light.position.set(lands[i]!.x, lands[i]!.y);
    root.addChild(light);
    return light;
  });
  // Rings of song from each light, slowing and fading as they tire.
  const song = { p: 0, strength: 1 };
  t.add(
    gsap.to(song, {
      p: 6,
      duration: 6,
      ease: 'power1.out',
      onUpdate: () => {
        songs.clear();
        const q = song.p % 1;
        lands.forEach((p, i) => songs.circle(p.x, p.y, size * (0.04 + q * 0.1)).stroke({ color: palette[FAMILY[i]!], width: 1, alpha: 0.4 * (1 - q) * song.strength }));
      },
    }),
  );
  t.add(gsap.to(song, { strength: 0, duration: 4, delay: 1.5 }));
  lights.forEach((light, i) => {
    t.add(gsap.to(light, { alpha: 0.55, duration: 2, delay: 2.2 + i * 0.3 }));
    t.add(gsap.delayedCall(2.6 + i * 0.3, () => light.sleep()));
    breathe(t, light.body, 0.06, 3.2, 3 + i * 0.3);
  });
  return { root, dispose: () => t.killAll() };
}

// ----- the shore: drawn waves, used by the smallest light's scenes -----

function shoreWaves(size: number, hue: PaletteToken, t: Tweens): Graphics {
  const shore = new Graphics();
  const drift = { x: 0 };
  const draw = () => {
    shore.clear();
    for (let k = 0; k < 3; k++) {
      const y = size * (0.22 + k * 0.07);
      shore.moveTo(-size * 0.6, y);
      for (let x = -size * 0.6; x <= size * 0.6; x += 12) shore.lineTo(x, y + Math.sin(x / 26 + drift.x + k) * 3);
      shore.stroke({ color: palette[hue], width: 1.2, alpha: 0.32 - k * 0.08 });
    }
  };
  draw();
  t.add(gsap.to(drift, { x: Math.PI * 2, duration: 6, repeat: -1, ease: 'none', onUpdate: draw }));
  return shore;
}

// ----- the smallest, too young to go, tucked in asleep on the shore -----

function shore(size: number, hue: PaletteToken): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  root.addChild(shoreWaves(size, hue, t));
  const me = new StoryLight(hue, size * 0.045 * LITTLE, true, true);
  me.position.set(0, size * 0.14);
  root.addChild(me);
  breathe(t, me.body, 0.06, 3.4);
  // One of the family lingers over it a moment, then goes.
  const kin = new StoryLight(FAMILY[1]!, size * 0.04, false);
  kin.position.set(size * 0.05, -size * 0.02);
  root.addChild(kin);
  kin.face?.lookAt(-0.4, 0.8);
  t.add(gsap.delayedCall(1.4, () => kin.face?.squint(0.5)));
  t.add(gsap.to(kin, { x: size * 0.45, y: -size * 0.45, alpha: 0, duration: 2.2, delay: 2.4, ease: 'power2.in' }));
  return { root, dispose: () => t.killAll() };
}

// ----- the smallest light wakes on a quiet shore -----

function wake(size: number, hue: PaletteToken): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  root.addChild(shoreWaves(size, hue, t));
  // Far away, six faint lights still glow.
  const rng = createRng('story:far');
  FAMILY.forEach((token, i) => {
    const far = new Graphics().circle(0, 0, 2.4).fill({ color: palette[token] });
    far.position.set(-size * 0.42 + i * size * 0.17 + rng.next() * 10, -size * 0.32 + rng.next() * size * 0.12);
    far.alpha = 0.2;
    root.addChild(far);
    t.add(gsap.to(far, { alpha: 0.7, duration: 1.4, yoyo: true, repeat: -1, delay: 1.5 + i * 0.35, ease: 'sine.inOut' }));
  });
  const me = new StoryLight(hue, size * 0.05 * LITTLE, true, true);
  me.position.set(0, size * 0.14);
  me.alpha = 0.45;
  root.addChild(me);
  t.add(gsap.to(me, { alpha: 1, duration: 1.2, delay: 0.8 }));
  t.add(
    gsap.delayedCall(1.6, () => {
      me.wake();
      t.add(gsap.to(me.body, { y: -size * 0.06, duration: 0.3, yoyo: true, repeat: 1, ease: 'sine.out' }));
      t.add(gsap.delayedCall(1.0, () => me.face?.lookAt(-1, -0.6)));
      t.add(gsap.delayedCall(2.0, () => me.face?.lookAt(1, -0.6)));
      t.add(gsap.delayedCall(3.0, () => me.face?.lookAt(0, -1)));
    }),
  );
  return { root, dispose: () => t.killAll() };
}

// ----- each land's own backdrop, in its colour -----

function backdrop(region: RegionId, size: number, t: Tweens): Container {
  const c = new Container();
  const g = new Graphics();
  c.addChild(g);
  const color = palette[REGION_ACCENT[region]];
  const line = { color, width: 1.3, alpha: 0.34 };
  const rng = createRng(`story:${region}`);
  const s = size;
  switch (region) {
    case 'tidepools': {
      const phase = { p: 0 };
      const draw = () => {
        g.clear();
        for (let k = 0; k < 4; k++) {
          const y = -s * 0.2 + k * s * 0.13;
          g.moveTo(-s * 0.55, y);
          for (let x = -s * 0.55; x <= s * 0.55; x += 12) g.lineTo(x, y + Math.sin(x / 30 + phase.p + k * 1.3) * 4);
          g.stroke({ ...line, alpha: line.alpha - k * 0.05 });
        }
      };
      draw();
      t.add(gsap.to(phase, { p: Math.PI * 2, duration: 7, repeat: -1, ease: 'none', onUpdate: draw }));
      break;
    }
    case 'nightsky': {
      const stars = Array.from({ length: 14 }, () => ({ x: (rng.next() - 0.5) * s * 1.1, y: (rng.next() - 0.6) * s * 0.8 }));
      for (let k = 0; k < 5; k++) g.moveTo(stars[k]!.x, stars[k]!.y).lineTo(stars[k + 1]!.x, stars[k + 1]!.y);
      g.stroke({ ...line, width: 1 });
      stars.forEach((p, k) => {
        const star = new Graphics().circle(0, 0, 1.8).fill({ color: palette.pearl });
        star.position.set(p.x, p.y);
        c.addChild(star);
        t.add(gsap.to(star, { alpha: 0.25, duration: 1 + rng.next(), yoyo: true, repeat: -1, delay: k * 0.2 }));
      });
      break;
    }
    case 'stonegarden': {
      for (let k = 1; k <= 4; k++) g.ellipse(0, s * 0.12, s * 0.12 * k, s * 0.045 * k);
      g.stroke({ ...line, alpha: 0.22 });
      for (const [x, y, w] of [[-0.3, 0.02, 0.14], [0.28, -0.05, 0.12], [0.2, 0.24, 0.1]] as const) {
        g.roundRect((x - w / 2) * s, (y - w * 0.35) * s, w * s, w * 0.7 * s, w * s * 0.3).fill({ color, alpha: 0.12 }).stroke(line);
      }
      break;
    }
    case 'crystalcaves': {
      for (let k = 0; k < 6; k++) {
        const x = (-0.45 + k * 0.18) * s;
        const h = (0.18 + rng.next() * 0.22) * s;
        const w = (0.05 + rng.next() * 0.04) * s;
        g.moveTo(x - w, s * 0.35).lineTo(x - w * 0.6, s * 0.35 - h * 0.8).lineTo(x, s * 0.35 - h).lineTo(x + w * 0.6, s * 0.35 - h * 0.8).lineTo(x + w, s * 0.35).closePath();
      }
      g.fill({ color, alpha: 0.08 }).stroke(line);
      t.add(gsap.to(g, { alpha: 0.6, duration: 2.2, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
      break;
    }
    case 'moonlake': {
      g.circle(s * 0.3, -s * 0.28, s * 0.08).fill({ color: palette.pearl, alpha: 0.18 }).stroke({ ...line, color: palette.pearl });
      for (let k = 0; k < 5; k++) {
        const y = s * (0.02 + k * 0.08);
        g.moveTo(-s * 0.55, y).lineTo(s * 0.55, y);
      }
      g.stroke({ ...line, alpha: 0.2 });
      const glints = new Graphics();
      c.addChild(glints);
      for (let k = 0; k < 5; k++) glints.moveTo(s * 0.3 - (12 + k * 5), s * (0.04 + k * 0.08)).lineTo(s * 0.3 + 12 + k * 5, s * (0.04 + k * 0.08));
      glints.stroke({ color: palette.pearl, width: 1.5, alpha: 0.25 });
      t.add(gsap.to(glints, { alpha: 0.4, duration: 1.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
      break;
    }
    case 'shadowterrace': {
      for (let k = 0; k < 3; k++) {
        const w = s * (0.7 - k * 0.2);
        const y = s * (0.3 - k * 0.14);
        g.moveTo(-w / 2, y).lineTo(0, y - s * 0.08).lineTo(w / 2, y).lineTo(0, y + s * 0.08).closePath();
      }
      g.fill({ color, alpha: 0.06 }).stroke(line);
      break;
    }
  }
  return c;
}

// ----- a family light asleep in a land; the little one finds it -----

function asleep(region: RegionId, size: number, hue: PaletteToken): Vignette {
  const t = new Tweens();
  const root = new Container();
  root.addChild(backdrop(region, size, t));
  const sleeper = new StoryLight(familyColor(region, hue), size * 0.045, true);
  sleeper.position.set(size * 0.08, size * 0.06);
  sleeper.alpha = 0.55;
  root.addChild(sleeper);
  breathe(t, sleeper.body, 0.06, 3.2);
  const me = new StoryLight(hue, size * 0.045 * LITTLE, false, true);
  me.position.set(-size * 0.55, -size * 0.05);
  me.alpha = 0;
  root.addChild(me);
  t.add(gsap.to(me, { alpha: 1, duration: 0.6, delay: 0.3 }));
  t.add(gsap.to(me, { x: -size * 0.14, y: 0, duration: 1.8, delay: 0.3, ease: 'sine.inOut', onStart: () => me.face?.lookAt(1, 0.2) }));
  // The sleeper stirs at the little light's arrival, then settles back to sleep.
  t.add(gsap.to(sleeper, { alpha: 0.95, duration: 0.6, delay: 2.3, yoyo: true, repeat: 1, repeatDelay: 0.5 }));
  t.add(gsap.delayedCall(3.6, () => me.face?.blink()));
  return { root, dispose: () => t.killAll() };
}

// ----- all six asleep, waiting -----

function waiting(size: number, hue: PaletteToken): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  const spots = ring(6, size * 0.32);
  spots.forEach((p, i) => {
    const sleeper = new StoryLight(FAMILY[i]!, size * 0.042, true);
    sleeper.position.set(p.x, p.y);
    sleeper.alpha = 0.45;
    root.addChild(sleeper);
    breathe(t, sleeper.body, 0.07, 3, i * 0.4);
    t.add(gsap.to(sleeper, { alpha: 0.9, duration: 0.5, yoyo: true, repeat: -1, repeatDelay: 5.2, delay: 0.8 + i * 0.95 }));
  });
  const me = new StoryLight(hue, size * 0.05 * LITTLE, false, true);
  root.addChild(me);
  // The little light looks from one sleeper to the next.
  spots.forEach((p, i) => t.add(gsap.delayedCall(0.8 + i * 0.95, () => me.face?.lookAt(Math.sign(p.x) * Math.min(1, Math.abs(p.x) / (size * 0.2)), p.y / (size * 0.3)))));
  return { root, dispose: () => t.killAll() };
}

// ----- a family light wakes and comes home -----

function home(region: RegionId, size: number, hue: PaletteToken): Vignette {
  const t = new Tweens();
  const root = new Container();
  root.addChild(backdrop(region, size, t));
  const kin = new StoryLight(familyColor(region, hue), size * 0.045, true);
  kin.position.set(size * 0.1, size * 0.06);
  kin.alpha = 0.55;
  root.addChild(kin);
  const me = new StoryLight(hue, size * 0.045 * LITTLE, false, true);
  me.position.set(-size * 0.16, 0);
  root.addChild(me);
  me.face?.lookAt(1, 0.2);
  t.add(gsap.to(kin, { alpha: 1, duration: 0.8, delay: 0.7 }));
  t.add(
    gsap.delayedCall(1.2, () => {
      kin.wake();
      kin.face?.squint(0.6);
      me.face?.squint(0.6);
      // Up, over, and around each other once: home.
      const orbit = { a: 0 };
      t.add(gsap.to(kin, { y: -size * 0.06, duration: 0.5, ease: 'sine.out' }));
      t.add(
        gsap.to(orbit, {
          a: Math.PI * 2,
          duration: 2.2,
          delay: 0.5,
          ease: 'sine.inOut',
          onUpdate: () => {
            const cx = -size * 0.03;
            const r = size * 0.13;
            kin.position.set(cx + Math.cos(orbit.a) * r, -size * 0.03 + Math.sin(orbit.a) * r * 0.6);
            me.position.set(cx - Math.cos(orbit.a) * r, -size * 0.03 - Math.sin(orbit.a) * r * 0.6);
          },
        }),
      );
    }),
  );
  return { root, dispose: () => t.killAll() };
}

// ----- the whole family, circling together -----

function together(size: number, hue: PaletteToken): Vignette {
  const FAMILY = familyColors(hue);
  const t = new Tweens();
  const root = new Container();
  const me = new StoryLight(hue, size * 0.045 * LITTLE, false, true);
  const family = FAMILY.map((token) => new StoryLight(token, size * 0.045, false));
  root.addChild(...family, me);
  const turn = { a: 0, r: size * 0.5 };
  const place = () =>
    family.forEach((light, i) => {
      const a = turn.a + (i / family.length) * Math.PI * 2;
      light.position.set(Math.cos(a) * turn.r, Math.sin(a) * turn.r * 0.62);
    });
  place();
  t.add(gsap.to(turn, { r: size * 0.24, duration: 1.6, ease: 'power2.out', onUpdate: place }));
  t.add(gsap.to(turn, { a: Math.PI * 2, duration: 9, repeat: -1, ease: 'none', onUpdate: place }));
  t.add(gsap.delayedCall(1.6, () => [me, ...family].forEach((l) => l.face?.squint(1))));
  t.add(gsap.to(me.body, { y: -size * 0.03, duration: 0.6, yoyo: true, repeat: -1, ease: 'sine.inOut' }));
  return { root, dispose: () => t.killAll() };
}

export function buildArt(art: Art, size: number, hue: PaletteToken): Vignette {
  let v: Vignette;
  switch (art.kind) {
    case 'harmony':
      v = harmony(size, hue, art.finale === true);
      break;
    case 'silence':
      v = silence(size, hue);
      break;
    case 'depart':
      v = depart(size, hue);
      break;
    case 'sleeping':
      v = sleeping(size, hue);
      break;
    case 'shore':
      v = shore(size, hue);
      break;
    case 'wake':
      v = wake(size, hue);
      break;
    case 'asleep':
      v = asleep(art.region, size, hue);
      break;
    case 'waiting':
      v = waiting(size, hue);
      break;
    case 'home':
      v = home(art.region, size, hue);
      break;
    case 'together':
      v = together(size, hue);
      break;
  }
  return {
    root: v.root,
    dispose: () => {
      v.dispose();
      v.root.destroy({ children: true });
    },
  };
}

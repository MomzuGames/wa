import gsap from 'gsap';
import * as THREE from 'three';
import { Container, type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { IntroPage, LevelScene, ShellContext, Tip } from '../types';
import { mixColor, palette } from '../../design/palette';
import { durations, easings, scaled } from '../../design/motion';
import { hud } from '../../design/layout';
import { events } from '../../core/events';
import { liftFinger, makeFinger, tapAt } from '../../ui/introGlyphs';
import { stage3d, type World3D } from '../../three/stage3d';
import { OrbitView, col, glowTexture, paperLantern, type PaperLantern } from '../../three/kit';
import { Backdrop, moodFor } from '../../three/backdrop';
import { type LanternLevel, STEPS, allLit, cellCount, clashing, isRock, isSolved, isWater, lightCounts, rockCount, rockState, sightLines } from './model';
import { type Deduction, type Reason, solveByLogic } from './solver';
import { createMoonVoice, type MoonVoice } from './sound';
import { lanternIntroPages } from './intro';

// Moon Lake in 3D: the lake is a small diorama floating in a pastel night set by the level
// (a block of rippling water with a stone rim, low land for the shore, stones with their
// dots, paper lanterns that bob and glow). Swipe to turn it and tilt it; tap the water to
// float a lantern, tap it again to lift it away. The rules, hints, notes and cards are the
// same as ever.

const lake3dStyle = {
  slabDepth: 0.55,
  lanternY: 0.45,
  dropFrom: 0.5,
  belowHud: 30, // px of breathing room under the top row of buttons
  aboveHud: 30,
} as const;

type Handler = () => void;

const NUDGE: Record<Reason, string> = {
  rock: 'Look at the ringed rock. Count its dots and the open water right beside it: only one way fits.',
  'only-light': 'Look at the ringed dark patch. Only one place can still light it.',
  sees: 'Look at the ringed lantern. Nothing in its light can hold another lantern.',
  'what-if': 'Imagine the ringed spot without a lantern: some patch could never be lit, or a rock could not be met. So a lantern belongs there.',
};

interface LanternView extends PaperLantern {
  phase: number;
  drop: number;
}

export class LanternLake3DScene implements LevelScene {
  readonly container = new Container(); // 2D: the touch surface and the demo finger
  readonly ownsBackdrop = true;
  private hit = new Graphics();
  private overlay = new Container();
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  private orbit: OrbitView;
  private backdrop: Backdrop;
  private world: World3D;
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private lit = new THREE.Group();
  private lanternsGroup = new THREE.Group();
  private hintGroup = new THREE.Group();
  private dots = new Map<number, THREE.Mesh[]>();
  private views = new Map<number, LanternView>();
  private lanterns = new Set<number>();
  private sight: number[][];
  private handlers: Record<'attempt' | 'solved' | 'move', Handler[]> = { attempt: [], solved: [], move: [] };
  private voice: MoonVoice;
  private time = 0;
  private solved = false;
  private rise = { v: 0 };
  private glowBoost = { v: 1 };
  private allLitNote = '';
  // Hints never place a lantern: a ring where to look, then a faint lantern where one belongs
  // (or a ring around one that cannot stay), then a few more.
  private logic: Deduction[];
  private hintTarget: { cell: number; on: boolean; at: number; reason: Reason | 'wrong' } | null = null;
  private nudge: THREE.Mesh | null = null;
  private ghosts = new Map<number, THREE.Object3D>();
  private demo: { tl: gsap.core.Timeline; finger: Graphics; ghosts: THREE.Object3D[] } | null = null;
  private sparks: THREE.Points | null = null;
  private offCancel = events.on('input:cancel', () => this.orbit.cancel());

  constructor(
    private ctx: ShellContext,
    private level: LanternLevel,
    private tutorial: boolean,
    levelName: string,
  ) {
    this.voice = createMoonVoice(ctx.audio);
    this.sight = sightLines(level);
    this.logic = solveByLogic(level).deductions;
    this.orbit = new OrbitView(this.camera, Math.hypot(level.width / 2 + 0.6, level.height / 2 + 0.6));
    this.backdrop = new Backdrop(this.scene, glowTexture(), moodFor(levelName));
    // A soft sky fill and the moon, high to one side: every stone has a lit face and a shaded one.
    this.scene.add(new THREE.HemisphereLight(col(mixColor(palette.sky, palette.pearl, 0.5)), col(palette.ink), 0.75));
    const moon = new THREE.DirectionalLight(col(palette.pearl), 1.2);
    moon.position.set(-6, 10, 4);
    this.scene.add(moon);
    this.water = this.buildDiorama();
    this.scene.add(this.lit, this.lanternsGroup, this.hintGroup);
    this.world = { scene: this.scene, camera: this.camera, bloom: () => (this.solved ? 0.75 : 0.47) * this.glowBoost.v };
    stage3d()?.show(this.world);

    // The 2D side: a touch surface over the whole screen (the 3D canvas lies underneath).
    this.hit.eventMode = 'static';
    this.hit.on('pointerdown', (e: FederatedPointerEvent) => this.orbit.down(e.global.x, e.global.y));
    this.hit.on('globalpointermove', (e: FederatedPointerEvent) => this.orbit.move(e.global.x, e.global.y));
    this.hit.on('pointerup', (e: FederatedPointerEvent) => this.onUp(e));
    this.hit.on('pointerupoutside', () => this.orbit.up());
    this.overlay.eventMode = 'none';
    this.container.addChild(this.hit, this.overlay);
    this.layout(ctx.width, ctx.height);
  }

  on(event: 'attempt' | 'solved' | 'move', cb: Handler): void {
    this.handlers[event].push(cb);
  }

  private emit(event: 'attempt' | 'solved' | 'move'): void {
    this.handlers[event].forEach((h) => h());
  }

  // ----- the diorama -----

  private cellPos(i: number): THREE.Vector3 {
    const { width: w, height: h } = this.level;
    return new THREE.Vector3((i % w) - (w - 1) / 2, 0, Math.floor(i / w) - (h - 1) / 2);
  }

  private buildDiorama(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const { width: w, height: h } = this.level;
    const bw = w + 0.5;
    const bh = h + 0.5;
    const glow = glowTexture();
    const slab = new THREE.Mesh(new THREE.BoxGeometry(bw, lake3dStyle.slabDepth, bh), new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.sky, 0.14)), flatShading: true }));
    slab.position.y = -lake3dStyle.slabDepth / 2 - 0.02;
    this.scene.add(slab);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(bw * 2.4, bh * 2.4), new THREE.MeshBasicMaterial({ map: glow, color: col(palette.peach), transparent: true, opacity: 0.1, depthWrite: false }));
    under.rotation.x = -Math.PI / 2;
    under.position.y = -lake3dStyle.slabDepth - 0.6;
    this.scene.add(under);
    // The water: soft ripples of light drifting over it.
    const water = new THREE.Mesh(
      new THREE.PlaneGeometry(bw - 0.12, bh - 0.12),
      new THREE.ShaderMaterial({
        uniforms: { time: { value: 0 }, deep: { value: col(mixColor(palette.void, palette.sky, 0.1)) }, sheen: { value: col(mixColor(palette.lavender, palette.sky, 0.5)) } },
        vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
        fragmentShader: `uniform float time; uniform vec3 deep; uniform vec3 sheen; varying vec2 vUv; varying vec3 vWorld;
          float wave(vec2 p){ return sin(p.x*2.1+time*0.9)*0.5 + sin(p.y*2.7-time*0.7+p.x*0.6)*0.35 + sin((p.x+p.y)*5.3+time*1.6)*0.15; }
          void main(){ float wv = wave(vWorld.xz); vec3 c = deep + sheen*0.07*smoothstep(0.5,0.95,wv); float edge = smoothstep(0.0,0.06,vUv.x)*smoothstep(0.0,0.06,vUv.y)*smoothstep(1.0,0.94,vUv.x)*smoothstep(1.0,0.94,vUv.y); c = mix(sheen*0.25, c, edge); gl_FragColor = vec4(c,1.0); }`,
      }),
    );
    water.rotation.x = -Math.PI / 2;
    this.scene.add(water);
    const land = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.sage, 0.35)), flatShading: true });
    const stone = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.pearl, 0.28)), flatShading: true });
    const shadow = new THREE.MeshBasicMaterial({ map: glow, color: col(palette.void), transparent: true, opacity: 0.6, depthWrite: false });
    const lines: number[] = [];
    for (let i = 0; i < cellCount(this.level); i++) {
      const p = this.cellPos(i);
      if (!isWater(this.level, i) && !isRock(this.level, i)) {
        const bank = new THREE.Mesh(new THREE.BoxGeometry(1, 0.28, 1), land);
        bank.position.set(p.x, 0.1, p.z);
        this.scene.add(bank);
        continue;
      }
      for (const [ax, az, bx, bz] of [[-0.5, -0.5, 0.5, -0.5], [-0.5, -0.5, -0.5, 0.5], [0.5, -0.5, 0.5, 0.5], [-0.5, 0.5, 0.5, 0.5]] as const) lines.push(p.x + ax, 0.01, p.z + az, p.x + bx, 0.01, p.z + bz);
      if (isRock(this.level, i)) {
        const blob = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadow);
        blob.rotation.x = -Math.PI / 2;
        blob.position.set(p.x + 0.06, 0.012, p.z + 0.06);
        this.scene.add(blob);
        const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.36, 0), stone);
        r.scale.set(1, 0.7, 1);
        r.rotation.set(0.2, i * 1.3, 0.1);
        r.position.set(p.x, 0.16, p.z);
        this.scene.add(r);
        const count = rockCount(this.level, i);
        if (count !== null) this.dots.set(i, this.makeDots(count, p));
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
    this.scene.add(new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.14 })));
    return water;
  }

  private makeDots(count: number, p: THREE.Vector3): THREE.Mesh[] {
    const y = 0.4;
    const mat = () => new THREE.MeshBasicMaterial({ color: col(palette.pearl) });
    if (count === 0) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 8, 24), mat());
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(p.x, y, p.z);
      this.scene.add(ring);
      return [ring];
    }
    const s = 0.11;
    const spots: Record<number, Array<[number, number]>> = { 1: [[0, 0]], 2: [[-s, 0], [s, 0]], 3: [[0, -s], [-s, s * 0.7], [s, s * 0.7]], 4: [[-s, -s], [s, -s], [-s, s], [s, s]] };
    return (spots[count] ?? []).map(([dx, dz]) => {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.065, 12, 8), mat());
      dot.position.set(p.x + dx, y, p.z + dz);
      this.scene.add(dot);
      return dot;
    });
  }

  // Light on the water, beams, clashes and the rocks' dots answering.
  private redraw(): void {
    this.lit.children.forEach((c) => (c as THREE.Mesh).geometry.dispose());
    this.lit.clear();
    const add = (m: THREE.Mesh) => this.lit.add(m);
    const flat = (w: number, h: number, mat: THREE.Material, x: number, z: number, y: number, turn = 0) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
      m.rotation.x = -Math.PI / 2;
      m.rotation.z = turn;
      m.position.set(x, y, z);
      add(m);
    };
    const counts = lightCounts(this.level, this.lanterns, this.sight);
    const warm = new THREE.MeshBasicMaterial({ color: col(palette.lemon), transparent: true, opacity: 0.07, depthWrite: false, blending: THREE.AdditiveBlending });
    for (let i = 0; i < counts.length; i++) {
      if (!counts[i]) continue;
      const p = this.cellPos(i);
      flat(0.94, 0.94, warm, p.x, p.z, 0.015);
    }
    const beam = new THREE.MeshBasicMaterial({ color: col(palette.lemon), transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending });
    const { width: w, height: h } = this.level;
    for (const l of this.lanterns) {
      for (const [dx, dy] of STEPS) {
        let x = l % w;
        let y = Math.floor(l / w);
        while (x + dx >= 0 && x + dx < w && y + dy >= 0 && y + dy < h && isWater(this.level, (y + dy) * w + x + dx)) {
          x += dx;
          y += dy;
        }
        const end = y * w + x;
        if (end === l) continue;
        const a = this.cellPos(l);
        const b = this.cellPos(end);
        flat(0.14, a.distanceTo(b), beam, (a.x + b.x) / 2, (a.z + b.z) / 2, 0.02, dx !== 0 ? Math.PI / 2 : 0);
      }
    }
    const clashes = clashing(this.level, this.lanterns, this.sight);
    const rose = new THREE.MeshBasicMaterial({ color: col(palette.rose), transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const a of clashes) {
      for (const b of clashes) {
        if (b <= a || !this.sight[a]!.includes(b)) continue;
        const pa = this.cellPos(a);
        const pb = this.cellPos(b);
        flat(0.1, pa.distanceTo(pb), rose, (pa.x + pb.x) / 2, (pa.z + pb.z) / 2, 0.025, pa.z === pb.z ? Math.PI / 2 : 0);
      }
    }
    for (const [r, dots] of this.dots) {
      const state = rockState(this.level, this.lanterns, r);
      const c = state === 'met' && rockCount(this.level, r) ? palette.lemon : state === 'over' ? palette.rose : palette.pearl;
      dots.forEach((d) => (d.material as THREE.MeshBasicMaterial).color.set(c));
    }
  }

  // ----- play -----

  private onUp(e: FederatedPointerEvent): void {
    if (!this.orbit.up() || this.solved) return;
    const { width: W, height: H } = stage3d()?.size ?? { width: this.ctx.width, height: this.ctx.height };
    const hit = this.orbit.pick(e.global.x, e.global.y, W, H);
    if (!hit) return;
    const { width: w, height: h } = this.level;
    const x = Math.round(hit.x + (w - 1) / 2);
    const y = Math.round(hit.z + (h - 1) / 2);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const i = y * w + x;
    if (!isWater(this.level, i)) return;
    this.stopDemo();
    if (this.lanterns.has(i)) this.lift(i);
    else this.float(i);
    this.changed();
  }

  private float(i: number): void {
    this.lanterns.add(i);
    const v: LanternView = { ...paperLantern(), phase: i * 1.7, drop: 1 };
    const p = this.cellPos(i);
    v.group.position.set(p.x, lake3dStyle.lanternY + lake3dStyle.dropFrom, p.z);
    this.views.set(i, v);
    this.lanternsGroup.add(v.group);
    this.voice.press((i % this.level.width) + Math.floor(i / this.level.width));
  }

  private lift(i: number, quiet = false): void {
    this.lanterns.delete(i);
    const v = this.views.get(i);
    this.views.delete(i);
    if (v) {
      const g = v.group;
      gsap.to(g.scale, { x: 0.01, y: 0.01, z: 0.01, duration: durations.microFeedback * 1.5, ease: easings.ambient, onComplete: () => this.lanternsGroup.remove(g) });
    }
    if (!quiet) this.voice.lift();
  }

  private changed(): void {
    this.emit('move');
    this.redraw();
    this.settleHints();
    if (isSolved(this.level, this.lanterns)) {
      this.solved = true;
      this.emit('solved');
      return;
    }
    if (allLit(this.level, this.lanterns, this.sight)) {
      const key = [...this.lanterns].sort((a, b) => a - b).join(',');
      if (key === this.allLitNote) return;
      this.allLitNote = key;
      events.emit(
        'level:note',
        clashing(this.level, this.lanterns, this.sight).size > 0
          ? 'The whole lake glows, but two lanterns shine on each other. The rose light shows which.'
          : 'The whole lake glows, but a rock does not have its number of lanterns beside it.',
      );
    }
  }

  // ----- frame, layout -----

  layout(width: number, height: number): void {
    this.hit.clear().rect(0, -height, width, height * 3).fill({ color: palette.pearl, alpha: 0.001 });
    this.place();
  }

  resize(width: number, height: number): void {
    this.layout(width, height);
  }

  // The board sits centred between the top row of buttons and the bottom one.
  private place(): void {
    const s = stage3d()?.size ?? { width: this.ctx.width, height: this.ctx.height };
    this.backdrop.resize(s.width, s.height);
    this.orbit.place(s.width, s.height, hud.top() + lake3dStyle.belowHud, hud.bottom(s.height) - lake3dStyle.aboveHud);
  }

  update(dt: number): void {
    this.time += dt;
    this.orbit.update(dt);
    this.place();
    this.backdrop.update(dt, this.orbit.yaw);
    this.water.material.uniforms.time!.value = this.time;
    for (const v of this.views.values()) {
      v.drop = Math.max(0, v.drop - dt * 3);
      const t = this.time + v.phase;
      v.group.position.y = lake3dStyle.lanternY + Math.sin(t * 1.2) * 0.03 + v.drop * lake3dStyle.dropFrom + this.rise.v;
      v.body.rotation.z = Math.sin(t * 0.8) * 0.06;
      v.body.rotation.y += dt * 0.15;
      const flicker = 0.85 + 0.08 * Math.sin(t * 2.3) + 0.05 * Math.sin(t * 6.1) + 0.03 * Math.sin(t * 13.7);
      v.heart.material.opacity = 0.38 * flicker * this.glowBoost.v;
      v.halo.material.opacity = 0.135 * flicker * this.glowBoost.v;
    }
    if (this.nudge) (this.nudge.material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.4 * Math.sin(this.time * 3);
    for (const [i, g] of this.ghosts) if (!this.level.solution.includes(i)) ((g as THREE.Mesh).material as THREE.MeshBasicMaterial).opacity = 0.45 + 0.4 * Math.sin(this.time * 4);
    if (this.sparks) {
      const pos = this.sparks.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < pos.count; k++) pos.setY(k, pos.getY(k) + dt * (0.4 + (k % 5) * 0.08));
      pos.needsUpdate = true;
      const m = this.sparks.material as THREE.PointsMaterial;
      m.opacity = Math.max(0, m.opacity - dt * 0.25);
    }
    // The demonstration's finger follows the board as it turns.
    if (this.demo) this.placeDemoFinger();
  }

  restart(): void {
    if (this.solved) return;
    for (const i of [...this.lanterns]) this.lift(i, true);
    this.clearHints();
    this.allLitNote = '';
    this.redraw();
  }

  // ----- the first lake's demonstration: a finger taps where the four lanterns go -----

  begin(): void {
    if (this.tutorial && this.lanterns.size === 0) gsap.delayedCall(0.6, () => this.startDemo());
  }

  private screenOf(i: number): { x: number; y: number } {
    const s = stage3d()?.size ?? { width: this.ctx.width, height: this.ctx.height };
    const p = this.orbit.project(this.cellPos(i), s.width, s.height);
    return this.container.toLocal(p);
  }

  private demoStep = 0;

  private placeDemoFinger(): void {
    if (!this.demo) return;
    const at = this.screenOf(this.level.solution[this.demoStep % this.level.solution.length]!);
    this.demo.finger.position.set(at.x, at.y);
  }

  private startDemo(): void {
    if (this.demo || this.lanterns.size > 0 || this.solved) return;
    const finger = makeFinger();
    this.overlay.addChild(finger);
    const ghosts = this.level.solution.map((i) => {
      const l = paperLantern(true);
      const p = this.cellPos(i);
      l.group.position.set(p.x, lake3dStyle.lanternY, p.z);
      l.group.visible = false;
      this.hintGroup.add(l.group);
      return l.group;
    });
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    this.level.solution.forEach((_, k) => {
      tl.call(() => {
        this.demoStep = k;
        this.placeDemoFinger();
      });
      tapAt(tl, finger, finger.x, finger.y, k === 0 ? 0.3 : 0.45);
      tl.call(() => {
        ghosts[k]!.visible = true;
      });
    });
    liftFinger(tl, finger);
    tl.call(() => ghosts.forEach((g) => (g.visible = false)), undefined, '+=0.6');
    this.demo = { tl, finger, ghosts };
  }

  private stopDemo(): void {
    if (!this.demo) return;
    this.demo.tl.kill();
    this.demo.finger.destroy();
    this.demo.ghosts.forEach((g) => this.hintGroup.remove(g));
    this.demo = null;
  }

  // ----- hints -----

  private nextStep(): LanternLake3DScene['hintTarget'] {
    const answer = new Set(this.level.solution);
    const wrong = [...this.lanterns].find((l) => !answer.has(l));
    if (wrong !== undefined) return { cell: wrong, on: false, at: wrong, reason: 'wrong' };
    const d = this.logic.find((k) => k.on && !this.lanterns.has(k.cell));
    return d ? { cell: d.cell, on: true, at: d.at, reason: d.reason } : null;
  }

  private stepDone(t: NonNullable<LanternLake3DScene['hintTarget']>): boolean {
    return t.on ? this.lanterns.has(t.cell) : !this.lanterns.has(t.cell);
  }

  hint(): string {
    if (this.solved) return '';
    this.stopDemo();
    if (this.hintTarget && this.stepDone(this.hintTarget)) this.hintTarget = null;
    if (!this.hintTarget) {
      const step = this.nextStep();
      const left = this.level.solution.filter((l) => !this.lanterns.has(l)).length;
      if (!step || (step.on && left <= 1)) return 'Just one lantern left. You can find this one!';
      this.hintTarget = step;
      this.showNudge(step.at);
      return step.reason === 'wrong' ? 'One of your lanterns cannot stay where it is. Look at the ringed one.' : NUDGE[step.reason];
    }
    if (!this.ghosts.has(this.hintTarget.cell)) {
      this.addGhost(this.hintTarget.cell, this.hintTarget.on);
      return this.hintTarget.on ? 'The faint lantern shows where one belongs. Tap the water there.' : 'Tap the pulsing lantern to take it away.';
    }
    const left = this.level.solution.filter((l) => !this.lanterns.has(l));
    const room = Math.floor(left.length / 2) - [...this.ghosts.keys()].filter((g) => left.includes(g)).length;
    const more = this.logic.filter((d) => d.on && !this.lanterns.has(d.cell) && !this.ghosts.has(d.cell)).slice(0, Math.max(0, Math.min(2, room)));
    if (more.length === 0) return 'That is all I can show. The rest is yours.';
    more.forEach((d) => this.addGhost(d.cell, true));
    return more.length === 1 ? 'One more faint lantern shows where it belongs.' : 'Two more faint lanterns show where they belong.';
  }

  private ring(i: number, color: number, radius: number): THREE.Mesh {
    const p = this.cellPos(i);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.025, 8, 40), new THREE.MeshBasicMaterial({ color: col(color), transparent: true, opacity: 0.8, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.05, p.z);
    this.hintGroup.add(ring);
    return ring;
  }

  private showNudge(i: number): void {
    this.clearNudge();
    this.nudge = this.ring(i, palette.pearl, 0.5);
  }

  private clearNudge(): void {
    if (this.nudge) this.hintGroup.remove(this.nudge);
    this.nudge = null;
  }

  private addGhost(i: number, on: boolean): void {
    let g: THREE.Object3D;
    if (on) {
      g = paperLantern(true).group;
      const p = this.cellPos(i);
      g.position.set(p.x, lake3dStyle.lanternY, p.z);
      this.hintGroup.add(g);
    } else {
      g = this.ring(i, palette.rose, 0.45);
    }
    this.ghosts.set(i, g);
  }

  private settleHints(): void {
    const answer = new Set(this.level.solution);
    for (const [i, g] of this.ghosts) {
      if (this.lanterns.has(i) === answer.has(i)) {
        this.hintGroup.remove(g);
        this.ghosts.delete(i);
      }
    }
    if (this.hintTarget && this.stepDone(this.hintTarget)) {
      this.clearNudge();
      this.hintTarget = null;
    }
  }

  private clearHints(): void {
    this.clearNudge();
    this.ghosts.forEach((g) => this.hintGroup.remove(g));
    this.ghosts.clear();
    this.hintTarget = null;
  }

  tips(): Tip[] {
    const tips: Tip[] = [
      { id: 'lantern:turn', text: 'Tip: swipe sideways to turn the lake, and up or down to tilt it. Tap the water to float a lantern.', after: 0 },
      { id: 'lantern:many', text: 'Tip: start at rocks with many dots. When a rock has as many dots as open water beside it, every side gets a lantern.', after: 1 },
      { id: 'lantern:dark', text: 'Tip: look for a dark patch that only one place can still light. Its lantern must go there.', after: 2 },
      { id: 'lantern:ahead', text: 'Tip: stuck? Imagine a lantern on a spot and follow its light. If that leaves a patch nothing can light, it does not belong there.', after: 3 },
    ];
    if (this.level.grid.some((row) => row.includes('0'))) tips.push({ id: 'lantern:ring', text: 'Tip: no lantern sits right beside a rock with a ring, so the water around it can be ruled out.', after: 1 });
    return tips;
  }

  introPages(): IntroPage[] {
    return [
      ...lanternIntroPages(this.level),
      {
        caption: 'Swipe sideways to turn the lake, and up or down to tilt it. Tap the water to float a lantern.',
        glyph: () => {
          // A finger sweeping sideways under a small turning square.
          const root = new Container();
          const board = new Graphics().rect(-26, -26, 52, 52).stroke({ color: palette.pearl, width: 1.5, alpha: 0.6 });
          const finger = makeFinger();
          root.addChild(board, finger);
          const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.8 });
          tl.set(finger, { x: -40, y: 50, alpha: 1 }).to(finger, { x: 40, duration: 1, ease: 'sine.inOut' }).to(board, { rotation: Math.PI / 2, duration: 1, ease: 'sine.inOut' }, '<').to(finger, { alpha: 0, duration: 0.3 });
          root.on('destroyed', () => tl.kill());
          return root;
        },
      },
    ];
  }

  // ----- completion: the lanterns lift a little and glow brighter, warm sparks rise -----

  playCompletion(): Promise<void> {
    this.clearHints();
    this.voice.solve();
    const total = scaled(durations.completion);
    gsap.to(this.rise, { v: 0.5, duration: total * 0.6, ease: easings.ambient });
    gsap.to(this.glowBoost, { v: 1.4, duration: total * 0.4, ease: easings.ambient });
    const n = 90;
    const pos = new Float32Array(n * 3);
    const lanterns = [...this.lanterns];
    for (let k = 0; k < n; k++) {
      const p = this.cellPos(lanterns[k % lanterns.length] ?? 0);
      pos.set([p.x + (Math.random() - 0.5) * 0.6, 0.5 + Math.random() * 0.4, p.z + (Math.random() - 0.5) * 0.6], k * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.sparks = new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: col(palette.lemon), size: 0.18, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.scene.add(this.sparks);
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  // Dev only: faint rings where the stored answer's lanterns go.
  showSolutionOverlay(): void {
    for (const i of this.level.solution) this.ring(i, palette.pearl, 0.3);
  }

  destroy(): void {
    this.offCancel();
    this.stopDemo();
    this.voice.dispose();
    gsap.killTweensOf(this.rise);
    gsap.killTweensOf(this.glowBoost);
    stage3d()?.hide(this.world);
    // Let the 3D layer fade out before its scene is taken apart.
    const scene = this.scene;
    setTimeout(() => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
    }, 1000);
    this.container.destroy({ children: true });
  }
}

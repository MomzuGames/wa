import gsap from 'gsap';
import * as THREE from 'three';
import { type FederatedPointerEvent, Graphics } from 'pixi.js';
import type { ShellContext } from '../types';
import { mixColor, palette } from '../../design/palette';
import { durations, scaled } from '../../design/motion';
import { makeFinger } from '../../ui/introGlyphs';
import { col, glowTexture } from '../../three/kit';
import { Diorama } from '../../three/diorama';
import { type ShellLevel, clueMet, clueState, edgeEnds } from './model';
import { ShellPoolScene } from './view';

// Tidepools in 3D: the pool is a diorama of wet sand and shallow water; the points are small
// drops; shells (○) are pale rings and stones (●) round pebbles, mint once met and peach as
// soon as a line breaks them; the drawn tide is glowing water running between the points,
// with glints of light flowing along it. Drag from point to point to draw (a drag that
// starts away from the points turns the pool); drag back over a line to erase; tap a point
// to clear it. The rules, hints and notes are the 2D pool's.

const pool3d = {
  // The look (the owner: smooth, see-through, soft, pastel; anything glowing very faint).
  sand: mixColor(mixColor(palette.peach, palette.lemon, 0.35), palette.earthLight, 0.35), // warm pale sand under the water
  shallowOpacity: 0.13, // the sheet of shallow water over the whole pool
  streamOpacity: 0.36, // the tide you draw: clearer water, soft at its edges
  streamWidth: 0.3,
  stoneOpen: mixColor(palette.peach, palette.pearl, 0.35),
  waterY: 0.05,
  snap: 0.42, // of a cell: how close the finger must come to a point
  glintSpacing: 0.85,
  glintSpeed: 0.9,
} as const;

export class Pool3DScene extends ShellPoolScene {
  readonly ownsBackdrop = true;
  private d!: Diorama;
  private water3d = new THREE.Group();
  private clues3d = new THREE.Group();
  private ghosts3d = new Map<number, THREE.Mesh>();
  private nudge3d: THREE.Mesh<THREE.TorusGeometry, THREE.MeshBasicMaterial> | null = null;
  private glints!: THREE.Points;
  private turning = false;
  private demoLine: THREE.Group | null = null;
  private shallow!: THREE.ShaderMaterial;
  private blurGeo = new THREE.PlaneGeometry(0.75, 0.75);
  private shadowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: col(palette.void), transparent: true, opacity: 0.35, depthWrite: false });
  private shellGeo = new THREE.TorusGeometry(0.19, 0.055, 24, 64);
  private stoneGeo = new THREE.SphereGeometry(0.21, 48, 32);
  private jointGeo = new THREE.PlaneGeometry(pool3d.streamWidth * 1.15, pool3d.streamWidth * 1.15);
  private joint!: THREE.ShaderMaterial;
  private stream!: THREE.ShaderMaterial;

  constructor(ctx: ShellContext, level: ShellLevel, tutorial: boolean, levelIndex: number, levelName: string) {
    super(ctx, level, tutorial);
    for (const g of [this.water, this.points, this.glow, this.lines, this.flow, this.clueLayer, this.hintLayer]) g.visible = false;
    const w = level.width - 1;
    const h = level.height - 1;
    this.d = new Diorama({ region: 'tidepools', levelIndex, levelName, width: w + 1, depth: h + 1, slab: { color: mixColor(palette.earthLight, palette.peach, 0.3), top: pool3d.sand } });
    // A sheet of shallow, see-through mint water over pale sand, with faint ripples of light.
    this.shallow = waterMaterial(palette.mint, pool3d.shallowOpacity, 0.18);
    const shallow = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.7, h + 0.7), this.shallow);
    shallow.rotation.x = -Math.PI / 2;
    shallow.position.y = 0.006;
    this.d.board.add(shallow);
    // The points: tiny soft dots of light under the water.
    const dotGeo = new THREE.BufferGeometry();
    const dots: number[] = [];
    for (let y = 0; y < level.height; y++) for (let x = 0; x < level.width; x++) dots.push(...this.at(x, y).setY(0.02).toArray());
    dotGeo.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
    this.d.board.add(new THREE.Points(dotGeo, new THREE.PointsMaterial({ map: glowTexture(), color: col(mixColor(palette.mint, palette.pearl, 0.4)), size: 0.16, transparent: true, opacity: 0.35, depthWrite: false })));
    // The tide you draw is clearer water, gently rippling (one material for every stream).
    const aqua = mixColor(palette.mint, palette.sky, 0.3);
    this.stream = waterMaterial(aqua, pool3d.streamOpacity, 0.45, 'band');
    this.joint = waterMaterial(aqua, pool3d.streamOpacity * 0.85, 0.45, 'disc');
    const n = 120;
    const glintGeo = new THREE.BufferGeometry();
    glintGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3).fill(-99), 3));
    // Light glinting on the moving water: small, pale and faint.
    this.glints = new THREE.Points(glintGeo, new THREE.PointsMaterial({ map: glowTexture(), color: col(palette.pearl), size: 0.09, transparent: true, opacity: 0.22, depthWrite: false }));
    this.d.board.add(this.water3d, this.clues3d, this.glints);
    this.layout(ctx.width, ctx.height);
  }

  // A point of the pool in board units.
  private at(x: number, y: number): THREE.Vector3 {
    return new THREE.Vector3(x - (this.level.width - 1) / 2, pool3d.waterY, y - (this.level.height - 1) / 2);
  }

  // ----- the finger: the 2D pool asks which point is under it; the 3D pool answers -----

  protected override pointNear(gx: number, gy: number): { x: number; y: number } | null {
    if (!this.d) return null;
    const hit = this.d.pick(gx, gy, pool3d.waterY);
    if (!hit) return null;
    const x = Math.round(hit.x + (this.level.width - 1) / 2);
    const y = Math.round(hit.z + (this.level.height - 1) / 2);
    if (x < 0 || y < 0 || x >= this.level.width || y >= this.level.height) return null;
    const p = this.at(x, y);
    if (Math.hypot(hit.x - p.x, hit.z - p.z) > pool3d.snap) return null;
    return { x, y };
  }

  // A press on a point draws; anywhere else it turns and tilts the pool.
  protected override onDown(e: FederatedPointerEvent): void {
    if (!this.d) return;
    super.onDown(e);
    this.turning = !this.dragging;
    if (this.turning) this.d.orbit.down(e.global.x, e.global.y);
  }

  protected override onMove(e: FederatedPointerEvent): void {
    if (!this.d) return;
    if (this.turning) this.d.orbit.move(e.global.x, e.global.y);
    else super.onMove(e);
  }

  protected override onUp(): void {
    if (!this.d) return;
    if (this.turning) {
      this.d.orbit.up();
      this.turning = false;
      return;
    }
    super.onUp();
  }

  // ----- drawing: the 2D redraw becomes a 3D refresh -----

  protected override redraw(): void {
    if (!this.d) return;
    this.d.clearGroup(this.water3d);
    const { width: w, height: h } = this.level;
    // The tide: clearer water running between the points, soft and see-through at its edges,
    // with a gentle ripple of light moving through it. Joints are round pools of the same water.
    const joints = new Set<string>();
    for (const e of this.drawn) {
      const [a, b] = edgeEnds(w, h, e);
      const pa = this.at(a.x, a.y);
      const pb = this.at(b.x, b.y);
      this.d.strip(pa.clone().setY(0.04), pb.clone().setY(0.04), pool3d.streamWidth, this.stream, this.water3d);
      joints.add(`${a.x},${a.y}`);
      joints.add(`${b.x},${b.y}`);
    }
    for (const k of joints) {
      const [x, y] = k.split(',').map(Number) as [number, number];
      const pool = new THREE.Mesh(this.jointGeo, this.joint);
      pool.rotation.x = -Math.PI / 2;
      pool.position.copy(this.at(x, y)).setY(0.041);
      this.water3d.add(pool);
    }
    this.runs = this.findRuns();
    this.drawClues();
  }

  // Shells as pale rings, stones as round pebbles; mint once met, peach once broken.
  protected override drawClues(): void {
    if (!this.d) return;
    this.d.clearGroup(this.clues3d);
    for (const c of this.level.clues) {
      const state = clueState(this.level, this.drawn, c);
      // Pastel and matte: pale sea-stone while open, mint once met, peach once broken.
      const color = state === 'met' ? mixColor(palette.mint, palette.pearl, 0.15) : state === 'broken' ? mixColor(palette.peach, palette.pearl, 0.1) : pool3d.stoneOpen;
      const p = this.at(c.x, c.y);
      // A soft blurred shadow under every clue, and a very faint wash of its colour once it answers.
      const shadow = new THREE.Mesh(this.blurGeo, this.shadowMat);
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.copy(p).setY(0.03);
      this.clues3d.add(shadow);
      if (state !== 'open') {
        const wash = new THREE.Mesh(this.blurGeo, new THREE.MeshBasicMaterial({ map: glowTexture(), color: col(color), transparent: true, opacity: 0.12, depthWrite: false }));
        wash.rotation.x = -Math.PI / 2;
        wash.scale.setScalar(1.25);
        wash.position.copy(p).setY(0.035);
        this.clues3d.add(wash);
      }
      if (c.kind === 'shell') {
        // A ring of frosted sea-glass.
        const ring = new THREE.Mesh(this.shellGeo, new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.3, transparent: true, opacity: 0.8 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(p).setY(0.09);
        this.clues3d.add(ring);
      } else {
        // A smooth pebble, flattened by the sea.
        const pebble = new THREE.Mesh(this.stoneGeo, new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.65 }));
        pebble.scale.set(1, 0.5, 0.88);
        pebble.position.copy(p).setY(0.1);
        this.clues3d.add(pebble);
      }
    }
  }

  // Glints of light flowing along every stream and around closed loops.
  protected override drawFlow(): void {
    if (!this.d) return;
    const pos = this.glints.geometry.attributes.position as THREE.BufferAttribute;
    let k = 0;
    const shift = (this.time * pool3d.glintSpeed * this.flowBoost) % pool3d.glintSpacing;
    for (const run of this.runs) {
      for (let s = shift; s < run.length - 1 && k < pos.count; s += pool3d.glintSpacing) {
        const i = Math.floor(s);
        const f = s - i;
        const a = this.at(run[i]!.x, run[i]!.y);
        const b = this.at(run[i + 1]!.x, run[i + 1]!.y);
        pos.setXYZ(k++, a.x + (b.x - a.x) * f, 0.08, a.z + (b.z - a.z) * f);
      }
    }
    for (; k < pos.count; k++) pos.setXYZ(k, 0, -99, 0);
    pos.needsUpdate = true;
  }

  // A closed loop that is not right: the clues it misses pulse peach for a moment.
  protected override pulseUnmet(): void {
    for (const c of this.level.clues) {
      if (clueMet(this.level, this.drawn, c)) continue;
      const p = this.at(c.x, c.y);
      const wash = new THREE.Mesh(this.blurGeo, new THREE.MeshBasicMaterial({ map: glowTexture(), color: col(palette.peach), transparent: true, opacity: 0, depthWrite: false }));
      wash.rotation.x = -Math.PI / 2;
      wash.scale.setScalar(1.5);
      wash.position.copy(p).setY(0.04);
      this.d.marks.add(wash);
      gsap.fromTo(wash.material, { opacity: 0 }, { opacity: 0.35, duration: 0.5, yoyo: true, repeat: 3, onComplete: () => this.d.marks.remove(wash) });
    }
  }

  // ----- hints -----

  protected override showNudge(x: number, y: number): void {
    this.clearNudge();
    if (!this.d) return;
    const p = this.at(x, y);
    this.nudge3d = this.d.ring(p.x, p.z, 0.4, palette.pearl, 0.1);
    this.nudge = { g: new Graphics(), tween: gsap.to({}, { duration: 0 }) };
  }

  protected override clearNudge(): void {
    if (this.nudge3d) this.d?.marks.remove(this.nudge3d);
    this.nudge3d = null;
    this.nudge = null;
  }

  protected override addGhost(e: number, on: boolean): void {
    if (!this.d) return;
    const [a, b] = edgeEnds(this.level.width, this.level.height, e);
    const mat = new THREE.MeshBasicMaterial({ color: col(on ? palette.pearl : palette.peach), transparent: true, opacity: on ? 0.4 : 0.6, depthWrite: false });
    const m = this.d.strip(this.at(a.x, a.y).setY(0.09), this.at(b.x, b.y).setY(0.09), on ? 0.09 : 0.2, mat, this.d.marks);
    this.ghosts3d.set(e, m);
    this.ghosts.set(e, new Graphics());
  }

  protected override settleHints(): void {
    for (const [e] of this.ghosts) {
      if (this.drawn.has(e) !== this.level.solution.includes(e)) continue;
      const m = this.ghosts3d.get(e);
      if (m) this.d.marks.remove(m);
      this.ghosts3d.delete(e);
      this.ghosts.delete(e);
    }
    if (this.hintTarget && this.stepDone(this.hintTarget)) {
      this.clearNudge();
      this.hintTarget = null;
    }
  }

  protected override rebuildHints(): void {
    if (this.hintTarget && this.d) this.showNudge(this.hintTarget.x, this.hintTarget.y);
  }

  protected override clearHints(): void {
    this.clearNudge();
    this.ghosts3d.forEach((m) => this.d?.marks.remove(m));
    this.ghosts3d.clear();
    this.ghosts.clear();
    this.hintTarget = null;
  }

  // ----- the first pool: the whole loop shows faintly and a finger traces it -----

  protected override startDemo(): void {
    if (this.demo || this.drawn.size > 0 || this.solved || !this.d) return;
    const pts = this.loopPoints();
    const faint = new THREE.MeshBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0.25, depthWrite: false });
    this.demoLine = new THREE.Group();
    for (let i = 1; i < pts.length; i++) this.d.strip(this.at(pts[i - 1]!.x, pts[i - 1]!.y).setY(0.07), this.at(pts[i]!.x, pts[i]!.y).setY(0.07), 0.09, faint, this.demoLine);
    this.d.marks.add(this.demoLine);
    const finger = makeFinger();
    this.hintLayer.visible = true;
    this.hintLayer.addChild(finger);
    const where = (i: number) => this.d.toScreen(this.at(pts[i]!.x, pts[i]!.y), this.hintLayer);
    const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.2 });
    tl.call(() => {
      const p = where(0);
      finger.position.set(p.x, p.y);
    }).to(finger, { alpha: 1, duration: 0.25 });
    for (let i = 1; i < pts.length; i++) {
      const target = { t: 0 };
      tl.to(target, {
        t: 1,
        duration: 0.35,
        ease: 'none',
        onUpdate: () => {
          const a = where(i - 1);
          const b = where(i);
          finger.position.set(a.x + (b.x - a.x) * target.t, a.y + (b.y - a.y) * target.t);
        },
      });
    }
    tl.to(finger, { alpha: 0, duration: 0.3, delay: 0.3 });
    this.demo = { line: new Graphics(), finger, tl };
  }

  protected override stopDemo(): void {
    if (!this.demo) return;
    this.demo.tl.kill();
    this.demo.finger.destroy();
    this.demo = null;
    if (this.demoLine) this.d.marks.remove(this.demoLine);
    this.demoLine = null;
  }

  // ----- frame, layout, solve -----

  override layout(width: number, height: number): void {
    super.layout(width, height);
    this.d?.place();
  }

  override update(dt: number): void {
    super.update(dt);
    if (!this.d) return;
    this.d.update(dt);
    this.shallow.uniforms.uTime!.value = this.time;
    this.stream.uniforms.uTime!.value = this.time;
    this.joint.uniforms.uTime!.value = this.time;
    if (this.nudge3d) this.nudge3d.material.opacity = 0.3 + 0.2 * Math.sin(this.time * 3);
  }

  override playCompletion(): Promise<void> {
    this.clearHints();
    this.voice.solve();
    const total = scaled(durations.completion);
    gsap.timeline().to(this, { flowBoost: 4, duration: total * 0.3 }).to(this, { flowBoost: 1.5, duration: total * 0.6 });
    const loop = this.runs.flat().map((p) => this.at(p.x, p.y));
    this.d.celebrate(loop, palette.mint, total);
    return new Promise((resolve) => gsap.delayedCall(total, resolve));
  }

  override destroy(): void {
    super.destroy();
    this.d.dispose();
  }
}

// Water: a pastel tint, see-through, with slow ripples of light moving over it. A stream
// (`band`) fades out softly at both edges, across its width.
function waterMaterial(color: number, opacity: number, ripple: number, shape: 'sheet' | 'band' | 'disc' = 'sheet'): THREE.ShaderMaterial {
  const edge = {
    sheet: 'smoothstep(0.0, 0.04, vUv.x) * smoothstep(0.0, 0.04, vUv.y) * smoothstep(1.0, 0.96, vUv.x) * smoothstep(1.0, 0.96, vUv.y)',
    band: '1.0 - smoothstep(0.05, 0.5, abs(vUv.x - 0.5))',
    disc: '1.0 - smoothstep(0.05, 0.5, length(vUv - 0.5))',
  }[shape];
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { uTime: { value: 0 }, uColor: { value: col(color) }, uOpacity: { value: opacity }, uRipple: { value: ripple } },
    vertexShader: 'varying vec2 vUv; varying vec3 vWorld; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime; uniform vec3 uColor; uniform float uOpacity; uniform float uRipple; varying vec2 vUv; varying vec3 vWorld;
      void main(){
        vec2 p = vWorld.xz;
        float r = sin(p.x * 2.3 + sin(p.y * 1.7 + uTime * 0.4) * 1.3 + uTime * 0.5) * 0.5 + sin(p.y * 2.9 - p.x * 0.8 - uTime * 0.45) * 0.35 + sin((p.x + p.y) * 5.1 + uTime * 0.8) * 0.15;
        float light = smoothstep(0.35, 1.0, r) * 0.25 * uRipple;
        float edge = ${edge};
        gl_FragColor = vec4(mix(uColor, vec3(1.0), light), (uOpacity + light * 0.5) * edge);
      }`,
  });
}

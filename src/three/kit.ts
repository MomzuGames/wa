import * as THREE from 'three';
import { mixColor, palette } from '../design/palette';
import { getSettings } from '../core/save';

// Shared pieces of the 3D world: the soft glow every light uses, the paper lantern, and the
// camera you turn by swiping (as in the style samples the owner chose: free turning, a
// versatile tilt from nearly side-on to straight down, gliding rather than jumping).

export const col = (hex: number) => new THREE.Color(hex);

let glow: THREE.Texture | null = null;

// A soft round glow, white, for tinting: no edges, no squares.
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  // No drawing surface (the headless tests): a plain white texture stands in.
  if (!ctx) {
    glow = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    glow.needsUpdate = true;
    return glow;
  }
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.12)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(c);
  glow.colorSpace = THREE.SRGBColorSpace;
  return glow;
}

let band: THREE.Texture | null = null;

// A soft band, white, brightest along its middle and fading to nothing at both sides: laid
// across a strip it makes a line of light with no hard edge (the 2D game's soft lines).
export function softBandTexture(): THREE.Texture {
  if (band) return band;
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 4;
  const ctx = c.getContext('2d');
  if (!ctx) {
    band = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
    band.needsUpdate = true;
    return band;
  }
  const g = ctx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.7, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 4);
  band = new THREE.CanvasTexture(c);
  band.colorSpace = THREE.SRGBColorSpace;
  return band;
}

export function glowSprite(color: number, size: number, opacity: number): THREE.Sprite {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: col(color), transparent: true, opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

export interface PaperLantern {
  group: THREE.Group;
  body: THREE.Group;
  heart: THREE.Sprite;
  halo: THREE.Sprite;
}

// A Japanese paper lantern: a turned paper body glowing from inside, bamboo ribs, dark caps
// and a loop; its light: a bright heart, a warm halo and a pool on the water below.
// `ghost` makes a faint see-through one (for hints and demonstrations).
export function paperLantern(ghost = false): PaperLantern {
  const group = new THREE.Group();
  const body = new THREE.Group();
  const R = (t: number) => 0.13 + 0.12 * Math.sin(Math.PI * t);
  const profile: THREE.Vector2[] = [];
  for (let k = 0; k <= 18; k++) profile.push(new THREE.Vector2(R(k / 18), -0.28 + 0.56 * (k / 18)));
  const fade = ghost ? { transparent: true, opacity: 0.16, depthWrite: false } : {};
  body.add(new THREE.Mesh(new THREE.LatheGeometry(profile, 32), new THREE.MeshStandardMaterial({ color: col(palette.peach), emissive: col(mixColor(palette.lemon, palette.peach, 0.35)), emissiveIntensity: ghost ? 0.4 : 0.72, roughness: 0.75, ...fade })));
  const rib = new THREE.MeshBasicMaterial({ color: col(mixColor(palette.peach, palette.rose, 0.55)), ...fade });
  // A faint lantern is just its glowing shape: no ribs.
  for (let k = 1; k < (ghost ? 1 : 9); k++) {
    const t = k / 9;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(R(t) + 0.003, 0.005, 4, 32), rib);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = -0.28 + 0.56 * t;
    body.add(ring);
  }
  const capMat = new THREE.MeshStandardMaterial({ color: col(palette.void), roughness: 0.35, metalness: 0.3, ...fade });
  for (const y of [-0.3, 0.3]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 24), capMat);
    cap.position.y = y;
    body.add(cap);
  }
  const loop = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.01, 6, 16, Math.PI), capMat);
  loop.position.y = 0.33;
  body.add(loop);
  group.add(body);
  const heart = glowSprite(palette.lemon, 0.75, ghost ? 0.12 : 0.38);
  const halo = glowSprite(palette.peach, 2.2, ghost ? 0 : 0.135);
  group.add(halo, heart);
  if (!ghost) {
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.5), new THREE.MeshBasicMaterial({ map: glowTexture(), color: col(palette.lemon), transparent: true, opacity: 0.26, depthWrite: false, blending: THREE.AdditiveBlending }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = -0.43;
    group.add(pool);
  }
  group.scale.setScalar(1.25);
  return { group, body, heart, halo };
}

// Whether levels are seen straight from above (the view button in a level), with no
// turning: easier for drawing and dragging. Remembered in the settings.
export function topDown(): boolean {
  try {
    return getSettings().topDown === true;
  } catch {
    return false;
  }
}

// What the camera must keep in view: the board's footprint (half width and depth, in board
// units) and how far it reaches below and above its top surface.
export interface BoardExtent {
  halfW: number;
  halfD: number;
  low: number;
  high: number;
}

// The turning camera. A swipe sideways turns the board all the way round, up or down tilts
// it (15°–85°); the camera glides toward where the finger sends it, and a flick eases out.
// A touch that hardly moves is a tap. The whole board always fits, as large as it can,
// centred in the space between the top and bottom rows of buttons. In the top-down view
// (`topDown()`) the camera glides to its fixed view and swipes no longer turn it.
export const orbitStyle = {
  pitch: { start: 0.95, min: 0.26, max: 1.48 },
  yawStart: Math.PI / 4,
  turnPerPx: 0.0075,
  tiltPerPx: 0.0065,
  follow: 7,
  inertia: 0.9,
  tapSlop: 10,
  sideMargin: 14, // px kept clear at the screen's sides
  flatPitch: Math.PI / 2 - 0.0005, // straight down
} as const;

export class OrbitView {
  yaw: number = orbitStyle.yawStart;
  pitch: number = orbitStyle.pitch.start;
  private targetYaw: number = orbitStyle.yawStart;
  private targetPitch: number = orbitStyle.pitch.start;
  private spin = 0;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;

  private extent: BoardExtent;
  private fitCache = { key: '', dist: 1, offX: 0, offY: 0 };

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    radius: number | BoardExtent,
    private target = new THREE.Vector3(0, -0.15, 0),
    // The fixed view for top-down mode (a land whose heights matter keeps an angle).
    private flat: { pitch: number; yaw: number } = { pitch: orbitStyle.flatPitch, yaw: 0 },
  ) {
    this.extent = typeof radius === 'number' ? { halfW: radius / Math.SQRT2, halfD: radius / Math.SQRT2, low: 0.6, high: 0.6 } : radius;
  }

  get flatView(): boolean {
    return topDown();
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  // The finger has travelled far enough that this touch is a swipe, not a tap or a hold.
  get moved(): boolean {
    return !!this.drag?.moved;
  }

  down(x: number, y: number): void {
    this.drag = { x, y, sx: x, sy: y, moved: false };
    this.spin = 0;
  }

  move(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > orbitStyle.tapSlop) d.moved = true;
    if (d.moved && !this.flatView) {
      this.spin = -(x - d.x) * orbitStyle.turnPerPx;
      this.targetYaw += this.spin;
      this.targetPitch = Math.max(orbitStyle.pitch.min, Math.min(orbitStyle.pitch.max, this.targetPitch + (y - d.y) * orbitStyle.tiltPerPx));
    }
    d.x = x;
    d.y = y;
  }

  // A quarter turn (keyboard players), gliding like a swipe.
  turnBy(quarters: number): void {
    if (this.flatView) return;
    this.targetYaw += (quarters * Math.PI) / 2;
  }

  // Returns true when the touch was a tap (it hardly moved).
  up(): boolean {
    const d = this.drag;
    this.drag = null;
    return !!d && !d.moved;
  }

  cancel(): void {
    this.drag = null;
  }

  update(dt: number): void {
    if (this.flatView) {
      // Glide to the fixed view by the shortest way round.
      this.spin = 0;
      const turns = Math.round((this.targetYaw - this.flat.yaw) / (Math.PI * 2));
      this.targetYaw = this.flat.yaw + turns * Math.PI * 2;
      this.targetPitch = this.flat.pitch;
    } else if (this.targetPitch > orbitStyle.pitch.max) {
      this.targetPitch = orbitStyle.pitch.start;
    }
    if (!this.drag && Math.abs(this.spin) > 0.0002) {
      this.targetYaw += this.spin;
      this.spin *= orbitStyle.inertia;
    }
    const k = 1 - Math.exp(-dt * orbitStyle.follow);
    this.yaw += (this.targetYaw - this.yaw) * k;
    this.pitch += (this.targetPitch - this.pitch) * k;
  }

  // Frame the board between `top` and `bottom` (screen px) in a W×H screen.
  place(W: number, H: number, top: number, bottom: number): void {
    const cam = this.camera;
    const dir = new THREE.Vector3(Math.cos(this.pitch) * Math.sin(this.yaw), Math.sin(this.pitch), Math.cos(this.pitch) * Math.cos(this.yaw));
    const room = Math.max(1, bottom - top);
    cam.aspect = W / H;
    // The board fills the room as far as it can, fitted as it is turned right now; the
    // camera glides, so the size eases gently as it turns. The search runs only when the
    // view or the screen changes.
    const key = `${W}|${H}|${top}|${bottom}|${this.pitch.toFixed(3)}|${this.yaw.toFixed(3)}`;
    if (key !== this.fitCache.key) this.fit(dir, W, H, room, key);
    const f = this.fitCache;
    cam.position.copy(this.target).addScaledVector(dir, f.dist);
    cam.lookAt(this.target);
    // Shift the picture so the board sits in the middle of the room between the rows.
    cam.setViewOffset(W, H, f.offX, f.offY + H / 2 - (top + bottom) / 2, W, H);
    cam.updateProjectionMatrix();
  }

  private fit(dir: THREE.Vector3, W: number, H: number, room: number, key: string): void {
    const cam = this.camera;
    const e = this.extent;
    const pts: THREE.Vector3[] = [];
    for (const y of [-e.low, e.high]) {
      for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(new THREE.Vector3(sx! * e.halfW, y, sz! * e.halfD));
    }
    cam.clearViewOffset();
    const wantW = (W - orbitStyle.sideMargin * 2) / W; // fraction of the screen
    const wantH = room / H;
    const v = new THREE.Vector3();
    const bounds = (dist: number) => {
      cam.position.copy(this.target).addScaledVector(dir, dist);
      cam.lookAt(this.target);
      cam.updateProjectionMatrix();
      cam.updateMatrixWorld();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of pts) {
        v.copy(p).project(cam);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      return { x0, x1, y0, y1 };
    };
    let lo = 0.5;
    let hi = 200;
    for (let k = 0; k < 22; k++) {
      const mid = (lo + hi) / 2;
      const b = bounds(mid);
      const fits = (b.x1 - b.x0) / 2 <= wantW && (b.y1 - b.y0) / 2 <= wantH && mid > Math.max(e.high, 0) + 1;
      if (fits) hi = mid;
      else lo = mid;
    }
    const b = bounds(hi);
    // Centre the board's picture (not just its middle point): a tilted board looks bigger in front.
    const cx = ((b.x0 + b.x1) / 2 + 1) * 0.5 * W;
    const cy = (1 - (b.y0 + b.y1) / 2) * 0.5 * H;
    this.fitCache = { key, dist: hi, offX: cx - W / 2, offY: cy - H / 2 };
  }

  // The view in degrees, for the readout in test builds.
  get view(): { tilt: number; turn: number } {
    const deg = (r: number) => Math.round((r * 180) / Math.PI);
    return { tilt: deg(this.pitch), turn: ((deg(this.yaw) % 360) + 360) % 360 };
  }

  // Where a screen point lands on the board's floor (y = 0), or null.
  pick(x: number, y: number, W: number, H: number): THREE.Vector3 | null {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((x / W) * 2 - 1, -(y / H) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit) ? hit : null;
  }

  // Where a point of the board shows on screen (px).
  project(p: THREE.Vector3, W: number, H: number): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    return { x: (v.x + 1) * 0.5 * W, y: (1 - v.y) * 0.5 * H };
  }
}

import * as THREE from 'three';
import { mixColor, palette } from '../design/palette';

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

// The turning camera. A swipe sideways turns the board all the way round, up or down tilts
// it (15°–85°); the camera glides toward where the finger sends it, and a flick eases out.
// A touch that hardly moves is a tap. The whole board always fits, centred in the space
// between the top and bottom rows of buttons.
export const orbitStyle = {
  pitch: { start: 0.95, min: 0.26, max: 1.48 },
  yawStart: Math.PI / 4,
  turnPerPx: 0.0075,
  tiltPerPx: 0.0065,
  follow: 7,
  inertia: 0.9,
  tapSlop: 10,
} as const;

export class OrbitView {
  yaw: number = orbitStyle.yawStart;
  pitch: number = orbitStyle.pitch.start;
  private targetYaw: number = orbitStyle.yawStart;
  private targetPitch: number = orbitStyle.pitch.start;
  private spin = 0;
  private drag: { x: number; y: number; sx: number; sy: number; moved: boolean } | null = null;

  constructor(
    readonly camera: THREE.PerspectiveCamera,
    private radius: number,
    private target = new THREE.Vector3(0, -0.15, 0),
  ) {}

  get dragging(): boolean {
    return this.drag !== null;
  }

  down(x: number, y: number): void {
    this.drag = { x, y, sx: x, sy: y, moved: false };
    this.spin = 0;
  }

  move(x: number, y: number): void {
    const d = this.drag;
    if (!d) return;
    if (!d.moved && Math.hypot(x - d.sx, y - d.sy) > orbitStyle.tapSlop) d.moved = true;
    if (d.moved) {
      this.spin = -(x - d.x) * orbitStyle.turnPerPx;
      this.targetYaw += this.spin;
      this.targetPitch = Math.max(orbitStyle.pitch.min, Math.min(orbitStyle.pitch.max, this.targetPitch + (y - d.y) * orbitStyle.tiltPerPx));
    }
    d.x = x;
    d.y = y;
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
    const vfov = (cam.fov * Math.PI) / 180;
    const vfovRoom = 2 * Math.atan(Math.tan(vfov / 2) * (room / H));
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * (W / H));
    const R = this.radius + 0.35;
    const dist = R / Math.sin(Math.min(vfovRoom, hfov) / 2);
    cam.position.copy(this.target).addScaledVector(dir, dist);
    cam.lookAt(this.target);
    // Shift the picture so the board sits in the middle of the room between the rows.
    cam.setViewOffset(W, H, 0, H / 2 - (top + bottom) / 2, W, H);
    cam.updateProjectionMatrix();
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

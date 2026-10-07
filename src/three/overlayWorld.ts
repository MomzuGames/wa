import * as THREE from 'three';
import { mixColor, palette } from '../design/palette';
import { stage3d, type World3D } from './stage3d';
import { col, glowTexture } from './kit';
import { Backdrop, type BackdropMood } from './backdrop';
import { lightSpots } from './lights';

// A 3D world behind a 2D map. The map keeps doing everything (where things are, taps, names,
// paths, the story's colour), and each of its points can carry a 3D object: every frame
// the object is placed in the world right under that point, at a size that matches it, so
// the 3D islands and stones always sit exactly where the map says.

const overlayStyle = {
  pools: 8, // the little light and up to its whole family
} as const;

interface Anchor {
  object: THREE.Object3D;
  screen: () => { x: number; y: number } | null;
  px: () => number; // how wide (in screen px) one world unit of the object should look
}

export class OverlayWorld {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 400);
  readonly world: World3D;
  private backdrop: Backdrop;
  private anchors: Anchor[] = [];
  private ray = new THREE.Raycaster();
  private ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // The little light and its family shine on the islands below, each with a soft pool of
  // its colour on the ground beneath it.
  // Only the player's own light truly lights the islands: one light, made at the start and
  // never added to or taken away (each change of the number of lights rebuilt every shader,
  // which stalled the game mid-swipe). Every light, family too, has its pool on the ground.
  private shine = new THREE.PointLight(0xffffff, 0, 0, 1.6);
  private pools: Array<THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>> = [];
  private compiled = false;
  private v2 = new THREE.Vector2();
  private hitPoint = new THREE.Vector3();

  constructor(mood: BackdropMood) {
    this.backdrop = new Backdrop(this.scene, glowTexture(), mood);
    this.backdrop.fireflies.visible = false; // the map has its own glimmers
    this.scene.add(new THREE.HemisphereLight(col(mixColor(palette.sky, palette.pearl, 0.5)), col(palette.void), 0.8));
    const moon = new THREE.DirectionalLight(col(palette.pearl), 1.1);
    moon.position.set(-8, 14, 6);
    this.scene.add(moon);
    // Looking down on the map at a gentle angle: the islands read as solid, the map as flat.
    this.camera.position.set(0, 22, 40);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(this.shine);
    for (let k = 0; k < overlayStyle.pools; k++) {
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
      pool.rotation.x = -Math.PI / 2;
      pool.visible = false;
      this.scene.add(pool);
      this.pools.push(pool);
    }
    this.world = { scene: this.scene, camera: this.camera, bloom: () => 0.22 };
    stage3d()?.show(this.world);
  }

  add(object: THREE.Object3D, screen: Anchor['screen'], px: Anchor['px']): void {
    this.scene.add(object);
    this.anchors.push({ object, screen, px });
  }

  update(dt: number, pan = 0): void {
    const s = stage3d()?.size ?? { width: window.innerWidth, height: window.innerHeight };
    this.camera.aspect = s.width / s.height;
    this.camera.updateProjectionMatrix();
    this.backdrop.resize(s.width, s.height);
    this.backdrop.update(dt, pan);
    const tanHalf = Math.tan((this.camera.fov * Math.PI) / 360);
    // Every shader is prepared once, at the start, while everything is still in view: an
    // island first drawn as it scrolled in used to stall the swipe.
    if (!this.compiled) {
      this.compiled = true;
      this.pools.forEach((p) => (p.visible = true));
      stage3d()?.renderer.compile(this.scene, this.camera);
      this.pools.forEach((p) => (p.visible = false));
    }
    this.shineLights(s, tanHalf);
    for (const a of this.anchors) {
      const p = a.screen();
      // Far off screen (a scrolled journey), or where no ground lies under the point: hidden,
      // never left standing wherever it was last (that showed as a stray platform).
      const far = !p || p.y < -s.height * 0.6 || p.y > s.height * 1.6;
      const hit = this.hitPoint;
      if (!far) this.ray.setFromCamera(this.v2.set((p.x / s.width) * 2 - 1, -(p.y / s.height) * 2 + 1), this.camera);
      if (far || !this.ray.ray.intersectPlane(this.ground, hit)) {
        a.object.visible = false;
        continue;
      }
      a.object.visible = true;
      a.object.position.x = hit.x;
      a.object.position.z = hit.z;
      // Size: world units per screen px at that distance.
      const unitsPerPx = (2 * hit.distanceTo(this.camera.position) * tanHalf) / s.height;
      a.object.scale.setScalar(a.px() * unitsPerPx);
    }
  }

  private groundAt(x: number, y: number, s: { width: number; height: number }): THREE.Vector3 | null {
    this.ray.setFromCamera(this.v2.set((x / s.width) * 2 - 1, -(y / s.height) * 2 + 1), this.camera);
    const hit = new THREE.Vector3();
    return this.ray.ray.intersectPlane(this.ground, hit) ? hit : null;
  }

  private shineLights(s: { width: number; height: number }, tanHalf: number): void {
    const spots = lightSpots();
    this.shine.intensity = 0;
    this.pools.forEach((pool, i) => {
      const spot = spots[i];
      const under = spot ? this.groundAt(spot.x, spot.y + spot.size * 3.5, s) : null;
      pool.visible = !!under;
      if (!spot || !under) return;
      const unitsPerPx = (2 * under.distanceTo(this.camera.position) * tanHalf) / s.height;
      const lift = spot.size * 3.5 * unitsPerPx;
      if (i === 0) {
        // The light floats above its pool, as high as it looks above it on screen.
        this.shine.position.set(under.x, lift * 1.2, under.z - lift * 0.4);
        this.shine.color.set(spot.color);
        this.shine.intensity = 6 * lift * lift * spot.alpha;
        this.shine.distance = lift * 7;
      }
      pool.position.set(under.x, 0.02, under.z);
      pool.scale.setScalar(spot.size * 7 * unitsPerPx);
      pool.material.color.set(spot.color);
      pool.material.opacity = 0.12 * spot.alpha;
    });
  }

  dispose(): void {
    stage3d()?.hide(this.world);
    const scene = this.scene;
    setTimeout(() => {
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
        const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
        mats.forEach((x) => x.dispose());
      });
    }, 1000);
  }
}

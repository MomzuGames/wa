import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mixColor, palette } from '../design/palette';
import { col, glowSprite, glowTexture } from '../three/kit';

// The centrepiece of each level's island: a small 3D picture of the level's name (a bonsai
// on Bonsai, a heron on Heron, a stepped summit on Summit), so every level island is its
// own. Units: the island's radius is 1, its top is y = 0; a piece stays within about 0.55
// of the middle. Everything is round and smooth, in soft pastels. `main` takes the land's
// colour (muted while the level is locked); the other colours are fixed pastels.

export interface PropMaterials {
  main: THREE.MeshStandardMaterial;
  light: THREE.MeshStandardMaterial;
  dark: THREE.MeshStandardMaterial;
  green: THREE.MeshStandardMaterial;
  water: THREE.MeshStandardMaterial;
  warm: THREE.MeshStandardMaterial;
  wood: THREE.MeshStandardMaterial;
}

export interface LevelProp {
  group: THREE.Group;
  glows: THREE.Sprite[];
  movers: Array<(t: number) => void>;
}

const smooth = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.6, ...opts });

export function propMaterials(): PropMaterials {
  return {
    main: smooth(palette.pearl),
    light: smooth(mixColor(palette.pearl, palette.peach, 0.15), { roughness: 0.5 }),
    dark: smooth(mixColor(palette.earthLight, palette.pearl, 0.25), { roughness: 0.8 }),
    green: smooth(mixColor(palette.sage, palette.earthLight, 0.2), { roughness: 0.8 }),
    water: smooth(mixColor(palette.sky, palette.mint, 0.4), { roughness: 0.2, transparent: true, opacity: 0.85 }),
    warm: smooth(mixColor(palette.peach, palette.lemon, 0.4), { roughness: 0.5 }),
    wood: smooth(mixColor(palette.peach, palette.earthLight, 0.45), { roughness: 0.8 }),
  };
}

type V3 = [number, number, number];

class Builder {
  readonly group = new THREE.Group();
  readonly glows: THREE.Sprite[] = [];
  readonly movers: Array<(t: number) => void> = [];

  constructor(readonly m: PropMaterials, readonly rand: () => number) {}

  add(mesh: THREE.Object3D, pos: V3, parent: THREE.Object3D = this.group): THREE.Object3D {
    mesh.position.set(...pos);
    parent.add(mesh);
    return mesh;
  }
  sphere(r: number, mat: THREE.Material, pos: V3, scale: V3 = [1, 1, 1], parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.SphereGeometry(r, 28, 18), mat);
    m.scale.set(...scale);
    this.add(m, pos, parent);
    return m;
  }
  cyl(rTop: number, rBottom: number, h: number, mat: THREE.Material, pos: V3, sides = 24, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBottom, h, sides), mat);
    this.add(m, [pos[0], pos[1] + h / 2, pos[2]], parent);
    return m;
  }
  cone(r: number, h: number, mat: THREE.Material, pos: V3, sides = 24, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, sides), mat);
    this.add(m, [pos[0], pos[1] + h / 2, pos[2]], parent);
    return m;
  }
  block(w: number, h: number, d: number, mat: THREE.Material, pos: V3, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(w, h, d) * 0.22), mat);
    this.add(m, [pos[0], pos[1] + h / 2, pos[2]], parent);
    return m;
  }
  torus(r: number, tube: number, mat: THREE.Material, pos: V3, rot: V3 = [-Math.PI / 2, 0, 0], arc = Math.PI * 2, parent?: THREE.Object3D): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 14, 48, arc), mat);
    m.rotation.set(...rot);
    this.add(m, pos, parent);
    return m;
  }
  disc(r: number, mat: THREE.Material, y = 0.03, pos: [number, number] = [0, 0]): THREE.Mesh {
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 48), mat);
    m.rotation.x = -Math.PI / 2;
    this.add(m, [pos[0], y, pos[1]]);
    return m;
  }
  glow(color: number, size: number, opacity: number, pos: V3, parent?: THREE.Object3D): THREE.Sprite {
    const g = glowSprite(color, size, opacity);
    this.add(g, pos, parent);
    this.glows.push(g);
    return g;
  }
  // A thin curved stem from the ground (reeds, kelp, trunks), as a smooth tube.
  stem(points: V3[], radius: number, mat: THREE.Material, parent?: THREE.Object3D): THREE.Mesh {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, radius, 8), mat);
    (parent ?? this.group).add(m);
    return m;
  }
  sway(o: THREE.Object3D, amount: number, speed = 1.2): void {
    const phase = this.rand() * 6;
    this.movers.push((t) => (o.rotation.z = amount * Math.sin(t * speed + phase)));
  }
  spin(o: THREE.Object3D, speed: number): void {
    this.movers.push((t) => (o.rotation.y = t * speed));
  }
  bob(o: THREE.Object3D, amount: number, speed = 1): void {
    const y = o.position.y;
    const phase = this.rand() * 6;
    this.movers.push((t) => (o.position.y = y + amount * Math.sin(t * speed + phase)));
  }
  pivot(pos: V3 = [0, 0, 0]): THREE.Group {
    const g = new THREE.Group();
    this.add(g, pos);
    return g;
  }
}

// The bevelled crescent of a moon.
function crescentGeometry(r: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (let k = 0; k <= 32; k++) {
    const a = -2.02 + (4.04 * k) / 32;
    if (k === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  for (let k = 0; k <= 32; k++) {
    const a = 1.613 - (3.226 * k) / 32;
    shape.lineTo(-0.4 * r + Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: r * 0.15, bevelEnabled: true, bevelSize: r * 0.06, bevelThickness: r * 0.06, bevelSegments: 5, curveSegments: 32 });
  geo.center();
  return geo;
}

type Make = (b: Builder) => void;

const pond = (b: Builder, r = 0.42) => {
  b.disc(r, b.m.water, 0.028);
  b.torus(r, 0.03, b.m.dark, [0, 0.03, 0]);
};

const PROPS: Record<string, Make> = {
  // ----- Tidepools -----
  Foam: (b) => {
    pond(b, 0.36);
    for (let k = 0; k < 9; k++) {
      const a = b.rand() * Math.PI * 2;
      const d = 0.15 + b.rand() * 0.25;
      b.bob(b.sphere(0.035 + b.rand() * 0.04, b.m.light, [Math.cos(a) * d, 0.06, Math.sin(a) * d]), 0.012, 1.4);
    }
  },
  Kelp: (b) => {
    for (let k = 0; k < 4; k++) {
      const p = b.pivot([(k - 1.5) * 0.12, 0, (b.rand() - 0.5) * 0.2]);
      const h = 0.45 + b.rand() * 0.3;
      b.stem([[0, 0, 0], [0.04, h * 0.35, 0], [-0.04, h * 0.7, 0], [0.02, h, 0]], 0.022, b.m.green, p);
      b.sphere(0.04, b.m.green, [0.02, h, 0], [1, 1.6, 0.6], p);
      b.sway(p, 0.12, 1);
    }
  },
  Anemone: (b) => {
    b.cyl(0.13, 0.16, 0.14, b.m.warm, [0, 0, 0]);
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const p = b.pivot([Math.cos(a) * 0.1, 0.14, Math.sin(a) * 0.1]);
      b.stem([[0, 0, 0], [Math.cos(a) * 0.04, 0.08, Math.sin(a) * 0.04], [Math.cos(a) * 0.09, 0.15, Math.sin(a) * 0.09]], 0.013, b.m.main, p);
      b.sway(p, 0.15, 1.6);
    }
  },
  Driftwood: (b) => {
    const log = b.pivot([0, 0.07, 0]);
    log.rotation.y = 0.5;
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.6, 8, 20), b.m.wood);
    m.rotation.z = Math.PI / 2;
    log.add(m);
    b.stem([[0.12, 0, 0], [0.2, 0.1, 0.04], [0.26, 0.17, 0.02]], 0.025, b.m.wood, log);
  },
  Shells: (b) => {
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      const c = b.cone(0.07, 0.2, k === 1 ? b.m.warm : b.m.light, [Math.cos(a) * 0.2, 0.05, Math.sin(a) * 0.2]);
      c.rotation.set(Math.PI / 2, 0, a);
    }
    b.sphere(0.12, b.m.main, [0, 0.03, 0], [1, 0.35, 0.9]);
  },
  Pebbles: (b) => {
    const tones = [b.m.light, b.m.dark, b.m.warm, b.m.main];
    for (let k = 0; k < 7; k++) {
      const a = b.rand() * Math.PI * 2;
      const d = b.rand() * 0.35;
      const r = 0.05 + b.rand() * 0.05;
      b.sphere(r, tones[k % 4]!, [Math.cos(a) * d, r * 0.35, Math.sin(a) * d], [1.3, 0.55, 1]);
    }
  },
  'Turning Tide': (b) => {
    pond(b, 0.4);
    const swirl = b.pivot([0, 0.05, 0]);
    for (let k = 0; k < 3; k++) b.torus(0.1 + k * 0.1, 0.018, b.m.light, [0, k * 0.01, 0], [-Math.PI / 2, 0, 0], Math.PI * 1.3, swirl).rotation.z = k * 1.4;
    b.spin(swirl, 0.6);
  },
  Barnacle: (b) => {
    b.sphere(0.25, b.m.dark, [0, 0.06, 0], [1, 0.6, 1]);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const d = 0.12 + b.rand() * 0.06;
      b.cyl(0.025, 0.045, 0.06, b.m.light, [Math.cos(a) * d, 0.17 - d * 0.5, Math.sin(a) * d]);
    }
  },
  Undertow: (b) => {
    pond(b, 0.42);
    const ring = b.pivot([0, 0.05, 0]);
    for (let k = 0; k < 10; k++) {
      const a = (k / 10) * Math.PI * 2;
      const d = 0.12 + (k % 3) * 0.08;
      b.sphere(0.025, b.m.light, [Math.cos(a) * d, 0, Math.sin(a) * d], [1, 1, 1], ring);
    }
    b.spin(ring, 1.1);
  },
  'Deep Pool': (b) => {
    b.disc(0.42, b.m.water, 0.028);
    b.disc(0.22, smooth(mixColor(palette.sky, palette.earth, 0.55), { roughness: 0.2 }), 0.031);
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      b.sphere(0.05, b.m.dark, [Math.cos(a) * 0.45, 0.03, Math.sin(a) * 0.45], [1.2, 0.6, 1]);
    }
  },
  // ----- Night Sky -----
  Dusk: (b) => {
    b.sphere(0.24, b.m.warm, [0, 0.0, -0.1], [1, 1, 0.5]);
    b.glow(palette.peach, 0.9, 0.18, [0, 0.12, -0.1]);
    b.sphere(0.4, b.m.green, [0, -0.08, 0.12], [1, 0.45, 0.6]);
  },
  'First Star': (b) => {
    const star = b.pivot([0, 0.55, 0]);
    b.sphere(0.07, b.m.light, [0, 0, 0], [1, 1, 1], star);
    b.glow(palette.pearl, 0.6, 0.3, [0, 0, 0], star);
    b.bob(star, 0.04, 0.8);
    b.sphere(0.12, b.m.dark, [0, 0.04, 0], [1.2, 0.5, 1]);
  },
  Comet: (b) => {
    const comet = b.pivot([0, 0.45, 0]);
    comet.rotation.z = -0.5;
    b.sphere(0.07, b.m.light, [0, 0, 0], [1, 1, 1], comet);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.5, 24, 1, true), smooth(palette.pearl, { transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    tail.rotation.z = Math.PI / 2;
    tail.position.x = 0.27;
    comet.add(tail);
    b.glow(palette.pearl, 0.5, 0.25, [0, 0, 0], comet);
    b.bob(comet, 0.04, 0.7);
  },
  'Pole Star': (b) => {
    b.cyl(0.02, 0.05, 0.5, b.m.dark, [0, 0, 0]);
    const star = b.pivot([0, 0.62, 0]);
    b.sphere(0.07, b.m.light, [0, 0, 0], [1, 1, 1], star);
    b.glow(palette.pearl, 0.7, 0.32, [0, 0, 0], star);
  },
  Meteor: (b) => {
    b.torus(0.2, 0.05, b.m.dark, [0, 0.03, 0]);
    b.sphere(0.09, b.m.warm, [0, 0.06, 0], [1, 0.8, 1]);
    b.glow(palette.peach, 0.5, 0.22, [0, 0.08, 0]);
  },
  'Milky Way': (b) => {
    const arc = b.pivot([0, 0.15, 0]);
    const n = 40;
    const pts = new Float32Array(n * 3);
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const a = Math.PI * (0.1 + 0.8 * t);
      pts.set([Math.cos(a) * 0.45 + (b.rand() - 0.5) * 0.06, Math.sin(a) * 0.45 + (b.rand() - 0.5) * 0.06, (b.rand() - 0.5) * 0.08], k * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
    arc.add(new THREE.Points(geo, new THREE.PointsMaterial({ map: glowTexture(), color: col(palette.pearl), size: 0.07, transparent: true, opacity: 0.8, depthWrite: false })));
  },
  Nebula: (b) => {
    const cloud = b.pivot([0, 0.35, 0]);
    const tints = [palette.lavender, palette.rose, palette.sky];
    for (let k = 0; k < 5; k++) {
      const mat = smooth(tints[k % 3]!, { transparent: true, opacity: 0.45 });
      b.sphere(0.1 + b.rand() * 0.07, mat, [(b.rand() - 0.5) * 0.35, (b.rand() - 0.5) * 0.15, (b.rand() - 0.5) * 0.2], [1, 0.8, 1], cloud);
    }
    b.glow(palette.lavender, 0.9, 0.15, [0, 0, 0], cloud);
    b.spin(cloud, 0.15);
  },
  Aurora: (b) => {
    const tints = [palette.mint, palette.lavender, palette.sky];
    for (let k = 0; k < 3; k++) {
      const geo = new THREE.PlaneGeometry(0.8, 0.28, 24, 1);
      const pos = geo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) pos.setZ(i, Math.sin(pos.getX(i) * 6 + k) * 0.06);
      geo.computeVertexNormals();
      const ribbon = new THREE.Mesh(geo, smooth(tints[k]!, { transparent: true, opacity: 0.4, side: THREE.DoubleSide, emissive: col(tints[k]!), emissiveIntensity: 0.1 }));
      b.add(ribbon, [0, 0.35 + k * 0.08, -0.1 + k * 0.08]);
      b.sway(ribbon, 0.05, 0.6);
    }
  },
  Eclipse: (b) => {
    const sky = b.pivot([0, 0.45, 0]);
    b.torus(0.15, 0.02, b.m.warm, [0, 0, 0], [0, 0, 0], Math.PI * 2, sky);
    b.glow(palette.lemon, 0.7, 0.2, [0, 0, -0.01], sky);
    b.sphere(0.14, b.m.dark, [0.03, 0, 0.02], [1, 1, 0.4], sky);
  },
  Zenith: (b) => {
    b.cone(0.09, 0.45, b.m.dark, [0, 0, 0], 4);
    const star = b.pivot([0, 0.68, 0]);
    b.sphere(0.06, b.m.light, [0, 0, 0], [1, 1, 1], star);
    for (let k = 0; k < 4; k++) b.cone(0.02, 0.12, b.m.light, [0, 0.03, 0], 8, star).rotation.z = (k * Math.PI) / 2;
    b.glow(palette.pearl, 0.8, 0.3, [0, 0, 0], star);
    b.spin(star, 0.5);
  },
  // ----- Stone Garden -----
  Pebble: (b) => {
    for (let k = 1; k <= 3; k++) b.torus(0.12 + k * 0.1, 0.008, b.m.light, [0, 0.025, 0]);
    b.sphere(0.12, b.m.main, [0, 0.05, 0], [1.2, 0.55, 1]);
  },
  Moss: (b) => {
    for (let k = 0; k < 4; k++) b.sphere(0.1 + b.rand() * 0.07, b.m.green, [(b.rand() - 0.5) * 0.4, 0, (b.rand() - 0.5) * 0.4], [1, 0.55, 1]);
    b.sphere(0.1, b.m.dark, [0.05, 0.06, 0.05], [1.2, 0.8, 1]);
  },
  Rake: (b) => {
    for (let k = 0; k < 5; k++) b.block(0.7, 0.012, 0.02, b.m.light, [0, 0.025, -0.24 + k * 0.12]);
    const rake = b.pivot([0.1, 0.03, 0.05]);
    rake.rotation.set(0, 0.6, 0.5);
    b.block(0.025, 0.55, 0.025, b.m.wood, [0, 0, 0], rake);
    b.block(0.25, 0.03, 0.03, b.m.wood, [0, 0.0, 0], rake);
  },
  Bonsai: (b) => {
    b.cyl(0.16, 0.12, 0.1, b.m.main, [0, 0, 0]);
    b.stem([[0, 0.1, 0], [0.05, 0.22, 0], [-0.04, 0.32, 0.02], [0.06, 0.42, 0]], 0.03, b.m.wood);
    const crown = b.pivot([0, 0.4, 0]);
    b.sphere(0.12, b.m.green, [0.08, 0.02, 0], [1.3, 0.55, 1], crown);
    b.sphere(0.1, b.m.green, [-0.1, -0.06, 0.04], [1.3, 0.55, 1], crown);
    b.sphere(0.09, b.m.green, [0.02, 0.1, -0.02], [1.3, 0.55, 1], crown);
    b.sway(crown, 0.04, 0.8);
  },
  Koi: (b) => {
    pond(b, 0.42);
    const swim = b.pivot([0, 0.05, 0]);
    [b.m.warm, b.m.light].forEach((mat, k) => {
      const fish = b.pivot([0, 0, 0]);
      swim.add(fish);
      const a = k * Math.PI;
      const body = b.sphere(0.06, mat, [Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2], [1, 0.5, 2], fish);
      body.rotation.y = -a;
      b.cone(0.04, 0.07, mat, [Math.cos(a) * 0.2 + Math.cos(a - Math.PI / 2) * 0.12, -0.035, Math.sin(a) * 0.2 + Math.sin(a - Math.PI / 2) * 0.12], 12, fish).rotation.set(Math.PI / 2, 0, a);
    });
    b.spin(swim, 0.5);
  },
  Bridge: (b) => {
    b.block(0.9, 0.012, 0.22, b.m.water, [0, 0.025, 0]);
    b.torus(0.3, 0.035, b.m.main, [0, 0.03, 0], [0, Math.PI / 2, 0], Math.PI);
    b.torus(0.3, 0.012, b.m.wood, [0, 0.12, 0.08], [0, Math.PI / 2, 0], Math.PI).scale.set(1, 0.9, 1);
  },
  Lantern: (b) => {
    b.cyl(0.12, 0.14, 0.05, b.m.dark, [0, 0, 0]);
    b.cyl(0.04, 0.05, 0.2, b.m.dark, [0, 0.05, 0]);
    b.block(0.16, 0.12, 0.16, b.m.light, [0, 0.25, 0]);
    b.glow(palette.lemon, 0.5, 0.25, [0, 0.31, 0]);
    b.cone(0.17, 0.1, b.m.dark, [0, 0.37, 0], 4).rotation.y = Math.PI / 4;
    b.sphere(0.025, b.m.dark, [0, 0.49, 0]);
  },
  Pagoda: (b) => {
    let y = 0;
    for (let k = 0; k < 3; k++) {
      const w = 0.3 - k * 0.07;
      b.block(w, 0.1, w, b.m.light, [0, y, 0]);
      b.cone(w * 0.85, 0.08, b.m.main, [0, y + 0.1, 0], 4).rotation.y = Math.PI / 4;
      y += 0.16;
    }
    b.cyl(0.008, 0.012, 0.12, b.m.dark, [0, y - 0.02, 0]);
  },
  Temple: (b) => {
    const red = smooth(mixColor(palette.rose, palette.peach, 0.4));
    for (const x of [-0.18, 0.18]) b.cyl(0.025, 0.03, 0.42, red, [x, 0, 0]);
    b.block(0.52, 0.04, 0.06, red, [0, 0.42, 0]).rotation.z = 0;
    b.block(0.44, 0.03, 0.05, red, [0, 0.33, 0]);
  },
  Mountain: (b) => {
    for (const [x, z, h, r] of [[0, -0.05, 0.5, 0.25], [-0.22, 0.1, 0.32, 0.18], [0.2, 0.12, 0.28, 0.16]] as const) {
      b.cone(r, h, b.m.dark, [x, 0, z], 32);
      b.cone(r * 0.35, h * 0.35, b.m.light, [x, h * 0.65, z], 32);
    }
  },
  // ----- Crystal Caves -----
  Quartz: (b) => crystal(b, 0, 0, 0.5, 0.08, 0),
  Facet: (b) => {
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), smooth(palette.sky, { roughness: 0.15, flatShading: true, transparent: true, opacity: 0.9 }));
    gem.scale.set(1, 1.3, 1);
    b.add(gem, [0, 0.3, 0]);
    b.spin(gem, 0.4);
    b.bob(gem, 0.03, 0.9);
    b.glow(palette.sky, 0.6, 0.12, [0, 0.3, 0]);
  },
  Geode: (b) => {
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), smooth(mixColor(palette.earthLight, palette.pearl, 0.2), { side: THREE.DoubleSide }));
    shell.rotation.x = Math.PI;
    shell.position.y = 0.26;
    b.group.add(shell);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      crystal(b, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.12, 0.03, (b.rand() - 0.5) * 0.6, 0.12, palette.lavender);
    }
  },
  Vein: (b) => {
    b.sphere(0.26, b.m.dark, [0, 0.08, 0], [1, 0.65, 0.9]);
    const vein = b.torus(0.25, 0.015, smooth(palette.sky, { emissive: col(palette.sky), emissiveIntensity: 0.3 }), [0, 0.1, 0], [0.4, 0.2, 0]);
    vein.scale.set(1, 1, 0.65);
  },
  Amethyst: (b) => {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      crystal(b, Math.cos(a) * 0.1, Math.sin(a) * 0.1, 0.22 + b.rand() * 0.18, 0.05, Math.cos(a) * 0.35, 0, palette.lavender);
    }
    crystal(b, 0, 0, 0.45, 0.07, 0, 0, palette.lavender);
  },
  Halo: (b) => {
    crystal(b, 0, 0, 0.38, 0.07, 0);
    const ring = b.pivot([0, 0.3, 0]);
    b.torus(0.22, 0.012, b.m.light, [0, 0, 0], [-Math.PI / 2 + 0.3, 0, 0], Math.PI * 2, ring);
    b.spin(ring, 0.5);
  },
  Prism: (b) => {
    const prism = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.22, 3), smooth(palette.pearl, { roughness: 0.1, transparent: true, opacity: 0.8 }));
    prism.rotation.x = Math.PI / 2;
    b.add(prism, [0, 0.13, 0]);
    [palette.rose, palette.sky, palette.lemon].forEach((c, k) => {
      const beam = b.block(0.32, 0.012, 0.012, smooth(c, { emissive: col(c), emissiveIntensity: 0.35 }), [0.26, 0.12, 0]);
      beam.rotation.y = (k - 1) * 0.25;
    });
  },
  Spectrum: (b) => {
    [palette.rose, palette.peach, palette.lemon, palette.mint, palette.sky].forEach((c, k) => crystal(b, (k - 2) * 0.1, (k % 2) * 0.06, 0.2 + k * 0.04, 0.035, 0, 0, c));
  },
  Lumen: (b) => {
    const orb = b.sphere(0.13, smooth(palette.pearl, { emissive: col(palette.sky), emissiveIntensity: 0.25, roughness: 0.1 }), [0, 0.32, 0]);
    b.glow(palette.sky, 0.9, 0.22, [0, 0.32, 0]);
    b.bob(orb, 0.03, 0.8);
    b.cyl(0.05, 0.09, 0.12, b.m.dark, [0, 0, 0]);
  },
  Core: (b) => {
    b.sphere(0.14, smooth(palette.sky, { roughness: 0.1, emissive: col(palette.sky), emissiveIntensity: 0.15 }), [0, 0.25, 0]);
    const rings = b.pivot([0, 0.25, 0]);
    b.torus(0.22, 0.015, b.m.light, [0, 0, 0], [0, 0, 0], Math.PI * 2, rings);
    b.torus(0.22, 0.015, b.m.light, [0, 0, 0], [Math.PI / 2, 0, 0], Math.PI * 2, rings);
    b.spin(rings, 0.4);
  },
  // ----- Moon Lake -----
  Reed: (b) => {
    pond(b, 0.36);
    for (let k = 0; k < 6; k++) {
      const p = b.pivot([(b.rand() - 0.5) * 0.4, 0, (b.rand() - 0.5) * 0.4]);
      const h = 0.3 + b.rand() * 0.25;
      b.cyl(0.008, 0.012, h, b.m.green, [0, 0, 0], 8, p);
      b.sphere(0.022, b.m.wood, [0, h, 0], [1, 2.4, 1], p);
      b.sway(p, 0.08, 1.1);
    }
  },
  Lotus: (b) => {
    pond(b, 0.4);
    b.disc(0.16, b.m.green, 0.035, [0.12, 0.08]);
    const flower = b.pivot([0, 0.05, 0]);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      const petal = b.sphere(0.06, smooth(mixColor(palette.rose, palette.pearl, 0.3)), [Math.cos(a) * 0.06, 0.03, Math.sin(a) * 0.06], [0.6, 0.35, 1.2], flower);
      petal.rotation.set(0.5, -a, 0);
    }
    b.sphere(0.03, b.m.warm, [0, 0.06, 0], [1, 0.6, 1], flower);
  },
  Heron: (b) => {
    pond(b, 0.36);
    const bird = b.pivot([0, 0.03, 0]);
    for (const x of [-0.03, 0.03]) b.cyl(0.006, 0.006, 0.18, b.m.dark, [x, 0, 0], 6, bird);
    b.sphere(0.07, b.m.light, [0, 0.24, 0], [1, 0.8, 1.6], bird);
    b.stem([[0, 0.27, 0.06], [0, 0.38, 0.06], [0, 0.44, 0.03]], 0.014, b.m.light, bird);
    b.sphere(0.03, b.m.light, [0, 0.45, 0.03], [1, 1, 1.2], bird);
    b.cone(0.012, 0.08, b.m.warm, [0, 0.45, 0.07], 8, bird).rotation.x = Math.PI / 2;
  },
  Mist: (b) => {
    pond(b, 0.4);
    for (let k = 0; k < 4; k++) {
      const puff = b.sphere(0.12 + b.rand() * 0.06, smooth(palette.pearl, { transparent: true, opacity: 0.3 }), [(b.rand() - 0.5) * 0.4, 0.15 + b.rand() * 0.1, (b.rand() - 0.5) * 0.3], [1.5, 0.6, 1]);
      b.bob(puff, 0.03, 0.5);
    }
  },
  Firefly: (b) => {
    for (let k = 0; k < 4; k++) b.cyl(0.006, 0.01, 0.15 + b.rand() * 0.1, b.m.green, [(b.rand() - 0.5) * 0.4, 0, (b.rand() - 0.5) * 0.4], 6);
    for (let k = 0; k < 7; k++) {
      const fly = b.pivot([(b.rand() - 0.5) * 0.5, 0.2 + b.rand() * 0.3, (b.rand() - 0.5) * 0.5]);
      b.sphere(0.015, b.m.warm, [0, 0, 0], [1, 1, 1], fly);
      b.glow(palette.lemon, 0.18, 0.4, [0, 0, 0], fly);
      b.bob(fly, 0.05, 0.7 + b.rand());
    }
  },
  Reflection: (b) => {
    pond(b, 0.4);
    const lantern = b.pivot([0, 0.14, 0]);
    b.sphere(0.06, b.m.warm, [0, 0, 0], [1, 1.25, 1], lantern);
    b.glow(palette.lemon, 0.45, 0.22, [0, 0, 0], lantern);
    b.sphere(0.06, smooth(palette.peach, { transparent: true, opacity: 0.3 }), [0, -0.1, 0], [1, 1.25, 1]);
    b.bob(lantern, 0.015, 1);
  },
  Crescent: (b) => {
    const moon = new THREE.Mesh(crescentGeometry(0.22), smooth(mixColor(palette.lemon, palette.pearl, 0.4), { emissive: col(palette.lemon), emissiveIntensity: 0.08 }));
    b.add(moon, [0, 0.45, 0]);
    moon.rotation.z = 0.5;
    b.bob(moon, 0.03, 0.6);
    b.glow(palette.lemon, 0.8, 0.1, [0, 0.45, 0]);
  },
  'Harvest Moon': (b) => {
    b.sphere(0.25, smooth(mixColor(palette.peach, palette.lemon, 0.5), { emissive: col(palette.peach), emissiveIntensity: 0.1 }), [0, 0.25, -0.15]);
    b.glow(palette.peach, 1.1, 0.15, [0, 0.25, -0.15]);
    b.sphere(0.35, b.m.green, [0.05, -0.06, 0.15], [1.2, 0.4, 0.7]);
  },
  Stillness: (b) => {
    pond(b, 0.42);
    for (let k = 1; k <= 3; k++) b.torus(k * 0.1, 0.005, b.m.light, [0, 0.032, 0]);
    b.sphere(0.07, b.m.dark, [0, 0.04, 0], [1.2, 0.6, 1]);
  },
  'Full Moon': (b) => {
    const moon = b.sphere(0.2, smooth(mixColor(palette.pearl, palette.lemon, 0.25), { emissive: col(palette.pearl), emissiveIntensity: 0.1 }), [0, 0.45, 0]);
    b.glow(palette.pearl, 1, 0.15, [0, 0.45, 0]);
    b.bob(moon, 0.03, 0.5);
  },
  // ----- Shadow Terrace: the same soft rounded blocks as the land's island -----
  Cairn: (b) => {
    let y = 0;
    for (let k = 0; k < 4; k++) {
      const r = 0.16 - k * 0.03;
      b.sphere(r, k % 2 ? b.m.light : b.m.main, [0, y + r * 0.45, 0], [1, 0.5, 1]);
      y += r * 0.9;
    }
  },
  Step: (b) => {
    b.block(0.3, 0.1, 0.3, b.m.main, [-0.1, 0, 0]);
    b.block(0.3, 0.2, 0.3, b.m.light, [0.15, 0, -0.05]);
  },
  Stair: (b) => {
    for (let k = 0; k < 4; k++) b.block(0.14, 0.08 * (k + 1), 0.3, k % 2 ? b.m.light : b.m.main, [-0.22 + k * 0.15, 0, 0]);
  },
  Wall: (b) => {
    for (let k = 0; k < 4; k++) for (let j = 0; j < 2; j++) b.block(0.15, 0.1, 0.12, (k + j) % 2 ? b.m.light : b.m.main, [-0.24 + k * 0.16 + (j % 2) * 0.03, j * 0.105, 0]);
  },
  Courtyard: (b) => {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2;
      const w = b.block(0.42, 0.08, 0.07, b.m.main, [Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22]);
      w.rotation.y = -a + Math.PI / 2;
    }
    b.cyl(0.015, 0.02, 0.14, b.m.wood, [0, 0, 0], 8);
    b.sphere(0.08, b.m.green, [0, 0.18, 0], [1, 0.8, 1]);
  },
  Tower: (b) => {
    for (let k = 0; k < 5; k++) b.block(0.2, 0.1, 0.2, k % 2 ? b.m.light : b.m.main, [0, k * 0.105, 0]);
    b.cone(0.14, 0.12, b.m.dark, [0, 0.53, 0], 4).rotation.y = Math.PI / 4;
  },
  Keep: (b) => {
    b.block(0.34, 0.3, 0.34, b.m.main, [0, 0, 0]);
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0]]) b.block(0.07, 0.07, 0.07, b.m.light, [x! * 0.135, 0.3, z! * 0.135]);
  },
  Bastion: (b) => {
    b.cyl(0.2, 0.22, 0.3, b.m.main, [0, 0, 0], 32);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      b.block(0.06, 0.06, 0.06, b.m.light, [Math.cos(a) * 0.18, 0.3, Math.sin(a) * 0.18]);
    }
  },
  Pinnacle: (b) => {
    b.block(0.2, 0.12, 0.2, b.m.main, [0, 0, 0]);
    b.block(0.14, 0.12, 0.14, b.m.light, [0, 0.12, 0]);
    b.cone(0.07, 0.4, b.m.main, [0, 0.24, 0], 24);
  },
  Summit: (b) => {
    for (let k = 0; k < 3; k++) b.block(0.42 - k * 0.12, 0.1, 0.42 - k * 0.12, k % 2 ? b.m.light : b.m.main, [0, k * 0.1, 0]);
    b.sphere(0.035, b.m.warm, [0, 0.36, 0]);
    b.glow(palette.lemon, 0.45, 0.25, [0, 0.36, 0]);
  },
};

// A crystal: a smooth six-sided column with a pointed top.
function crystal(b: Builder, x: number, z: number, h: number, r: number, tilt: number, y = 0, tint?: number): void {
  const mat = tint === undefined ? b.m.main : smooth(mixColor(tint, palette.pearl, 0.2), { roughness: 0.15, transparent: true, opacity: 0.9 });
  const g = b.pivot([x, y, z]);
  g.rotation.z = tilt;
  b.cyl(r, r * 1.05, h, mat, [0, 0, 0], 6, g);
  b.cone(r, r * 1.7, mat, [0, h, 0], 6, g);
}

export function levelProp(name: string, m: PropMaterials, rand: () => number): LevelProp {
  const b = new Builder(m, rand);
  (PROPS[name] ?? PROPS.Pebble!)(b);
  return { group: b.group, glows: b.glows, movers: b.movers };
}

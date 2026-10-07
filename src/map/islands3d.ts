import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mixColor, palette } from '../design/palette';
import type { RegionId } from '../regions/types';
import { col, glowSprite, paperLantern } from '../three/kit';

// The six lands on the world map, each a small floating island carrying its land in 3D:
// a tide pool with ripples, a constellation over a hill, balanced pebbles on raked sand,
// crystals, a lake with a lantern under a crescent moon, a stepped terrace. Everything is
// turned or rounded (lathe profiles, rounded boxes, many segments, smooth shading), so no
// edge looks sharp. One unit is the island's radius. The colour follows the map (`setTint`:
// muted while the Silence holds the land, its own once it sings) and the glow stays soft.

const islandStyle = {
  segments: 56, // around a turned shape
  rimRound: 0.07, // the soft roll of the island's edge
  glowIdle: 0.05, // the halo under a land still in the Silence
  glowSung: 0.14, // and under a finished land: soft, never bright
  emissive: 0.05, // features barely light themselves; the bloom does the rest
} as const;

export interface Island {
  group: THREE.Group;
  setTint(color: number, sung: number): void;
  setOpacity(alpha: number): void;
  update(t: number): void;
}

// A smooth curve through a few points, as a lathe profile.
function profile(points: Array<[number, number]>, count = 20): THREE.Vector2[] {
  const curve = new THREE.SplineCurve(points.map(([x, y]) => new THREE.Vector2(x, y)));
  return curve.getPoints(count).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

function soft(color: number, opts: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color: col(color), roughness: 0.85, metalness: 0, transparent: true, ...opts });
}

// The island itself: a grassy top with a rounded rim over a smooth tapering root of rock.
// A small seeded random for each land, so its pebbles and grass always sit in the same places.
function seeded(id: string): () => number {
  let seed = 7;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

// Shades a turned shape from light at its top to deep at its tip (multiplying its colour).
function shadeDown(geo: THREE.BufferGeometry, top: number, bottom: number, light: number, deep: number): void {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const t = Math.max(0, Math.min(1, (top - pos.getY(i)) / (top - bottom)));
    const v = light + (deep - light) * Math.pow(t, 0.8);
    colors.set([v, v, v], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

interface IslandBase {
  group: THREE.Group;
  top: THREE.MeshStandardMaterial;
  rock: THREE.MeshStandardMaterial;
  lumps: THREE.MeshStandardMaterial;
  pebbles: THREE.MeshStandardMaterial;
  grass: THREE.MeshStandardMaterial;
  sway: Array<(t: number) => void>;
}

function islandBase(id: string): IslandBase {
  const group = new THREE.Group();
  const rand = seeded(id);
  const r = islandStyle.rimRound;
  const top = soft(palette.earth);
  const rock = soft(palette.earth, { vertexColors: true });
  const lumps = soft(palette.earth);
  const pebbles = soft(palette.earthLight, { roughness: 0.7 });
  const grass = soft(palette.sage, { roughness: 0.9 });
  const sway: Array<(t: number) => void> = [];
  const cap = new THREE.Mesh(
    new THREE.LatheGeometry(profile([[0, 0.02], [0.6, 0.022], [1 - r, 0.012], [1, -r * 0.6], [0.995, -r * 1.3]], 12).reverse(), islandStyle.segments),
    top,
  );
  const root = new THREE.Mesh(
    new THREE.LatheGeometry(
      profile([[0.995, -r * 1.2], [0.97, -0.18], [0.88, -0.36], [0.7, -0.55], [0.46, -0.7], [0.2, -0.79], [0, -0.82]]).reverse(),
      islandStyle.segments,
    ),
    rock,
  );
  shadeDown(root.geometry, 0, -0.82, 1, 0.38);
  group.add(cap, root);
  // Each kind of small piece is merged into one shape, so an island is drawn in a handful
  // of calls rather than dozens (a phone pays for every call).
  const placed = (geo: THREE.BufferGeometry, pos: [number, number, number], scale: [number, number, number], rot: [number, number, number] = [0, 0, 0]) =>
    geo.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(...pos), new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)), new THREE.Vector3(...scale)));
  // A few rounded lumps of rock beneath, so the root is never a plain bowl.
  const lumpGeos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + rand() * 0.9;
    const size = 0.16 + rand() * 0.12;
    const depth = 0.3 + rand() * 0.3;
    const reach = 0.82 - depth * 0.75;
    lumpGeos.push(placed(new THREE.SphereGeometry(size, 24, 16), [Math.cos(a) * reach, -depth, Math.sin(a) * reach], [1, 1.3, 1]));
  }
  group.add(new THREE.Mesh(mergeGeometries(lumpGeos), lumps));
  // Pebbles along the rim, and small tufts of grass that sway in the wind.
  const pebbleGeos: THREE.BufferGeometry[] = [];
  for (let k = 0; k < 7; k++) {
    const a = rand() * Math.PI * 2;
    const d = 0.8 + rand() * 0.12;
    const size = 0.03 + rand() * 0.035;
    pebbleGeos.push(placed(new THREE.SphereGeometry(size, 16, 10), [Math.cos(a) * d, 0.02 + size * 0.3, Math.sin(a) * d], [1.3, 0.6, 1]));
  }
  group.add(new THREE.Mesh(mergeGeometries(pebbleGeos), pebbles));
  for (let k = 0; k < 5; k++) {
    const a = rand() * Math.PI * 2;
    const d = 0.74 + rand() * 0.18;
    const blades: THREE.BufferGeometry[] = [];
    for (let b = 0; b < 5; b++) {
      const blade = new THREE.ConeGeometry(0.014, 1, 6);
      blade.translate(0, 0.5, 0);
      blades.push(placed(blade, [(rand() - 0.5) * 0.05, 0, (rand() - 0.5) * 0.05], [1, 0.07 + rand() * 0.08, 1], [(rand() - 0.5) * 0.6, 0, (rand() - 0.5) * 0.6]));
    }
    const tuft = new THREE.Mesh(mergeGeometries(blades), grass);
    tuft.position.set(Math.cos(a) * d, 0.02, Math.sin(a) * d);
    group.add(tuft);
    const phase = rand() * 6;
    sway.push((t) => (tuft.rotation.z = 0.12 * Math.sin(t * 1.4 + phase)));
  }
  return { group, top, rock, lumps, pebbles, grass, sway };
}

// A thin flat ring lying on the ground.
function flatRing(radius: number, width: number, material: THREE.Material): THREE.Mesh {
  const ring = new THREE.Mesh(new THREE.RingGeometry(radius - width / 2, radius + width / 2, 64), material);
  ring.rotation.x = -Math.PI / 2;
  return ring;
}

// The crescent moon: a smooth bevelled sliver.
function crescent(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const outer = { r: 0.3, a: 2.02 }; // the outer circle, from -a to a
  const inner = { cx: -0.12, r: 0.27, a: 1.613 };
  for (let k = 0; k <= 32; k++) {
    const a = -outer.a + (2 * outer.a * k) / 32;
    const x = Math.cos(a) * outer.r;
    const y = Math.sin(a) * outer.r;
    if (k === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  for (let k = 0; k <= 32; k++) {
    const a = inner.a - (2 * inner.a * k) / 32;
    shape.lineTo(inner.cx + Math.cos(a) * inner.r, Math.sin(a) * inner.r);
  }
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 6, curveSegments: 32 });
  geo.center();
  return geo;
}

export function makeIsland(id: RegionId, accent: number): Island {
  const { group, top, rock, lumps, pebbles, grass, sway } = islandBase(id);
  // Parts in the land's colour: `tone` mixes the colour with pearl (lighter) or dim (deeper).
  const tinted: Array<{ m: THREE.MeshStandardMaterial | THREE.MeshBasicMaterial; tone: number }> = [];
  const fading: Array<{ m: THREE.Material & { opacity: number }; base: number }> = [];
  const movers: Array<(t: number) => void> = [...sway];
  const part = (tone: number, opts: THREE.MeshStandardMaterialParameters = {}) => {
    const m = soft(accent, { emissiveIntensity: islandStyle.emissive, ...opts });
    tinted.push({ m, tone });
    fading.push({ m, base: opts.opacity ?? 1 });
    return m;
  };
  const neutral = (color: number, opts: THREE.MeshStandardMaterialParameters = {}) => {
    const m = soft(color, opts);
    fading.push({ m, base: opts.opacity ?? 1 });
    return m;
  };
  const sand = mixColor(palette.peach, palette.earth, 0.55);
  switch (id) {
    case 'tidepools': {
      // A shallow pool with a sandy lip and rings of water rolling slowly outward.
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.05, 20, 64), neutral(sand));
      lip.rotation.x = -Math.PI / 2;
      lip.position.y = 0.035;
      const water = new THREE.Mesh(new THREE.CircleGeometry(0.62, 64), part(0.15, { roughness: 0.25, opacity: 0.9 }));
      water.rotation.x = -Math.PI / 2;
      water.position.y = 0.03;
      group.add(lip, water);
      for (let k = 0; k < 3; k++) {
        const m = new THREE.MeshBasicMaterial({ color: col(palette.pearl), transparent: true, opacity: 0, depthWrite: false });
        const ring = flatRing(1, 0.02, m);
        ring.position.y = 0.04;
        group.add(ring);
        movers.push((t) => {
          const p = ((t / 4.5 + k / 3) % 1 + 1) % 1;
          ring.scale.setScalar(0.08 + p * 0.5);
          m.opacity = 0.35 * Math.sin(Math.PI * p) * fadeOf(group);
        });
      }
      [[0.3, 0.35], [-0.42, -0.2]].forEach(([x, z]) => {
        const pebble = new THREE.Mesh(new THREE.SphereGeometry(0.06, 24, 16), neutral(mixColor(sand, palette.pearl, 0.3)));
        pebble.scale.set(1.3, 0.55, 1);
        pebble.position.set(x!, 0.04, z!);
        group.add(pebble);
      });
      break;
    }
    case 'nightsky': {
      // A soft round hill with a small constellation hanging over it.
      const hill = new THREE.Mesh(new THREE.SphereGeometry(0.55, 40, 12, 0, Math.PI * 2, 0, Math.PI / 2), part(0.55));
      hill.scale.set(1, 0.35, 1);
      group.add(hill);
      const sky = new THREE.Group();
      const pts = [[-0.5, 0.42, 0.15], [-0.2, 0.68, -0.2], [0.16, 0.55, 0.1], [0.5, 0.75, -0.15], [0.4, 0.38, 0.4]].map(([x, y, z]) => new THREE.Vector3(x, y, z));
      const lineMat = part(-0.3, { opacity: 0.45, emissiveIntensity: 0.2 });
      for (let k = 0; k < pts.length - 1; k++) {
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.LineCurve3(pts[k]!, pts[k + 1]!), 1, 0.008, 8), lineMat);
        sky.add(tube);
      }
      pts.forEach((p, k) => {
        const star = new THREE.Mesh(new THREE.SphereGeometry(0.05, 24, 16), part(-0.6, { emissiveIntensity: 0.25 }));
        star.position.copy(p);
        const halo = glowSprite(palette.pearl, 0.4, 0.2);
        halo.position.copy(p);
        fading.push({ m: halo.material, base: 0.2 });
        sky.add(star, halo);
        movers.push((t) => halo.scale.setScalar(0.4 * (0.85 + 0.15 * Math.sin(t * 1.3 + k * 1.7))));
      });
      group.add(sky);
      movers.push((t) => (sky.position.y = 0.04 * Math.sin(t * 0.7)));
      break;
    }
    case 'stonegarden': {
      // Raked rings in the sand around three balanced pebbles.
      const rake = neutral(mixColor(sand, palette.pearl, 0.25), { opacity: 0.5 });
      [0.5, 0.62, 0.74].forEach((r) => {
        const ring = flatRing(r, 0.018, rake);
        ring.position.y = 0.025;
        group.add(ring);
      });
      [[0.34, 0.12, 0.1], [0.25, 0.1, 0.3], [0.16, 0.08, 0.46]].forEach(([r, h, y], k) => {
        const stone = new THREE.Mesh(new THREE.SphereGeometry(r!, 32, 20), part(0.25 + k * 0.1, { roughness: 0.7 }));
        stone.scale.set(1, h! / r!, 1);
        stone.position.y = y!;
        group.add(stone);
        movers.push((t) => (stone.rotation.z = 0.035 * Math.sin(t * 0.9 + k)));
      });
      break;
    }
    case 'crystalcaves': {
      // A cluster of clear crystals, each a six-sided column with a pointed top.
      [[-0.3, 0.55, 0.11, -0.15], [0.02, 0.85, 0.15, 0], [0.3, 0.6, 0.1, 0.2], [0.12, 0.4, 0.08, 0.35]].forEach(([x, h, r, tilt], k) => {
        const crystal = new THREE.Group();
        const glass = part(-0.2 - k * 0.05, { roughness: 0.15, opacity: 0.88, emissiveIntensity: 0.1 });
        const column = new THREE.Mesh(new THREE.CylinderGeometry(r!, r! * 1.05, h!, 6), glass);
        column.position.y = h! / 2;
        const tip = new THREE.Mesh(new THREE.ConeGeometry(r!, r! * 1.6, 6), glass);
        tip.position.y = h! + r! * 0.8;
        crystal.add(column, tip);
        crystal.position.set(x!, 0, (k % 2) * 0.18 - 0.08);
        crystal.rotation.z = tilt!;
        group.add(crystal);
        movers.push((t) => (glass.emissiveIntensity = 0.08 + 0.05 * Math.sin(t * 0.8 + k * 1.4)));
      });
      break;
    }
    case 'moonlake': {
      // A round lake with a paper lantern on it, under a crescent moon.
      const lip = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.045, 20, 64), neutral(mixColor(sand, palette.earth, 0.3)));
      lip.rotation.x = -Math.PI / 2;
      lip.position.y = 0.035;
      const lake = new THREE.Mesh(new THREE.CircleGeometry(0.66, 64), part(0.25, { roughness: 0.2, opacity: 0.92 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.y = 0.03;
      group.add(lip, lake);
      const lantern = paperLantern();
      lantern.group.scale.setScalar(0.6);
      lantern.group.position.set(0.12, 0.22, 0.1);
      group.add(lantern.group);
      movers.push((t) => {
        lantern.group.position.y = 0.22 + 0.025 * Math.sin(t * 1.1);
        lantern.group.rotation.z = 0.04 * Math.sin(t * 0.8);
      });
      const moon = new THREE.Mesh(crescent(), neutral(mixColor(palette.lemon, palette.pearl, 0.4), { emissive: col(palette.lemon), emissiveIntensity: 0.08 }));
      moon.scale.setScalar(0.6);
      moon.position.set(-0.4, 1.05, -0.25);
      moon.rotation.z = 0.5;
      const moonGlow = glowSprite(palette.lemon, 0.8, 0.06);
      moonGlow.position.copy(moon.position);
      fading.push({ m: moonGlow.material, base: 0.06 });
      group.add(moon, moonGlow);
      movers.push((t) => (moon.position.y = 1.05 + 0.03 * Math.sin(t * 0.6)));
      break;
    }
    case 'shadowterrace': {
      // Rounded stone blocks stepping up toward the back.
      const steps: Array<[number, number, number]> = [[-0.3, -0.3, 3], [0.06, -0.3, 2], [-0.3, 0.06, 2], [0.06, 0.06, 1], [0.42, 0.06, 1], [0.06, 0.42, 1]];
      const block = new RoundedBoxGeometry(0.33, 0.19, 0.33, 4, 0.05);
      steps.forEach(([x, z, n], k) => {
        for (let j = 0; j < n; j++) {
          const cube = new THREE.Mesh(block, part(0.35 - j * 0.12, { roughness: 0.8 }));
          cube.position.set(x, 0.115 + j * 0.2, z);
          group.add(cube);
          movers.push((t) => (cube.position.y = 0.115 + j * 0.2 + 0.008 * Math.sin(t * 1.1 + k)));
        }
      });
      break;
    }
  }
  // A soft halo of the land's colour beneath the island.
  const halo = glowSprite(accent, 3.4, islandStyle.glowIdle);
  halo.position.y = -0.3;
  group.add(halo);
  let sungAmount = 0;
  let fade = 1;
  group.userData.fade = 1;
  return {
    group,
    setTint(color, sung) {
      sungAmount = sung;
      // Light pastel tops and warm stone: a land's colour is never muddied into a dark purple.
      top.color.set(mixColor(color, palette.earthLight, 0.22));
      rock.color.set(mixColor(palette.earthLight, color, 0.12));
      lumps.color.set(mixColor(palette.earth, color, 0.1));
      pebbles.color.set(mixColor(mixColor(palette.earthLight, palette.pearl, 0.35), color, 0.15));
      grass.color.set(mixColor(palette.sage, color, 0.35));
      for (const { m, tone } of tinted) {
        const c = tone >= 0 ? mixColor(color, palette.earthLight, tone * 0.6) : mixColor(color, palette.pearl, -tone);
        m.color.set(c);
        if ('emissive' in m) (m as THREE.MeshStandardMaterial).emissive.set(color);
      }
      halo.material.color.set(color);
    },
    setOpacity(alpha) {
      fade = alpha;
      group.userData.fade = alpha;
      const solid = alpha > 0.99;
      for (const m of [top, rock, lumps, pebbles, grass]) {
        m.opacity = alpha;
        m.transparent = !solid;
        m.depthWrite = true;
      }
      for (const { m, base } of fading) m.opacity = base * alpha;
      halo.material.opacity = (islandStyle.glowIdle + (islandStyle.glowSung - islandStyle.glowIdle) * sungAmount) * fade;
    },
    update(t) {
      group.position.y = 0.05 * Math.sin(t * 0.6 + id.length);
      movers.forEach((f) => f(t));
    },
  };
}

function fadeOf(group: THREE.Group): number {
  return (group.userData.fade as number | undefined) ?? 1;
}

// A level on a land's trail: a small floating stepping stone, turned smooth like the
// islands. Locked stones are plain, open ones carry a ring of the land's colour, solved
// ones a soft wash of it.
export interface StepStone {
  group: THREE.Group;
  set(state: 'locked' | 'unlocked' | 'solved', accent: number): void;
  update(t: number): void;
}

export function makeStepStone(seed: number): StepStone {
  const group = new THREE.Group();
  const r = islandStyle.rimRound * 1.4;
  const stoneColor = mixColor(palette.earth, palette.pearl, 0.2);
  const body = new THREE.Mesh(
    new THREE.LatheGeometry(
      profile([[0, 0.02], [0.7, 0.02], [1 - r, 0.01], [1, -r], [0.96, -0.22], [0.78, -0.42], [0.45, -0.56], [0, -0.6]], 18).reverse(),
      islandStyle.segments,
    ),
    soft(stoneColor),
  );
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.72, 72), soft(palette.void, { roughness: 0.5 }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.025;
  const ringMat = soft(palette.earth, { emissiveIntensity: 0.15 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.045, 16, 64), ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.03;
  const halo = glowSprite(palette.pearl, 2.4, 0);
  halo.position.y = 0.1;
  group.add(body, face, ring, halo);
  return {
    group,
    set(state, accent) {
      // Locked: a plain stone. Open: a ring of the land's colour. Solved: a soft wash of it.
      ringMat.color.set(state === 'locked' ? mixColor(palette.earth, palette.pearl, 0.15) : accent);
      ringMat.emissive.set(state === 'locked' ? palette.void : accent);
      ringMat.emissiveIntensity = state === 'unlocked' ? 0.08 : 0.04;
      face.material.color.set(
        state === 'solved' ? mixColor(accent, palette.earth, 0.25) : state === 'unlocked' ? mixColor(accent, palette.earth, 0.72) : mixColor(palette.earth, palette.pearl, 0.08),
      );
      (body.material as THREE.MeshStandardMaterial).color.set(mixColor(stoneColor, accent, state === 'locked' ? 0.08 : 0.25));
      halo.material.color.set(accent);
      halo.material.opacity = state === 'solved' ? 0.1 : 0;
    },
    update(t) {
      group.position.y = 0.06 * Math.sin(t * 0.7 + seed * 1.7);
    },
  };
}

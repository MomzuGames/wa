import * as THREE from 'three';
import { mixColor, palette } from '../design/palette';
import type { RegionId } from '../regions/types';
import { col, glowSprite, paperLantern } from '../three/kit';

// The six lands on the world map, each a small floating island carrying its land in 3D:
// a pool with rings of water, stars hanging over a dark rock, balanced stones, crystals, a
// lake with a lantern under a crescent, a stepped terrace. One unit is the island's radius.
// Their colour follows the map: grey while the Silence holds a land, its own colour once
// it sings again (`setTint`); they fade with the map (`setOpacity`), and breathe gently.

export interface Island {
  group: THREE.Group;
  setTint(color: number): void;
  setOpacity(alpha: number): void;
  update(t: number): void;
}

function islandBase(): { group: THREE.Group; mats: THREE.Material[] } {
  const group = new THREE.Group();
  const rock = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.pearl, 0.12)), flatShading: true, transparent: true });
  const top = new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.sage, 0.3)), flatShading: true, transparent: true });
  // A rough cone of rock hanging below a flat top.
  const under = new THREE.Mesh(new THREE.ConeGeometry(1, 1.3, 9, 1), rock);
  under.rotation.x = Math.PI;
  under.position.y = -0.75;
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.98, 0.22, 9), top);
  cap.position.y = -0.11;
  group.add(under, cap);
  return { group, mats: [rock, top] };
}

export function makeIsland(id: RegionId): Island {
  const { group, mats } = islandBase();
  const tinted: Array<THREE.MeshStandardMaterial | THREE.MeshBasicMaterial> = [];
  const glows: THREE.Sprite[] = [];
  const movers: Array<(t: number) => void> = [];
  const std = (opts: THREE.MeshStandardMaterialParameters = {}) => {
    const m = new THREE.MeshStandardMaterial({ roughness: 0.55, flatShading: true, transparent: true, ...opts });
    tinted.push(m);
    return m;
  };
  switch (id) {
    case 'tidepools': {
      const pool = new THREE.Mesh(new THREE.CircleGeometry(0.72, 28), std({ emissiveIntensity: 0.25 }));
      pool.rotation.x = -Math.PI / 2;
      pool.position.y = 0.01;
      group.add(pool);
      [0.25, 0.48].forEach((r, k) => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 8, 32), std({ emissiveIntensity: 0.4 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.04;
        group.add(ring);
        movers.push((t) => ring.scale.setScalar(1 + 0.08 * Math.sin(t * 1.6 - k * 1.1)));
      });
      break;
    }
    case 'nightsky': {
      const pts = [[-0.6, 0.9, 0.2], [-0.2, 1.3, -0.3], [0.2, 1.05, 0.1], [0.6, 1.4, -0.2], [0.45, 0.8, 0.45]];
      const stars = pts.map(([x, y, z], k) => {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ transparent: true }));
        tinted.push(s.material);
        s.position.set(x!, y!, z!);
        group.add(s);
        const g = glowSprite(palette.pearl, 0.6, 0.35);
        g.position.copy(s.position);
        glows.push(g);
        group.add(g);
        movers.push((t) => s.position.setY(y! + 0.05 * Math.sin(t * 0.9 + k * 1.3)));
        return s;
      });
      const line = new THREE.LineBasicMaterial({ transparent: true, opacity: 0.6 });
      tinted.push(line as unknown as THREE.MeshBasicMaterial);
      const seg = new THREE.Line(new THREE.BufferGeometry().setFromPoints(stars.map((s) => s.position)), line);
      group.add(seg);
      movers.push(() => seg.geometry.setFromPoints(stars.map((s) => s.position)));
      break;
    }
    case 'stonegarden': {
      [[0.5, 0.18, 0.12], [0.36, 0.15, 0.4], [0.24, 0.12, 0.64]].forEach(([r, h, y], k) => {
        const stone = new THREE.Mesh(new THREE.SphereGeometry(r!, 14, 10), std());
        stone.scale.set(1, h! / r!, 1);
        stone.position.y = y!;
        group.add(stone);
        movers.push((t) => (stone.rotation.z = 0.05 * Math.sin(t * 1.1 + k)));
      });
      break;
    }
    case 'crystalcaves': {
      [[-0.35, 0.7, 0.18], [0.05, 1.15, 0.24], [0.4, 0.8, 0.17]].forEach(([x, h, r], k) => {
        const c = new THREE.Mesh(new THREE.OctahedronGeometry(r!, 0), std({ emissiveIntensity: 0.3, roughness: 0.2 }));
        c.scale.set(1, h! / r! / 2, 1);
        c.position.set(x!, h! / 2, (k - 1) * 0.15);
        group.add(c);
        movers.push((t) => (c.rotation.y = t * 0.3 + k));
      });
      break;
    }
    case 'moonlake': {
      const lake = new THREE.Mesh(new THREE.CircleGeometry(0.75, 28), std({ emissiveIntensity: 0.2 }));
      lake.rotation.x = -Math.PI / 2;
      lake.position.y = 0.01;
      group.add(lake);
      const lantern = paperLantern();
      lantern.group.scale.setScalar(0.7);
      lantern.group.position.set(0.1, 0.3, 0.1);
      group.add(lantern.group);
      movers.push((t) => lantern.group.position.setY(0.3 + 0.03 * Math.sin(t * 1.2)));
      const moon = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.07, 10, 28, Math.PI * 1.25), new THREE.MeshBasicMaterial({ transparent: true }));
      tinted.push(moon.material);
      moon.position.set(-0.3, 1.35, -0.2);
      moon.rotation.z = 0.9;
      group.add(moon);
      movers.push((t) => (moon.rotation.z = 0.9 + 0.08 * Math.sin(t * 0.6)));
      break;
    }
    case 'shadowterrace': {
      const steps: Array<[number, number, number]> = [[-0.35, -0.35, 3], [0.05, -0.35, 2], [-0.35, 0.05, 2], [0.05, 0.05, 1], [0.45, 0.05, 1], [0.05, 0.45, 1]];
      steps.forEach(([x, z, n], k) => {
        for (let j = 0; j < n; j++) {
          const cube = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.36), std());
          cube.position.set(x, 0.1 + j * 0.21, z);
          group.add(cube);
          movers.push((t) => cube.position.setY(0.1 + j * 0.21 + 0.015 * Math.sin(t * 1.3 + k)));
        }
      });
      break;
    }
  }
  return {
    group,
    setTint(color) {
      for (const m of tinted) {
        (m as THREE.MeshBasicMaterial).color.set(color);
        if ('emissive' in m) (m as THREE.MeshStandardMaterial).emissive.set(color);
      }
      glows.forEach((g) => g.material.color.set(color));
    },
    setOpacity(alpha) {
      for (const m of [...mats, ...tinted]) (m as THREE.Material).opacity = alpha;
      glows.forEach((g) => (g.material.opacity = 0.35 * alpha));
    },
    update(t) {
      group.position.y = 0.06 * Math.sin(t * 0.8 + id.length);
      movers.forEach((f) => f(t));
    },
  };
}

// A level on a land's trail: a small floating stepping stone. Locked stones are dark,
// open ones carry a ring of the land's colour, solved ones glow with it.
export interface StepStone {
  group: THREE.Group;
  set(state: 'locked' | 'unlocked' | 'solved', accent: number): void;
  update(t: number): void;
}

export function makeStepStone(seed: number): StepStone {
  const group = new THREE.Group();
  const rock = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.8, 0.45, 10), new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.pearl, 0.12)), flatShading: true }));
  rock.position.y = -0.22;
  const under = new THREE.Mesh(new THREE.ConeGeometry(0.8, 0.7, 10), new THREE.MeshLambertMaterial({ color: col(mixColor(palette.dim, palette.ink, 0.3)), flatShading: true }));
  under.rotation.x = Math.PI;
  under.position.y = -0.8;
  const face = new THREE.Mesh(new THREE.CircleGeometry(0.78, 24), new THREE.MeshBasicMaterial({ color: col(palette.void) }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.005;
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.06, 8, 32), new THREE.MeshBasicMaterial({ color: col(palette.dim) }));
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.02;
  const halo = glowSprite(palette.pearl, 2.6, 0);
  halo.position.y = 0.3;
  group.add(under, rock, face, ring, halo);
  return {
    group,
    set(state, accent) {
      ring.material.color.set(state === 'locked' ? palette.dim : accent);
      face.material.color.set(state === 'solved' ? mixColor(accent, palette.void, 0.2) : palette.void);
      halo.material.color.set(accent);
      halo.material.opacity = state === 'solved' ? 0.4 : 0;
    },
    update(t) {
      group.position.y = 0.08 * Math.sin(t * 0.9 + seed * 1.7);
    },
  };
}

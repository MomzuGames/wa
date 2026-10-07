import * as THREE from 'three';
import type { LanternLevel } from '../regions/moonlake/model';
import { LakeWorld } from './world3d';
import { flatLake } from './flatLake';

// Style sample B: a real 3D world behind the same flat puzzle. The camera looks out across a
// moonlit lake toward misty hills; the puzzle's water lets that world show through.
export class SampleB {
  private canvas = document.createElement('canvas');
  private world: LakeWorld;
  private raf = 0;
  private last = performance.now();
  private destroyFlat: () => void = () => {};
  private alive = true;

  constructor(
    private host: HTMLElement,
    level: LanternLevel,
    onSolved: () => void,
  ) {
    this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    host.appendChild(this.canvas);
    this.world = new LakeWorld(this.canvas, { cameraHeight: 2.4, cameraDistance: 12, lookAt: new THREE.Vector3(0, 3, -40), fov: 55 });
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.raf = requestAnimationFrame(this.frame);
    void flatLake(host, level, true, onSolved).then(({ scene, destroy }) => {
      if (!this.alive) return destroy();
      // Let the 3D lake show through the puzzle's water.
      (scene as unknown as { water: { alpha: number } }).water.alpha = 0.5;
      this.destroyFlat = destroy;
    });
  }

  private onResize = () => this.world.resize(this.host.clientWidth, this.host.clientHeight);

  private frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.world.update(dt);
    this.raf = requestAnimationFrame(this.frame);
  };

  destroy(): void {
    this.alive = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.destroyFlat();
    this.world.dispose();
    this.canvas.remove();
  }
}

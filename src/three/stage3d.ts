import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { palette } from '../design/palette';

// The 3D layer: one Three.js canvas under the game's 2D canvas (which draws the words,
// buttons and cards on top, with a clear background). A 3D screen (a puzzle diorama, the
// world map) hands it a scene and a camera; it fades in, renders each frame of the game's
// own ticker with a soft bloom, and fades out again when a 2D screen takes over.

export interface World3D {
  scene: THREE.Scene;
  camera: THREE.Camera;
  bloom?: () => number; // bloom strength right now
}

const stageStyle = {
  fadeSeconds: 0.8,
  bloom: { strength: 0.3, radius: 0.55, threshold: 0.8 },
  pixelRatio: 1.5, // sharp enough on a phone, and far lighter than its full 3x
  samples: 4, // smooth edges (the composer's targets need their own antialiasing)
} as const;

export class Stage3D {
  readonly canvas = document.createElement('canvas');
  readonly renderer: THREE.WebGLRenderer;
  private composer: EffectComposer;
  private pass: RenderPass;
  private bloom: UnrealBloomPass;
  private current: World3D | null = null;
  private empty = new THREE.Scene();
  private emptyCamera = new THREE.PerspectiveCamera();
  private width = 1;
  private height = 1;
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  // Told when a 3D screen starts or ends, so the 2D vignette and dust can step aside.
  onActive: (active: boolean) => void = () => {};

  constructor(mount: HTMLElement) {
    this.canvas.style.cssText = `position:fixed;inset:0;width:100%;height:100%;display:block;z-index:0;opacity:0;transition:opacity ${stageStyle.fadeSeconds}s ease;pointer-events:none`;
    mount.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(stageStyle.pixelRatio, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.setClearColor(palette.void, 1);
    this.composer = new EffectComposer(this.renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: stageStyle.samples }));
    this.pass = new RenderPass(this.empty, this.emptyCamera);
    this.composer.addPass(this.pass);
    const b = stageStyle.bloom;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), b.strength, b.radius, b.threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize(window.innerWidth, window.innerHeight);
  }

  get size(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  // A 3D screen begins: the layer fades in under the game.
  show(world: World3D): void {
    if (this.hideTimer) clearTimeout(this.hideTimer);
    this.hideTimer = null;
    this.current = world;
    this.pass.scene = world.scene;
    this.pass.camera = world.camera;
    this.canvas.style.opacity = '1';
    this.onActive(true);
  }

  // It ends (only if it is still the one showing): the layer fades out, then rests.
  hide(world: World3D): void {
    if (this.current !== world) return;
    this.canvas.style.opacity = '0';
    this.onActive(false);
    this.hideTimer = setTimeout(() => {
      if (this.current !== world) return;
      this.current = null;
      this.pass.scene = this.empty;
      this.pass.camera = this.emptyCamera;
    }, stageStyle.fadeSeconds * 1000);
  }

  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    // The bloom is a soft blur: it can work at a quarter of the size.
    const pr = this.renderer.getPixelRatio();
    this.bloom.setSize((width * pr) / 2, (height * pr) / 2);
  }

  render(dt: number): void {
    if (!this.current) return;
    this.bloom.strength = this.current.bloom?.() ?? stageStyle.bloom.strength;
    this.composer.render(dt);
  }
}

let stage: Stage3D | null = null;

export function setStage3D(s: Stage3D): void {
  stage = s;
}

export function stage3d(): Stage3D | null {
  return stage;
}

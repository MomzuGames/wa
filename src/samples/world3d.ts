import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mixColor, palette } from '../design/palette';

// Style sample: a moonlit lake in real 3D, drawn entirely in code. A gradient sky with stars
// and a glowing moon, three ridges of hills fading into mist, a wide lake with ripples and
// the moon's path shimmering on it, fireflies drifting over the water, and a soft bloom so
// everything bright glows. Used behind the flat puzzle (sample B) and around the 3D one (C).

export interface WorldOptions {
  cameraHeight: number;
  cameraDistance: number;
  lookAt: THREE.Vector3;
  fov: number;
}

const col = (hex: number) => new THREE.Color(hex);

// A soft round glow, white, for sprites.
export function glowTexture(): THREE.Texture {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.65)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class LakeWorld {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private water: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private fireflies: THREE.Points;
  private fireflyBase: Float32Array;
  private time = 0;
  private sway = 0;
  readonly glow = glowTexture();
  private base: THREE.Vector3;

  constructor(
    readonly canvas: HTMLCanvasElement,
    private opts: WorldOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(opts.fov, 1, 0.1, 600);
    this.base = new THREE.Vector3(0, opts.cameraHeight, opts.cameraDistance);
    this.camera.position.copy(this.base);
    this.camera.lookAt(opts.lookAt);

    const night = mixColor(palette.void, palette.lavender, 0.08);
    this.scene.background = col(night);
    this.scene.fog = new THREE.Fog(col(mixColor(palette.void, palette.lavender, 0.16)), 30, 170);

    this.sky();
    this.moon();
    this.hills();
    this.water = this.lake();
    const ff = this.makeFireflies();
    this.fireflies = ff.points;
    this.fireflyBase = ff.base;

    // Moonlight and a soft sky fill for anything solid placed in the world.
    this.scene.add(new THREE.HemisphereLight(col(mixColor(palette.lavender, palette.pearl, 0.4)), col(palette.ink), 0.55));
    const moonlight = new THREE.DirectionalLight(col(palette.pearl), 0.9);
    moonlight.position.set(-20, 40, -60);
    this.scene.add(moonlight);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.85, 0.7, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
  }

  // A dome: deep night overhead, a faint lavender-rose glow toward the horizon, and stars.
  private sky(): void {
    const geo = new THREE.SphereGeometry(400, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: col(mixColor(palette.void, palette.sky, 0.04)) },
        horizon: { value: col(mixColor(mixColor(palette.void, palette.lavender, 0.32), palette.rose, 0.12)) },
      },
      vertexShader: 'varying vec3 vPos; void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 horizon; varying vec3 vPos; void main(){ float h = normalize(vPos).y; float k = smoothstep(-0.05, 0.45, h); gl_FragColor = vec4(mix(horizon, top, k), 1.0); }',
    });
    this.scene.add(new THREE.Mesh(geo, mat));
    const n = 700;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const y = 0.08 + Math.random() * 0.9;
      const r = Math.sqrt(1 - y * y);
      pos.set([Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380], i * 3);
    }
    const stars = new THREE.BufferGeometry();
    stars.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.scene.add(new THREE.Points(stars, new THREE.PointsMaterial({ color: col(palette.pearl), size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.75, fog: false })));
  }

  private moon(): void {
    const disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: col(palette.pearl), fog: false, depthWrite: false }));
    disc.scale.set(26, 26, 1);
    disc.position.set(-30, 62, -300);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glow, color: col(palette.lavender), fog: false, depthWrite: false, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending }));
    halo.scale.set(120, 120, 1);
    halo.position.copy(disc.position);
    this.scene.add(halo, disc);
  }

  // Three ridges of soft hills, each paler and further into the mist.
  private hills(): void {
    for (let k = 0; k < 3; k++) {
      const pts: THREE.Vector2[] = [];
      const seed = k * 11.3;
      for (let x = -260; x <= 260; x += 8) {
        const y = 10 + k * 6 + Math.sin(x * 0.018 + seed) * (8 + k * 3) + Math.sin(x * 0.051 + seed * 2) * 4 + Math.sin(x * 0.11 + seed) * 1.5;
        pts.push(new THREE.Vector2(x, y));
      }
      const shape = new THREE.Shape();
      shape.moveTo(-260, -2);
      pts.forEach((p) => shape.lineTo(p.x, p.y));
      shape.lineTo(260, -2);
      shape.closePath();
      const color = mixColor(mixColor(palette.void, palette.lavender, 0.1 + k * 0.07), palette.sage, 0.05);
      const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), new THREE.MeshBasicMaterial({ color: col(color) }));
      mesh.position.set(0, -1, -110 - k * 45);
      this.scene.add(mesh);
    }
  }

  // The lake: deep, softly rippling, brighter toward the horizon, with the moon's path on it.
  private lake(): THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial> {
    const fogColor = (this.scene.fog as THREE.Fog).color;
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        deep: { value: col(mixColor(palette.void, palette.sky, 0.07)) },
        sheen: { value: col(mixColor(palette.lavender, palette.sky, 0.5)) },
        moonCol: { value: col(palette.pearl) },
        fogColor: { value: fogColor },
        camPos: { value: this.camera.position },
      },
      vertexShader:
        'varying vec3 vWorld; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: `
        uniform float time; uniform vec3 deep; uniform vec3 sheen; uniform vec3 moonCol; uniform vec3 fogColor; uniform vec3 camPos;
        varying vec3 vWorld;
        float wave(vec2 p){ return sin(p.x*0.9+time*0.8)*0.5 + sin(p.y*1.3-time*0.6+p.x*0.4)*0.35 + sin((p.x+p.y)*2.7+time*1.7)*0.15; }
        void main(){
          vec2 p = vWorld.xz;
          float w = wave(p*0.6);
          float dist = length(vWorld - camPos);
          float far = smoothstep(8.0, 140.0, dist);
          vec3 c = mix(deep, sheen*0.28, far*0.9);
          // ripples catching the light
          c += sheen * 0.05 * smoothstep(0.55, 0.95, w);
          // the moon's path: a shimmering band toward the moon
          float band = exp(-pow((vWorld.x + 30.0 + vWorld.z*0.1) * 0.12, 2.0));
          float glint = smoothstep(0.62, 0.98, wave(p*1.7 + vec2(time*0.3, 0.0)));
          c += moonCol * band * (0.05 + 0.6*glint) * smoothstep(-200.0, -10.0, vWorld.z) * (1.0 - smoothstep(-260.0, -150.0, vWorld.z) * 0.0);
          float fogK = smoothstep(30.0, 170.0, dist);
          gl_FragColor = vec4(mix(c, fogColor, fogK), 1.0);
        }`,
    });
    const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 1, 1), mat);
    water.rotation.x = -Math.PI / 2;
    this.scene.add(water);
    return water;
  }

  private makeFireflies(): { points: THREE.Points; base: Float32Array } {
    const n = 70;
    const base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) base.set([(Math.random() - 0.5) * 60, 0.6 + Math.random() * 5, -Math.random() * 60 + 4], i * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(base.slice(), 3));
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: this.glow, color: col(palette.lemon), size: 0.55, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(points);
    return { points, base };
  }

  // Where the camera rests and what it looks at (it still breathes around that).
  setView(position: THREE.Vector3, lookAt: THREE.Vector3): void {
    this.base.copy(position);
    this.opts.lookAt.copy(lookAt);
  }

  // A gentle lean toward the finger (or tilt), like the 2D map's parallax.
  setSway(x: number): void {
    this.sway = x;
  }

  resize(width: number, height: number): void {
    this.renderer.setSize(width, height, false);
    this.composer.setSize(width, height);
    this.bloom.resolution.set(width / 2, height / 2);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  update(dt: number): void {
    this.time += dt;
    this.water.material.uniforms.time!.value = this.time;
    const pos = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = this.time * 0.4 + i * 1.7;
      pos.setXYZ(i, this.fireflyBase[i * 3]! + Math.sin(t) * 1.2, this.fireflyBase[i * 3 + 1]! + Math.sin(t * 1.3) * 0.5, this.fireflyBase[i * 3 + 2]! + Math.cos(t * 0.8) * 1.2);
    }
    pos.needsUpdate = true;
    (this.fireflies.material as THREE.PointsMaterial).opacity = 0.65 + 0.3 * Math.sin(this.time * 2.1);
    // The camera breathes and leans a little: the world is never still.
    this.camera.position.set(this.base.x + Math.sin(this.time * 0.13) * 0.6 + this.sway * 1.5, this.base.y + Math.sin(this.time * 0.21) * 0.25, this.base.z);
    this.camera.lookAt(this.opts.lookAt);
    this.composer.render(dt);
  }

  setBloom(strength: number): void {
    this.bloom.strength = strength;
  }

  dispose(): void {
    this.renderer.dispose();
    this.composer.dispose();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose();
      const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : [];
      mats.forEach((x) => x.dispose());
    });
  }
}

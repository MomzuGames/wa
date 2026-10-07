import * as THREE from 'three';
import { mixColor, palette } from '../design/palette';
import type { RegionId } from '../regions/types';

// A serene pastel backdrop behind the 3D puzzle, set by the land and the level: a soft
// gradient sky, slow pastel clouds, the moon, misty hills on the horizon, and fireflies
// drifting around the board. It slides a little as the board turns, so the world feels
// round. Drawn as one full-screen picture (a shader) plus a few soft sprites.

export interface BackdropMood {
  top: number; // the sky overhead
  horizon: number; // the glow at the horizon
  clouds: number; // cloud colour
  cloudAmount: number; // 0..1
  moonSize: number; // of the screen height; 0 for none
  moonWarm: number; // 0 pearl .. 1 a warm harvest moon
  crescent: number; // 0 full .. 1 thin crescent
  mist: number; // 0..1, the haze over the hills
  fireflies: number; // how many drift around the board
  hills: [number, number]; // far and near hill colours
  glimmer?: number; // the drifting glows' colour (fireflies by default)
}

// Moon Lake: each level its own night, calm and pastel, and never all one hue: a cool sky
// overhead, a warmer glow low down, green-grey hills.
const sky = (k: number) => mixColor(palette.void, palette.sky, k);
const low = (c: number, k = 0.5) => mixColor(c, palette.void, k);
const hillsOf = (tint: number): [number, number] => [mixColor(sky(0.2), tint, 0.18), mixColor(palette.void, palette.sage, 0.16)];
const mood = (m: Partial<BackdropMood> & Pick<BackdropMood, 'top' | 'horizon'>): BackdropMood => ({
  clouds: mixColor(palette.pearl, palette.peach, 0.2),
  cloudAmount: 0.4,
  moonSize: 0.032,
  moonWarm: 0.1,
  crescent: 0,
  mist: 0.45,
  fireflies: 25,
  hills: hillsOf(palette.sage),
  ...m,
});

export const MOON_LAKE: Record<string, BackdropMood> = {
  Reed: mood({ top: mixColor(palette.void, palette.sage, 0.16), horizon: low(palette.peach, 0.52), cloudAmount: 0.3, moonSize: 0.026, fireflies: 20 }),
  Lotus: mood({ top: sky(0.16), horizon: low(palette.rose, 0.5), clouds: mixColor(palette.pearl, palette.rose, 0.25), hills: hillsOf(palette.rose), fireflies: 30 }),
  Heron: mood({ top: sky(0.24), horizon: low(mixColor(palette.sky, palette.pearl, 0.3), 0.55), clouds: palette.pearl, moonSize: 0.034, mist: 0.35, fireflies: 12, hills: hillsOf(palette.sky) }),
  Mist: mood({ top: sky(0.15), horizon: low(palette.pearl, 0.55), clouds: palette.pearl, cloudAmount: 0.7, moonSize: 0.026, crescent: 0.2, mist: 1, fireflies: 12 }),
  // A soft blue night with a warm peach glow low in the sky, sage hills and pale clouds.
  Firefly: mood({ top: sky(0.2), horizon: low(mixColor(palette.peach, palette.rose, 0.25), 0.5), cloudAmount: 0.45, moonWarm: 0.15, fireflies: 60, hills: hillsOf(palette.sage) }),
  Reflection: mood({ top: mixColor(palette.void, palette.mint, 0.14), horizon: low(palette.mint, 0.56), clouds: mixColor(palette.pearl, palette.mint, 0.2), moonSize: 0.04, mist: 0.3, fireflies: 20, hills: hillsOf(palette.mint) }),
  Crescent: mood({ top: sky(0.18), horizon: low(palette.sky, 0.5), clouds: mixColor(palette.sky, palette.pearl, 0.4), moonSize: 0.045, moonWarm: 0, crescent: 0.75, fireflies: 20, hills: hillsOf(palette.sky) }),
  'Harvest Moon': mood({ top: mixColor(palette.void, palette.peach, 0.1), horizon: low(palette.peach, 0.45), clouds: mixColor(palette.peach, palette.pearl, 0.3), cloudAmount: 0.35, moonSize: 0.07, moonWarm: 1, mist: 0.4, hills: hillsOf(palette.peach) }),
  Stillness: mood({ top: sky(0.12), horizon: low(palette.pearl, 0.6), cloudAmount: 0.15, mist: 0.6, fireflies: 10 }),
  'Full Moon': mood({ top: sky(0.2), horizon: low(mixColor(palette.pearl, palette.sky, 0.4), 0.5), clouds: palette.pearl, moonSize: 0.06, moonWarm: 0.05, mist: 0.4, fireflies: 40, hills: hillsOf(palette.sky) }),
};

// The other lands: each its own pastel night, varied a little level by level (the moon
// grows through a land's levels, clouds come and go, a few more glimmers each time).
const LAND: Record<Exclude<RegionId, 'moonlake'>, BackdropMood> = {
  // Tidepools: a sea-green night over the shore, a peach glow where the sun went down.
  tidepools: mood({ top: mixColor(palette.void, palette.mint, 0.15), horizon: low(palette.peach, 0.5), clouds: mixColor(palette.pearl, palette.mint, 0.2), hills: hillsOf(palette.mint), glimmer: palette.mint }),
  // Night Sky: the clearest night, cool blue, many stars, a pale crescent.
  nightsky: mood({ top: sky(0.14), horizon: low(mixColor(palette.sky, palette.lavender, 0.3), 0.55), clouds: palette.pearl, cloudAmount: 0.2, crescent: 0.6, moonSize: 0.03, hills: hillsOf(palette.sky), glimmer: palette.pearl }),
  // Stone Garden: a warm dusk, sand-coloured light, sage hills.
  stonegarden: mood({ top: mixColor(palette.void, palette.peach, 0.1), horizon: low(palette.peach, 0.42), clouds: mixColor(palette.peach, palette.pearl, 0.4), hills: hillsOf(palette.sage), glimmer: palette.peach }),
  // Crystal Caves: a cool, glassy night; glimmers like crystal dust.
  crystalcaves: mood({ top: sky(0.12), horizon: low(palette.mint, 0.55), clouds: mixColor(palette.pearl, palette.sky, 0.3), cloudAmount: 0.25, hills: hillsOf(palette.sky), glimmer: palette.sky }),
  // Shadow Terrace: a sage twilight with a rose glow low down.
  shadowterrace: mood({ top: mixColor(palette.void, palette.sage, 0.14), horizon: low(palette.rose, 0.55), clouds: mixColor(palette.pearl, palette.rose, 0.2), hills: hillsOf(palette.sage), glimmer: palette.sage }),
};

export function moodFor(region: RegionId, levelIndex: number, levelName: string): BackdropMood {
  if (region === 'moonlake') return MOON_LAKE[levelName] ?? MOON_LAKE.Firefly!;
  const base = LAND[region];
  const t = levelIndex / 9;
  return { ...base, moonSize: base.moonSize * (0.8 + t * 0.7), cloudAmount: base.cloudAmount * (0.6 + 0.8 * ((levelIndex * 0.37) % 1)), fireflies: Math.round(base.fireflies * (0.7 + t)) };
}

const vec3 = (hex: number) => new THREE.Color(hex);

export class Backdrop {
  readonly sky: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly fireflies: THREE.Points;
  private base: Float32Array;
  private time = 0;

  constructor(
    scene: THREE.Scene,
    glow: THREE.Texture,
    mood: BackdropMood,
  ) {
    this.sky = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        depthTest: false,
        depthWrite: false,
        uniforms: {
          time: { value: 0 },
          pan: { value: 0 },
          aspect: { value: 0.5 },
          top: { value: vec3(mood.top) },
          horizon: { value: vec3(mood.horizon) },
          cloudCol: { value: vec3(mood.clouds) },
          cloudAmount: { value: mood.cloudAmount },
          moonSize: { value: mood.moonSize },
          moonCol: { value: vec3(mixColor(palette.pearl, palette.peach, mood.moonWarm)) },
          crescent: { value: mood.crescent },
          mist: { value: mood.mist },
          hillFar: { value: vec3(mood.hills[0]) },
          hillNear: { value: vec3(mood.hills[1]) },
        },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
        fragmentShader: `
          uniform float time; uniform float pan; uniform float aspect;
          uniform vec3 top; uniform vec3 horizon; uniform vec3 cloudCol; uniform float cloudAmount;
          uniform float moonSize; uniform vec3 moonCol; uniform float crescent; uniform float mist;
          uniform vec3 hillFar; uniform vec3 hillNear;
          varying vec2 vUv;
          float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          float noise(vec2 p){ vec2 i = floor(p); vec2 f = fract(p); vec2 u = f*f*(3.0-2.0*f);
            return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
          float fbm(vec2 p){ float v = 0.0; float a = 0.5; for (int i = 0; i < 5; i++){ v += a*noise(p); p *= 2.03; a *= 0.5; } return v; }
          void main(){
            vec2 uv = vUv;
            // The sky: the horizon glow fading up into the night.
            vec3 c = mix(horizon, top, smoothstep(0.12, 0.95, uv.y));
            // Stars: soft round dots, faint, only high up.
            vec2 sp = vec2(uv.x * aspect + pan * 0.05, uv.y) * 46.0;
            vec2 cell = floor(sp);
            float has = step(0.93, hash(cell));
            vec2 at = vec2(hash(cell + 3.1), hash(cell + 7.7)) * 0.6 + 0.2;
            float dotGlow = smoothstep(0.16, 0.0, length(fract(sp) - at));
            float twinkle = 0.6 + 0.4 * sin(time * 1.3 + hash(cell) * 40.0);
            c += vec3(1.0) * has * dotGlow * twinkle * 0.35 * smoothstep(0.45, 0.9, uv.y);
            // The moon, high on one side, with a soft halo.
            vec2 mp = vec2(0.72 - pan * 0.03, 0.8);
            vec2 d = (uv - mp) * vec2(aspect, 1.0);
            float r = length(d);
            float disc = smoothstep(moonSize, moonSize * 0.93, r);
            float bite = smoothstep(moonSize, moonSize * 0.93, length(d - vec2(moonSize * 0.55 * crescent * 1.6, moonSize * 0.15 * crescent)));
            disc *= 1.0 - bite * step(0.01, crescent);
            c += moonCol * exp(-r / (moonSize * 2.5)) * 0.16 * step(0.001, moonSize);
            c = mix(c, moonCol * 0.82, disc * 0.9);
            // Slow pastel clouds drifting across the middle of the sky.
            vec2 cp = vec2(uv.x * aspect * 1.6 + time * 0.012 + pan * 0.08, uv.y * 4.0);
            float cl = smoothstep(0.52, 0.78, fbm(cp)) * smoothstep(0.35, 0.6, uv.y) * smoothstep(0.98, 0.7, uv.y);
            c = mix(c, cloudCol, cl * cloudAmount * 0.6);
            // Hills: a far ridge and a near one, sliding as the board turns.
            float x = uv.x * aspect;
            float far = 0.2 + 0.04 * sin(x * 3.1 + pan * 0.15 + 1.0) + 0.025 * sin(x * 7.3 + pan * 0.15);
            float near = 0.13 + 0.035 * sin(x * 2.3 + pan * 0.3 + 4.0) + 0.02 * sin(x * 5.9 + pan * 0.3 + 2.0);
            c = mix(c, hillFar, smoothstep(far + 0.004, far - 0.004, uv.y) * 0.85);
            c = mix(c, hillNear, smoothstep(near + 0.004, near - 0.004, uv.y));
            // Mist lying over the hills.
            float m = exp(-pow((uv.y - 0.17) / 0.07, 2.0)) * (0.6 + 0.4 * fbm(vec2(x * 2.0 + time * 0.02, uv.y * 8.0)));
            c = mix(c, horizon * 1.2, m * mist * 0.5);
            // A fine grain, too faint to see, so the gradients never band.
            c += (hash(gl_FragCoord.xy) - 0.5) / 255.0;
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    // Fireflies drifting around the board, some in front, some behind.
    const n = mood.fireflies;
    this.base = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 3.2 + Math.random() * 4.5;
      this.base.set([Math.cos(a) * r, -1.2 + Math.random() * 3.6, Math.sin(a) * r], i * 3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.base.slice(), 3));
    this.fireflies = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ map: glow, color: vec3(mood.glimmer ?? mixColor(palette.lemon, palette.mint, 0.3)), size: 0.32, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    scene.add(this.fireflies);
  }

  resize(width: number, height: number): void {
    this.sky.material.uniforms.aspect!.value = width / height;
  }

  update(dt: number, yaw: number): void {
    this.time += dt;
    const u = this.sky.material.uniforms;
    u.time!.value = this.time;
    u.pan!.value = yaw;
    const pos = this.fireflies.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const t = this.time * 0.35 + i * 1.9;
      pos.setXYZ(i, this.base[i * 3]! + Math.sin(t) * 0.5, this.base[i * 3 + 1]! + Math.sin(t * 1.3) * 0.35, this.base[i * 3 + 2]! + Math.cos(t * 0.8) * 0.5);
    }
    pos.needsUpdate = true;
    (this.fireflies.material as THREE.PointsMaterial).opacity = 0.55 + 0.25 * Math.sin(this.time * 1.7);
  }
}

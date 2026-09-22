import { Filter, GlProgram } from 'pixi.js';

// Caustics: the net of moving light the sun casts on the floor of a shallow pool.
// Drawn as two layers of Worley-ish cellular noise drifting against each other, so the
// pattern never repeats visibly, over a slow surface shimmer.

const vertex = `
in vec2 aPosition;
out vec2 vTextureCoord;

uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;

vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}

vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}

void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}
`;

const fragment = `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform vec2 uSize;      // the area the caustics cover, in pixels
uniform float uTime;
uniform float uStrength; // overall brightness of the light net
uniform vec3 uTint;      // the region's accent colour
uniform float uDepth;    // 0 at the surface, 1 deep: the net widens and softens
uniform float uHorizon;  // 0..1 of the height: no light above this, full below

// Cheap value noise: enough for water, far cheaper than true Worley cells.
vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = dot(hash2(i + vec2(0.0, 0.0)) - 0.5, f - vec2(0.0, 0.0));
  float b = dot(hash2(i + vec2(1.0, 0.0)) - 0.5, f - vec2(1.0, 0.0));
  float c = dot(hash2(i + vec2(0.0, 1.0)) - 0.5, f - vec2(0.0, 1.0));
  float d = dot(hash2(i + vec2(1.0, 1.0)) - 0.5, f - vec2(1.0, 1.0));
  return 0.5 + mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// One layer of the light net: ridged noise, so the bright lines are thin and the
// spaces between them wide, the way caustics actually look.
float causticLayer(vec2 p, float t) {
  float n = noise(p + vec2(t * 0.11, -t * 0.07));
  float m = noise(p * 1.9 + vec2(-t * 0.09, t * 0.13) + 7.3);
  float ridge = 1.0 - abs(n - m) * 3.0;
  // A high power leaves only the crests: thin bright lines with dark water between.
  return pow(max(ridge, 0.0), 9.0);
}

void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  vec2 uv = vTextureCoord * uInputSize.xy / uSize;
  float y = clamp(vTextureCoord.y * uInputSize.y / uSize.y, 0.0, 1.0);
  // Nothing above the waterline; below it the net rises quickly to full and, further
  // down, stretches as the surface tilts away from the eye.
  float water = smoothstep(uHorizon, uHorizon + 0.12, y);
  if (water <= 0.001) {
    finalColor = base;
    return;
  }
  float depth = clamp((y - uHorizon) / max(0.001, 1.0 - uHorizon), 0.0, 1.0);
  // Looking across water, not down into it: cells are wide and flat, and they crowd
  // together toward the horizon rather than stretching into streaks.
  float perspective = pow(depth, 1.45);
  vec2 p = vec2(uv.x, uHorizon + perspective * (1.0 - uHorizon)) * vec2(1.0, 2.1);
  float scale = mix(7.5, 5.0, uDepth);
  float t = uTime;
  float a = causticLayer(p * scale, t);
  float b = causticLayer(p * scale * 0.63 + vec2(3.1, 1.7), t * 0.77);
  // Brightest in the near water, fading away toward the waterline.
  float reach = mix(0.35, 1.0, depth);
  float light = (a * 0.7 + b * 0.45) * uStrength * water * reach;
  // Only the water takes the light: whatever is drawn on top of it keeps its own colour.
  finalColor = base + vec4(uTint * light, 0.0) * (1.0 - base.a);
}
`;

export interface WaterFilterOptions {
  size: [number, number];
  tint: [number, number, number];
  strength?: number;
  depth?: number;
  horizon?: number;
}

export class WaterFilter extends Filter {
  constructor(options: WaterFilterOptions) {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'chowa-caustics' }),
      resources: {
        waterUniforms: {
          uSize: { value: new Float32Array(options.size), type: 'vec2<f32>' },
          uTime: { value: 0, type: 'f32' },
          uStrength: { value: options.strength ?? 0.5, type: 'f32' },
          uTint: { value: new Float32Array(options.tint), type: 'vec3<f32>' },
          uDepth: { value: options.depth ?? 0.5, type: 'f32' },
          uHorizon: { value: options.horizon ?? 0.55, type: 'f32' },
        },
      },
    });
    this.resolution = 'inherit';
  }

  private get uniforms(): Record<string, number | Float32Array> {
    return (this.resources as unknown as { waterUniforms: { uniforms: Record<string, number | Float32Array> } }).waterUniforms.uniforms;
  }

  set time(value: number) {
    this.uniforms.uTime = value;
  }

  set strength(value: number) {
    this.uniforms.uStrength = value;
  }

  setSize(width: number, height: number): void {
    const size = this.uniforms.uSize as Float32Array;
    size[0] = width;
    size[1] = height;
  }
}

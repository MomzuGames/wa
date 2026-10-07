import { Filter, GlProgram, UniformGroup } from 'pixi.js';

// The soft glow around pastel shapes (the light, Night Sky's lines and stars, the demo
// finger, the story's lights). One small program serves every glow: its colour, reach and
// strength are settings, not part of the program. (The glow from pixi-filters built a large
// new program for every reach the first time it was drawn, and each build froze the game
// for most of a second: the stutters the owner saw entering Night Sky or a land's trail.)

export interface GlowOptions {
  distance?: number;
  strength?: number;
  quality?: number; // kept for older callers; one quality serves all
}

const vertex = `in vec2 aPosition;
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
vec2 filterTextureCoord(void) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`;

// Samples the shape's coverage on rings around each pixel (nearer rings count more) and
// lays a halo of the glow colour where the shape is not, fading with distance.
const fragment = `in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform highp vec4 uInputSize;
uniform highp vec4 uInputClamp;
uniform vec3 uColor;
uniform float uDistance;
uniform float uStrength;
void main(void) {
  vec4 base = texture(uTexture, vTextureCoord);
  float total = 0.0;
  float weight = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = float(i) * 0.5235988 + 0.26;
    vec2 dir = vec2(cos(a), sin(a)) * uInputSize.zw * uDistance;
    for (int j = 1; j <= 4; j++) {
      float f = float(j) / 4.0;
      float w = 1.0 - f * 0.75;
      vec2 at = clamp(vTextureCoord + dir * f, uInputClamp.xy, uInputClamp.zw);
      total += texture(uTexture, at).a * w;
      weight += w;
    }
  }
  float glow = clamp(total / weight * uStrength * 1.6, 0.0, 1.0) * (1.0 - base.a);
  finalColor = base + vec4(uColor * glow, glow);
}`;

let program: GlProgram | null = null;

export class SoftGlow extends Filter {
  constructor(color: number, distance: number, strength: number) {
    program ??= GlProgram.from({ vertex, fragment, name: 'soft-glow' });
    super({
      glProgram: program,
      resources: {
        glowUniforms: new UniformGroup({
          uColor: { value: new Float32Array(3), type: 'vec3<f32>' },
          uDistance: { value: distance, type: 'f32' },
          uStrength: { value: strength, type: 'f32' },
        }),
      },
      padding: distance,
      resolution: 'inherit',
      antialias: 'inherit',
    });
    this.color = color;
  }

  private get uniforms(): { uColor: Float32Array; uDistance: number; uStrength: number } {
    return this.resources.glowUniforms.uniforms;
  }

  set color(color: number) {
    const c = this.uniforms.uColor;
    c[0] = ((color >> 16) & 0xff) / 255;
    c[1] = ((color >> 8) & 0xff) / 255;
    c[2] = (color & 0xff) / 255;
  }

  // How strong the halo is (tweened by the title's breathing dot).
  get outerStrength(): number {
    return this.uniforms.uStrength;
  }

  set outerStrength(v: number) {
    this.uniforms.uStrength = v;
  }
}

export function createGlow(color: number, options: GlowOptions = {}): SoftGlow {
  return new SoftGlow(color, options.distance ?? 24, options.strength ?? 1.5);
}

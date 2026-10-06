import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { palette, rgba } from '../../design/palette';

// Moon Lake's paper lanterns, painted once with the browser's own 2D canvas (soft gradients,
// a barrel-shaped paper body, bamboo ribs, light glowing through the paper, lacquered caps,
// a wire loop and a tassel) and then used as textures. Where no canvas exists (the headless
// tests), a simple drawn lantern stands in.

const SCALE = 4; // texture pixels per screen pixel, so lanterns stay crisp on any screen
const VARIANTS = 3; // a few slightly different lanterns, so a lake never looks stamped
const bodies = new Map<string, { texture: Texture; anchorY: number }>();
let glow: Texture | null | undefined;

function paper(width: number, height: number): CanvasRenderingContext2D | null {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  try {
    return c.getContext('2d');
  } catch {
    return null;
  }
}

// A soft round glow, white, for tinting: a smooth fall-off with no visible edge.
export function glowTexture(): Texture | null {
  if (glow !== undefined) return glow;
  const size = 256;
  const ctx = paper(size, size);
  if (!ctx) return (glow = null);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [at, a] of [
    [0, 1],
    [0.12, 0.8],
    [0.3, 0.42],
    [0.5, 0.17],
    [0.7, 0.05],
    [1, 0],
  ] as const) {
    g.addColorStop(at, rgba('pearl', a));
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = Texture.from(ctx.canvas);
  return glow;
}

// One lantern `h` screen pixels tall (paper body, caps included; the loop and tassel extend it).
function bodyTexture(h: number, variant: number): { texture: Texture; anchorY: number } | null {
  const key = `${Math.round(h)}:${variant}`;
  const cached = bodies.get(key);
  if (cached) return cached;
  const H = Math.max(16, Math.round(h * SCALE));
  const cw = Math.round(H * 0.95);
  const ch = Math.round(H * 1.5);
  const ctx = paper(cw, ch);
  if (!ctx) return null;
  const cy = ch * 0.44; // the middle of the paper body
  ctx.translate(cw / 2, cy);
  const bh = H * 0.4; // half the paper's height
  const bw = H * (0.37 + variant * 0.015); // half its widest width
  const lip = 0.6; // the paper narrows to this share of its width at the caps
  const halfAt = (y: number) => bw * (lip + (1 - lip) * (1 - (y / bh) ** 2));
  const body = () => {
    ctx.beginPath();
    ctx.moveTo(-bw * lip, -bh);
    ctx.bezierCurveTo(-bw * 1.1, -bh * 0.66, -bw * 1.1, bh * 0.66, -bw * lip, bh);
    ctx.lineTo(bw * lip, bh);
    ctx.bezierCurveTo(bw * 1.1, bh * 0.66, bw * 1.1, -bh * 0.66, bw * lip, -bh);
    ctx.closePath();
  };

  // Light through paper: brightest a little low and left of centre, warming toward the rim.
  body();
  const inner = ctx.createRadialGradient(-bw * 0.12, bh * 0.12, 0, -bw * 0.05, bh * 0.05, bh * 1.15);
  inner.addColorStop(0, rgba('pearl', 1));
  inner.addColorStop(0.22, rgba('lemon', 1));
  inner.addColorStop(0.62, rgba('peach', 1));
  inner.addColorStop(1, rgba('peach', 0.95));
  ctx.fillStyle = inner;
  ctx.fill();

  ctx.save();
  body();
  ctx.clip();
  // Roundness: the paper darkens toward its sides, more on the side away from the light.
  const side = ctx.createLinearGradient(-bw, 0, bw, 0);
  side.addColorStop(0, rgba('shadow', 0.22));
  side.addColorStop(0.28, rgba('shadow', 0));
  side.addColorStop(0.62, rgba('shadow', 0));
  side.addColorStop(1, rgba('shadow', 0.34));
  ctx.fillStyle = side;
  ctx.fillRect(-bw * 1.2, -bh * 1.2, bw * 2.4, bh * 2.4);
  const ends = ctx.createLinearGradient(0, -bh, 0, bh);
  ends.addColorStop(0, rgba('shadow', 0.22));
  ends.addColorStop(0.2, rgba('shadow', 0));
  ends.addColorStop(0.8, rgba('shadow', 0));
  ends.addColorStop(1, rgba('shadow', 0.28));
  ctx.fillStyle = ends;
  ctx.fillRect(-bw * 1.2, -bh * 1.2, bw * 2.4, bh * 2.4);
  // Paper seams running top to bottom, following the bulge.
  ctx.lineWidth = Math.max(1, H * 0.006);
  ctx.strokeStyle = rgba('shadow', 0.07);
  for (const k of [-0.62, -0.22, 0.22, 0.62]) {
    ctx.beginPath();
    ctx.moveTo(k * bw * lip, -bh);
    ctx.bezierCurveTo(k * bw * 1.1, -bh * 0.5, k * bw * 1.1, bh * 0.5, k * bw * lip, bh);
    ctx.stroke();
  }
  // Bamboo ribs, bowed a little as if seen from just above, each with a faint lit edge.
  const ribs = 11;
  for (let i = 1; i < ribs; i++) {
    const y = -bh + (i / ribs) * bh * 2;
    const w = halfAt(y);
    const bow = bh * 0.06 * (1 - Math.abs(y / bh) * 0.4);
    ctx.beginPath();
    ctx.moveTo(-w, y);
    ctx.quadraticCurveTo(0, y + bow, w, y);
    ctx.lineWidth = Math.max(1, H * 0.011);
    ctx.strokeStyle = rgba('shadow', 0.2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-w, y - H * 0.008);
    ctx.quadraticCurveTo(0, y + bow - H * 0.008, w, y - H * 0.008);
    ctx.lineWidth = Math.max(1, H * 0.006);
    ctx.strokeStyle = rgba('pearl', 0.16);
    ctx.stroke();
  }
  // The candle's heart, seen through the paper.
  const heart = ctx.createRadialGradient(0, bh * 0.18, 0, 0, bh * 0.18, bh * 0.55);
  heart.addColorStop(0, rgba('pearl', 0.75));
  heart.addColorStop(0.4, rgba('lemon', 0.35));
  heart.addColorStop(1, rgba('lemon', 0));
  ctx.fillStyle = heart;
  ctx.fillRect(-bw * 1.2, -bh * 1.2, bw * 2.4, bh * 2.4);
  // A soft sheen on the left, where the moon catches the paper.
  ctx.save();
  ctx.translate(-bw * 0.55, -bh * 0.18);
  ctx.scale(0.35, 1);
  const sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, bh * 0.55);
  sheen.addColorStop(0, rgba('pearl', 0.32));
  sheen.addColorStop(1, rgba('pearl', 0));
  ctx.fillStyle = sheen;
  ctx.fillRect(-bh, -bh, bh * 2, bh * 2);
  ctx.restore();
  ctx.restore();

  // Lacquered caps: short dark bands, rounded like the rims of a drum.
  const cap = (y: number, up: boolean) => {
    const w = bw * lip * 1.06;
    const t = H * 0.07;
    const top = up ? y - t : y;
    const band = ctx.createLinearGradient(-w, 0, w, 0);
    band.addColorStop(0, rgba('void', 1));
    band.addColorStop(0.35, rgba('dim', 1));
    band.addColorStop(0.55, rgba('dim', 1));
    band.addColorStop(1, rgba('void', 1));
    ctx.fillStyle = band;
    ctx.beginPath();
    ctx.ellipse(0, top, w, t * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(-w, top, w * 2, t);
    ctx.beginPath();
    ctx.ellipse(0, top + t, w, t * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0, top, w, t * 0.32, 0, Math.PI, Math.PI * 2);
    ctx.lineWidth = Math.max(1, H * 0.008);
    ctx.strokeStyle = rgba('pearl', 0.22);
    ctx.stroke();
  };
  cap(-bh, true);
  cap(bh, false);
  // The wire loop it hangs by.
  ctx.beginPath();
  ctx.ellipse(0, -bh - H * 0.07, bw * 0.24, H * 0.12, 0, Math.PI, Math.PI * 2);
  ctx.lineWidth = Math.max(1, H * 0.016);
  ctx.strokeStyle = rgba('dim', 1);
  ctx.stroke();
  // A tassel: a knot and a few loose strands.
  const knot = bh + H * 0.085;
  ctx.fillStyle = rgba('rose', 0.9);
  ctx.beginPath();
  ctx.arc(0, knot, H * 0.022, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = Math.max(1, H * 0.008);
  ctx.strokeStyle = rgba('rose', 0.75);
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(i * H * 0.006, knot);
    ctx.quadraticCurveTo(i * H * 0.012, knot + H * 0.09, i * H * 0.018 + H * 0.004 * variant, knot + H * 0.17);
    ctx.stroke();
  }
  const made = { texture: Texture.from(ctx.canvas), anchorY: cy / ch };
  bodies.set(key, made);
  return made;
}

// A lantern ready to place, centred on its paper body. Falls back to simple shapes.
export function lanternBody(h: number, variant: number, fallback: (g: Graphics, h: number) => void): Container {
  const root = new Container();
  const made = bodyTexture(h, variant % VARIANTS);
  if (made) {
    const sprite = new Sprite(made.texture);
    sprite.anchor.set(0.5, made.anchorY);
    sprite.scale.set(1 / SCALE);
    root.addChild(sprite);
  } else {
    const g = new Graphics();
    fallback(g, h);
    root.addChild(g);
  }
  return root;
}

// A soft glow of the given colour and size (its diameter), or a few faint discs as a stand-in.
export function softGlow(diameter: number, color: number, alpha: number): Container {
  const texture = glowTexture();
  if (texture) {
    const s = new Sprite(texture);
    s.anchor.set(0.5);
    s.width = diameter;
    s.height = diameter;
    s.tint = color;
    s.alpha = alpha;
    return s;
  }
  const g = new Graphics();
  for (const k of [1, 0.66, 0.4]) g.circle(0, 0, (diameter / 2) * k).fill({ color, alpha: alpha * 0.25 });
  return g;
}

export const lanternColors = { warm: palette.lemon, halo: palette.peach } as const;

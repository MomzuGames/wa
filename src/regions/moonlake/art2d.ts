import { Graphics } from 'pixi.js';
import { palette } from '../../design/palette';

// Moon Lake's flat drawings: the lantern and the rock, used on the instruction cards (and by
// the 2D lake in the style samples).

// A Japanese paper lantern (chōchin), centred on (0, 0), `h` tall: a ribbed paper body
// glowing warm from inside, dark caps top and bottom, a hanging loop and a short tassel.
export function drawLantern(g: Graphics, h: number, alpha = 1): void {
  const w = h * 0.74;
  const line = Math.max(0.8, h * 0.035);
  g.moveTo(-w * 0.13, -h * 0.5).quadraticCurveTo(0, -h * 0.74, w * 0.13, -h * 0.5).stroke({ color: palette.dim, width: line * 1.2, alpha });
  g.ellipse(0, 0, w / 2, h * 0.42).fill({ color: palette.peach, alpha: 0.95 * alpha });
  g.ellipse(0, h * 0.03, w * 0.35, h * 0.3).fill({ color: palette.lemon, alpha: 0.85 * alpha });
  g.ellipse(0, h * 0.05, w * 0.17, h * 0.15).fill({ color: palette.pearl, alpha: 0.5 * alpha });
  for (const k of [-0.27, -0.135, 0, 0.135, 0.27]) {
    const y = k * h;
    const half = (w / 2) * Math.sqrt(Math.max(0, 1 - (y / (h * 0.42)) ** 2));
    g.moveTo(-half, y).quadraticCurveTo(0, y + h * 0.035, half, y);
  }
  g.stroke({ color: palette.shadow, width: line * 0.7, alpha: 0.18 * alpha });
  g.roundRect(-w * 0.3, -h * 0.5, w * 0.6, h * 0.11, h * 0.03).fill({ color: palette.void, alpha: 0.92 * alpha }).stroke({ color: palette.rose, width: line * 0.6, alpha: 0.35 * alpha });
  g.roundRect(-w * 0.3, h * 0.39, w * 0.6, h * 0.11, h * 0.03).fill({ color: palette.void, alpha: 0.92 * alpha }).stroke({ color: palette.rose, width: line * 0.6, alpha: 0.35 * alpha });
  g.moveTo(0, h * 0.5).lineTo(0, h * 0.64).stroke({ color: palette.rose, width: line, alpha: 0.75 * alpha, cap: 'round' });
}

// A rock in the lake, centred on (0, 0), with its dots (or a ring for none) on top.
export function drawRock(g: Graphics, size: number, seed: number, count: number | null, dotColor: number = palette.pearl): void {
  const r = size * 0.42;
  const pts: number[] = [];
  for (let k = 0; k < 9; k++) {
    const a = (k / 9) * Math.PI * 2;
    const wob = 0.86 + 0.14 * Math.sin(seed * 12.9898 + k * 78.233);
    pts.push(Math.cos(a) * r * wob, Math.sin(a) * r * wob * 0.88);
  }
  g.poly(pts.map((v, i) => v + (i % 2 ? size * 0.06 : size * 0.03))).fill({ color: palette.shadow, alpha: 0.45 });
  g.poly(pts).fill({ color: palette.dim, alpha: 1 }).poly(pts).fill({ color: palette.lavender, alpha: 0.06 }).poly(pts).stroke({ color: palette.pearl, width: 1, alpha: 0.16 });
  g.ellipse(-r * 0.35, -r * 0.42, r * 0.3, r * 0.12).fill({ color: palette.pearl, alpha: 0.1 });
  if (count === null) return;
  const d = size * 0.07;
  if (count === 0) {
    g.circle(0, 0, size * 0.12).stroke({ color: dotColor, width: Math.max(1.2, size * 0.035), alpha: 0.85 });
    return;
  }
  const s = size * 0.13;
  const spots: Record<number, Array<[number, number]>> = {
    1: [[0, 0]],
    2: [[-s, 0], [s, 0]],
    3: [[0, -s * 0.9], [-s, s * 0.6], [s, s * 0.6]],
    4: [[-s, -s], [s, -s], [-s, s], [s, s]],
  };
  for (const [x, y] of spots[count] ?? []) g.circle(x, y, d).fill({ color: dotColor, alpha: 0.95 });
}


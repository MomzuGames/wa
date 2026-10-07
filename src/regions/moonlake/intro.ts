import gsap from 'gsap';
import { Container, Graphics } from 'pixi.js';
import type { IntroPage } from '../types';
import { palette } from '../../design/palette';
import { liftFinger, makeFinger, tapAt } from '../../ui/introGlyphs';
import { type LanternLevel, cellCount, clashing, isRock, isWater, lightCounts, rockCount, rockState, sightLines } from './model';
import { lanternBody, softGlow } from './lanternArt';
import { drawLantern, drawRock } from './art2d';

// Moon Lake's instruction card: how to float a lantern, how light runs, what a rock's dots
// mean. Drawn flat (cards are flat), shared by the 2D and the 3D lake.

// A small lake for the instruction card: rows as in a level, plus lanterns and a verdict.
function miniLake(rows: string[], lanterns: number[], s = 30): { root: Container; draw: (ls: number[]) => void } {
  const level: LanternLevel = { seed: 'mini', chapter: 0, width: rows[0]!.length, height: rows.length, grid: rows, solution: [], difficulty: 0 };
  const sight = sightLines(level);
  const root = new Container();
  const base = new Graphics();
  const light = new Graphics();
  const top = new Container();
  root.addChild(base, light, top);
  const ox = -(level.width * s) / 2;
  const oy = -(level.height * s) / 2;
  const at = (i: number) => ({ x: ox + ((i % level.width) + 0.5) * s, y: oy + (Math.floor(i / level.width) + 0.5) * s });
  for (let i = 0; i < cellCount(level); i++) {
    if (!isWater(level, i) && !isRock(level, i)) continue;
    const p = at(i);
    base.roundRect(p.x - s * 0.48, p.y - s * 0.48, s * 0.96, s * 0.96, s * 0.18).fill({ color: palette.void, alpha: 1 }).roundRect(p.x - s * 0.48, p.y - s * 0.48, s * 0.96, s * 0.96, s * 0.18).stroke({ color: palette.pearl, width: 1, alpha: 0.18 });
  }
  const draw = (ls: number[]) => {
    const set = new Set(ls);
    light.clear();
    top.removeChildren().forEach((c) => c.destroy());
    const lit = lightCounts(level, set, sight);
    for (let i = 0; i < lit.length; i++) {
      if (!lit[i]) continue;
      const p = at(i);
      light.roundRect(p.x - s * 0.47, p.y - s * 0.47, s * 0.94, s * 0.94, s * 0.2).fill({ color: palette.lemon, alpha: 0.16 });
    }
    const clashes = clashing(level, set, sight);
    for (const a of clashes) for (const b of clashes) if (b > a && sight[a]!.includes(b)) light.moveTo(at(a).x, at(a).y).lineTo(at(b).x, at(b).y);
    light.stroke({ color: palette.rose, width: 3, alpha: 0.8, cap: 'round' });
    for (let i = 0; i < cellCount(level); i++) {
      if (!isRock(level, i)) continue;
      const g = new Graphics();
      const state = rockState(level, set, i);
      drawRock(g, s, i + 1, rockCount(level, i), state === 'met' && rockCount(level, i) ? palette.lemon : state === 'over' ? palette.rose : palette.pearl);
      g.position.copyFrom(at(i));
      top.addChild(g);
    }
    for (const l of set) {
      const g = new Container();
      g.addChild(softGlow(s * 1.8, palette.peach, 0.3), softGlow(s * 0.9, palette.lemon, 0.45), lanternBody(s * 0.66, l, drawLantern));
      g.position.copyFrom(at(l));
      top.addChild(g);
    }
  };
  draw(lanterns);
  return { root, draw };
}

// Examples side by side, each with a soft tick or cross below.
function examples(items: Array<{ rows: string[]; lanterns: number[]; ok: boolean }>): () => Container {
  return () => {
    const root = new Container();
    const s = 26;
    const gap = 30;
    const widths = items.map((e) => e.rows[0]!.length * s);
    let x0 = -(widths.reduce((a, w) => a + w, 0) + gap * (items.length - 1)) / 2;
    items.forEach((e, i) => {
      const lake = miniLake(e.rows, e.lanterns, s);
      lake.root.position.set(x0 + widths[i]! / 2, -10);
      const mark = new Graphics();
      const my = (e.rows.length * s) / 2 + 14;
      if (e.ok) mark.moveTo(-7, my).lineTo(-2, my + 5).lineTo(8, my - 6).stroke({ color: palette.mint, width: 2.5, cap: 'round', join: 'round' });
      else mark.moveTo(-6, my - 6).lineTo(6, my + 6).moveTo(6, my - 6).lineTo(-6, my + 6).stroke({ color: palette.rose, width: 2.5, cap: 'round' });
      lake.root.addChild(mark);
      lake.root.alpha = 0;
      root.addChild(lake.root);
      gsap.to(lake.root, { alpha: 1, duration: 0.5, delay: i * 0.35 });
      x0 += widths[i]! + gap;
    });
    return root;
  };
}

export function lanternIntroPages(lakeLevel: LanternLevel): IntroPage[] {
  const pages: IntroPage[] = [
    {
      caption: 'Tap the water to float a lantern there, and tap it again to take it away. Light up every patch of water.',
      glyph: () => {
        // Three taps light a small lake: the middle, then two corners.
        const s = 34;
        const lake = miniLake(['...', '...', '...'], [], s);
        const finger = makeFinger();
        lake.root.addChild(finger);
        const at = (i: number) => ({ x: ((i % 3) - 1) * s, y: (Math.floor(i / 3) - 1) * s });
        const tl = gsap.timeline({ repeat: -1, repeatDelay: 1.4 });
        const order = [4, 0, 8];
        order.forEach((cell, k) => {
          tapAt(tl, finger, at(cell).x, at(cell).y, k === 0 ? 0.5 : 0.6).call(() => lake.draw(order.slice(0, k + 1)));
        });
        liftFinger(tl, finger);
        tl.call(() => lake.draw([]), undefined, '+=1.2');
        lake.root.on('destroyed', () => tl.kill());
        return lake.root;
      },
    },
    {
      caption: 'Light runs straight across the water until it meets a rock or the shore. Two lanterns may never shine on each other.',
      glyph: examples([
        { rows: ['.#.'], lanterns: [0, 2], ok: true },
        { rows: ['...'], lanterns: [0, 2], ok: false },
      ]),
    },
  ];
  if (lakeLevel.grid.some((row) => /[0-4]/.test(row))) {
    pages.push({
      caption: 'Dots on a rock: exactly that many lanterns sit right beside it, above, below, left or right. Corners do not count. A ring means none.',
      glyph: examples([
        { rows: ['.2.'], lanterns: [0, 2], ok: true },
        { rows: ['.2.'], lanterns: [0], ok: false },
        { rows: ['.0.'], lanterns: [0], ok: false },
      ]),
    });
  }
  return pages;
}


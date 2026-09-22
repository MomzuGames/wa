import { GlowFilter } from 'pixi-filters';
import { isHigh } from '../design/quality';

export interface GlowOptions {
  distance?: number;
  strength?: number;
  quality?: number;
}

export function createGlow(color: number, options: GlowOptions = {}): GlowFilter {
  // With the post pass on, light already spills from bright shapes, so each object's
  // own glow is pulled back: together they read as one light rather than two haloes.
  const spill = isHigh() ? 0.55 : 1;
  const glow = new GlowFilter({
    color,
    distance: options.distance ?? 24,
    outerStrength: (options.strength ?? 1.5) * spill,
    innerStrength: 0,
    quality: options.quality ?? 0.3,
  });
  // Filters default to 1x resolution, which pixelates edges on Retina screens.
  glow.resolution = 'inherit';
  glow.antialias = 'inherit';
  return glow;
}

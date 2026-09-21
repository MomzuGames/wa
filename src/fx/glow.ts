import { GlowFilter } from 'pixi-filters';

export interface GlowOptions {
  distance?: number;
  strength?: number;
  quality?: number;
}

export function createGlow(color: number, options: GlowOptions = {}): GlowFilter {
  const glow = new GlowFilter({
    color,
    distance: options.distance ?? 24,
    outerStrength: options.strength ?? 1.5,
    innerStrength: 0,
    quality: options.quality ?? 0.4,
  });
  // Filters default to 1x resolution, which pixelates edges on Retina screens.
  glow.resolution = 'inherit';
  glow.antialias = 'inherit';
  return glow;
}

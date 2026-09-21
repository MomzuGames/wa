export const layout = {
  margin: 32,
  hudInset: 28,
  hudIconSize: 36,
  minHitSize: 28,
  snapTolerance: 22,
  puzzleMaxFraction: 0.72,
  portraitFraction: 0.88,
  compactWidth: 700,
  hudBand: 72,
} as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function isTouch(): boolean {
  return typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0;
}

export function isCompact(screenWidth: number): boolean {
  return screenWidth < layout.compactWidth;
}

export function puzzleArea(screenWidth: number, screenHeight: number): Rect {
  const portrait = screenHeight > screenWidth;
  // Keep clear of the HUD rows at the top and bottom on short screens.
  const safeHeight = screenHeight - layout.hudBand * 2;
  const size = portrait
    ? Math.min(screenWidth * layout.portraitFraction, safeHeight)
    : Math.min(Math.min(screenWidth, screenHeight) * layout.puzzleMaxFraction, safeHeight);
  return {
    x: (screenWidth - size) / 2,
    y: (screenHeight - size) / 2,
    width: size,
    height: size,
  };
}

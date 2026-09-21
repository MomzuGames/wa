export const layout = {
  margin: 32,
  hudInset: 28,
  hudIconSize: 36,
  minHitSize: 28,
  snapTolerance: 22,
  puzzleMaxFraction: 0.72,
} as const;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function puzzleArea(screenWidth: number, screenHeight: number): Rect {
  const size = Math.min(screenWidth, screenHeight) * layout.puzzleMaxFraction;
  return {
    x: (screenWidth - size) / 2,
    y: (screenHeight - size) / 2,
    width: size,
    height: size,
  };
}

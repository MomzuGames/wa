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

// Space between the top-right HUD icons.
export function hudGap(screenWidth: number): number {
  return layout.hudIconSize + (isCompact(screenWidth) ? 8 : 16);
}

// The phone's own furniture (Dynamic Island, home bar, rounded corners) as CSS reports it.
// Zero on laptops and in a browser tab; read again on every resize.
export const safeArea = { top: 0, right: 0, bottom: 0, left: 0 };

export function readSafeArea(): void {
  if (typeof document === 'undefined') return;
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const css = getComputedStyle(probe);
  safeArea.top = parseFloat(css.paddingTop) || 0;
  safeArea.right = parseFloat(css.paddingRight) || 0;
  safeArea.bottom = parseFloat(css.paddingBottom) || 0;
  safeArea.left = parseFloat(css.paddingLeft) || 0;
  probe.remove();
}

// Centres of the HUD icons nearest each edge, kept clear of the phone's furniture.
const SAFE_GAP = 6;
const half = layout.hudIconSize / 2;
export const hud = {
  top: () => Math.max(layout.hudInset, safeArea.top + SAFE_GAP) + half,
  bottom: (screenHeight: number) => screenHeight - Math.max(layout.hudInset, safeArea.bottom + SAFE_GAP) - half,
  left: () => Math.max(layout.hudInset, safeArea.left + SAFE_GAP) + half,
  right: (screenWidth: number) => screenWidth - Math.max(layout.hudInset, safeArea.right + SAFE_GAP) - half,
};

// The free stretch of the top row between the back button and the hint, help and settings icons.
export function headerBand(screenWidth: number): { left: number; right: number } {
  const breathing = 10;
  return {
    left: hud.left() + half + breathing,
    right: hud.right(screenWidth) - hudGap(screenWidth) * 2 - half - breathing,
  };
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

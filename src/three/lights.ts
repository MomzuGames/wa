// Where the little light and its family are on screen right now, so a 3D world can let
// them shine on it. The spirit fills this in every frame; 3D worlds only read it.

export interface LightSpot {
  x: number;
  y: number;
  color: number;
  size: number; // radius on screen, px
  alpha: number;
}

let spots: LightSpot[] = [];

export function setLightSpots(next: LightSpot[]): void {
  spots = next;
}

export function lightSpots(): readonly LightSpot[] {
  return spots;
}

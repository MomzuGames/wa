import { events } from '../core/events';

// How much visual work the game is allowed to do. Everything expensive (bloom, grain,
// caustics, extra particles) asks here first, so one dial covers the whole game.
export type QualityTier = 'low' | 'high';
export type QualitySetting = 'auto' | QualityTier;

export const qualityStyle = {
  // A phone that cannot hold this for a while drops to 'low'; a laptop sitting well
  // above it climbs back to 'high'. The gap between them stops it flapping.
  dropBelowFps: 45,
  raiseAboveFps: 57,
  sampleSeconds: 2.5,
  raiseAfterSeconds: 12,
} as const;

let setting: QualitySetting = 'auto';
let tier: QualityTier = 'high';
let measured: QualityTier | null = null;

// The starting guess before any frames have been measured: phones start cautious.
function guess(): QualityTier {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return 'high';
  const touch = navigator.maxTouchPoints > 0;
  const cores = navigator.hardwareConcurrency ?? 4;
  const small = Math.min(window.innerWidth, window.innerHeight) < 820;
  return touch && (small || cores <= 6) ? 'low' : 'high';
}

function apply(next: QualityTier): void {
  if (next === tier) return;
  tier = next;
  events.emit('quality:changed', tier);
}

export function quality(): QualityTier {
  return tier;
}

export function isHigh(): boolean {
  return tier === 'high';
}

export function qualitySetting(): QualitySetting {
  return setting;
}

// 'auto' follows the measured frame rate; 'low'/'high' pin it where the player wants.
export function setQualitySetting(next: QualitySetting): void {
  setting = next;
  apply(next === 'auto' ? (measured ?? guess()) : next);
}

export function initQuality(saved: QualitySetting): void {
  setting = saved;
  measured = null;
  apply(saved === 'auto' ? guess() : saved);
}

let elapsed = 0;
let frames = 0;
let goodFor = 0;

// Called every frame. In 'auto' it watches the frame rate and moves the tier to match.
export function sampleFrame(dtSeconds: number): void {
  if (dtSeconds <= 0 || dtSeconds > 0.5) return; // a hidden tab or a stall proves nothing
  elapsed += dtSeconds;
  frames++;
  if (elapsed < qualityStyle.sampleSeconds) return;
  const fps = frames / elapsed;
  elapsed = 0;
  frames = 0;
  if (fps >= qualityStyle.raiseAboveFps) goodFor += qualityStyle.sampleSeconds;
  else goodFor = 0;
  if (fps < qualityStyle.dropBelowFps) measured = 'low';
  else if (measured === 'low' && goodFor >= qualityStyle.raiseAfterSeconds) measured = 'high';
  if (setting === 'auto' && measured) apply(measured);
}

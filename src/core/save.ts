import { events } from './events';
import type { RegionId } from '../regions/types';
import { SAVE_KEY } from '../config/game';
import { REGION_ORDER as REGION_IDS } from '../regions/catalog';


export interface RegionProgress {
  solved: number[];
  attempts: Record<number, number>;
  cluesUsed: Record<number, number>;
}

export interface Settings {
  music: number;
  sfx: number;
  muted: boolean;
  reducedMotion: boolean;
}

export interface SaveData {
  version: 1;
  regions: Record<RegionId, RegionProgress>;
  settings: Settings;
  // Instruction lines already shown, per region, so cards appear once per new idea.
  seenIntros: Partial<Record<RegionId, string[]>>;
}


function emptyRegion(): RegionProgress {
  return { solved: [], attempts: {}, cluesUsed: {} };
}

export function defaultSave(): SaveData {
  const regions = {} as Record<RegionId, RegionProgress>;
  for (const id of REGION_IDS) regions[id] = emptyRegion();
  return {
    version: 1,
    regions,
    settings: { music: 0.7, sfx: 0.8, muted: false, reducedMotion: false },
    seenIntros: {},
  };
}

function isSaveData(value: unknown): value is SaveData {
  return typeof value === 'object' && value !== null && (value as SaveData).version === 1;
}

let current: SaveData | null = null;

export function load(): SaveData {
  if (current) return current;
  const fresh = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isSaveData(parsed)) {
      current = {
        version: 1,
        regions: { ...fresh.regions, ...parsed.regions },
        settings: { ...fresh.settings, ...parsed.settings },
        seenIntros: { ...(parsed.seenIntros ?? {}) },
      };
      return current;
    }
  } catch {
    // Corrupt or unavailable storage falls through to a fresh save.
  }
  current = fresh;
  return current;
}

export function persist(): void {
  if (!current) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(current));
  } catch {
    // Storage may be full or blocked; the game keeps running from memory.
  }
}

export function getSettings(): Settings {
  return load().settings;
}

export function updateSettings(patch: Partial<Settings>): Settings {
  const data = load();
  Object.assign(data.settings, patch);
  persist();
  events.emit('settings:changed', data.settings);
  return data.settings;
}

export function getRegion(id: RegionId): RegionProgress {
  return load().regions[id];
}

export function resetProgress(): void {
  const data = load();
  for (const id of REGION_IDS) data.regions[id] = emptyRegion();
  data.seenIntros = {};
  persist();
}

// True when any of these lines is new for the region; marks them all as seen.
export function markIntroSeen(id: RegionId, lines: string[]): boolean {
  const data = load();
  const seen = new Set(data.seenIntros[id] ?? []);
  const fresh = lines.some((l) => !seen.has(l));
  if (fresh) {
    data.seenIntros[id] = [...new Set([...seen, ...lines])];
    persist();
  }
  return fresh;
}

import { events } from './events';
import type { RegionId } from '../regions/types';
import { SAVE_KEY } from '../config/game';
import { REGION_ORDER as REGION_IDS } from '../regions/catalog';

const LEVELS_PER_REGION = 10;


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

// ----- Profiles: each player is a named light with its own save on this device -----

export type ProfileColor = 'mint' | 'lavender' | 'peach' | 'sky' | 'rose' | 'sage';

export interface Profile {
  id: string;
  name: string;
  color: ProfileColor;
  createdAt: number;
}

const PROFILES_KEY = `${SAVE_KEY}.profiles`;
const CURRENT_KEY = `${SAVE_KEY}.current`;

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage may be full or blocked.
  }
}

export function listProfiles(): Profile[] {
  return readJson<Profile[]>(PROFILES_KEY, []);
}

export function hasProfiles(): boolean {
  return listProfiles().length > 0;
}

export function currentProfile(): Profile | null {
  const id = readJson<string | null>(CURRENT_KEY, null);
  return listProfiles().find((p) => p.id === id) ?? null;
}

export function createProfile(name: string, color: ProfileColor): Profile {
  const profile: Profile = { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, name: name.trim().slice(0, 24), color, createdAt: Date.now() };
  writeJson(PROFILES_KEY, [...listProfiles(), profile]);
  return profile;
}

export function deleteProfile(id: string): void {
  writeJson(PROFILES_KEY, listProfiles().filter((p) => p.id !== id));
  try {
    localStorage.removeItem(saveKeyFor(id));
  } catch {
    // ignore
  }
  if (currentProfile()?.id === id) writeJson(CURRENT_KEY, null);
}

// Switching profiles swaps the whole save in memory; callers re-enter the map afterwards.
export function selectProfile(id: string): void {
  writeJson(CURRENT_KEY, id);
  current = null;
  load();
  events.emit('profile:changed');
}

function saveKeyFor(id: string): string {
  return `${SAVE_KEY}.${id}`;
}

function activeKey(): string {
  const profile = currentProfile();
  return profile ? saveKeyFor(profile.id) : SAVE_KEY;
}

let current: SaveData | null = null;

export function load(): SaveData {
  if (current) return current;
  const fresh = defaultSave();
  try {
    const raw = localStorage.getItem(activeKey());
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (isSaveData(parsed)) {
      current = {
        version: 1,
        regions: { ...fresh.regions, ...parsed.regions },
        settings: { ...fresh.settings, ...parsed.settings },
        seenIntros: { ...(parsed.seenIntros ?? {}) },
      };
      // Regions used to have more levels; drop progress that no longer exists.
      for (const id of REGION_IDS) current.regions[id].solved = current.regions[id].solved.filter((i) => i < LEVELS_PER_REGION);
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
    localStorage.setItem(activeKey(), JSON.stringify(current));
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
    events.emit('progress:changed');
  }
  return fresh;
}

// ----- Backup codes: everything on this device as one pasteable string -----

interface Backup {
  v: 1;
  profiles: Profile[];
  saves: Record<string, SaveData>;
}

function toBase64(text: string): string {
  return btoa(unescape(encodeURIComponent(text)));
}

function fromBase64(code: string): string {
  return decodeURIComponent(escape(atob(code)));
}

export function exportBackup(): string {
  const profiles = listProfiles();
  const saves: Record<string, SaveData> = {};
  for (const p of profiles) {
    const raw = readJson<SaveData | null>(saveKeyFor(p.id), null);
    if (raw) saves[p.id] = raw;
  }
  const backup: Backup = { v: 1, profiles, saves };
  return `chowa1.${toBase64(JSON.stringify(backup))}`;
}

// Merges a backup into this device: lights are added, and progress for a light that
// already exists here keeps whatever is solved on either side.
export function importBackup(code: string): number {
  const trimmed = code.trim();
  if (!trimmed.startsWith('chowa1.')) throw new Error('not a backup code');
  const backup = JSON.parse(fromBase64(trimmed.slice(7))) as Backup;
  if (backup.v !== 1 || !Array.isArray(backup.profiles)) throw new Error('not a backup code');
  const existing = listProfiles();
  const merged = existing.slice();
  for (const p of backup.profiles) {
    if (!merged.some((m) => m.id === p.id)) merged.push(p);
    const incoming = backup.saves[p.id];
    if (!incoming) continue;
    const mine = readJson<SaveData | null>(saveKeyFor(p.id), null) ?? defaultSave();
    for (const id of REGION_IDS) {
      const theirs = incoming.regions?.[id];
      if (!theirs) continue;
      mine.regions[id].solved = [...new Set([...mine.regions[id].solved, ...theirs.solved])].sort((a, b) => a - b);
      for (const [k, v] of Object.entries(theirs.attempts ?? {})) mine.regions[id].attempts[Number(k)] = Math.max(mine.regions[id].attempts[Number(k)] ?? 0, v);
      for (const [k, v] of Object.entries(theirs.cluesUsed ?? {})) mine.regions[id].cluesUsed[Number(k)] = Math.max(mine.regions[id].cluesUsed[Number(k)] ?? 0, v);
      mine.seenIntros[id] = [...new Set([...(mine.seenIntros[id] ?? []), ...(incoming.seenIntros?.[id] ?? [])])];
    }
    writeJson(saveKeyFor(p.id), mine);
  }
  writeJson(PROFILES_KEY, merged);
  current = null;
  load();
  return backup.profiles.length;
}

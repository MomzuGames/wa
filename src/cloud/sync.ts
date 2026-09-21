import { doc, getDoc, setDoc } from 'firebase/firestore';
import type { User } from 'firebase/auth';
import { db } from './firebase';
import { load, persist, type RegionProgress, type SaveData } from '../core/save';
import { REGION_ORDER } from '../regions/catalog';
import type { RegionId } from '../regions/types';
import { events } from '../core/events';

interface CloudSave {
  version: 1;
  regions: Record<string, RegionProgress>;
  seenIntros: Record<string, string[]>;
  updatedAt: number;
}

function toCloud(data: SaveData): CloudSave {
  return { version: 1, regions: data.regions, seenIntros: data.seenIntros as Record<string, string[]>, updatedAt: Date.now() };
}

// Progress is merged, never overwritten: a level solved anywhere stays solved.
function mergeInto(local: SaveData, cloud: CloudSave): boolean {
  let changed = false;
  for (const id of REGION_ORDER) {
    const mine = local.regions[id];
    const theirs = cloud.regions[id];
    if (!theirs) continue;
    const solved = new Set([...mine.solved, ...(theirs.solved ?? [])]);
    if (solved.size !== mine.solved.length) {
      mine.solved = [...solved].sort((a, b) => a - b);
      changed = true;
    }
    for (const [k, v] of Object.entries(theirs.attempts ?? {})) {
      const n = Number(k);
      if ((mine.attempts[n] ?? 0) < v) {
        mine.attempts[n] = v;
        changed = true;
      }
    }
    for (const [k, v] of Object.entries(theirs.cluesUsed ?? {})) {
      const n = Number(k);
      if ((mine.cluesUsed[n] ?? 0) < v) {
        mine.cluesUsed[n] = v;
        changed = true;
      }
    }
    const seen = new Set([...(local.seenIntros[id] ?? []), ...(cloud.seenIntros?.[id] ?? [])]);
    if (seen.size !== (local.seenIntros[id] ?? []).length) {
      local.seenIntros[id as RegionId] = [...seen];
      changed = true;
    }
  }
  return changed;
}

let user: User | null = null;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let dirty = false;

function ref(u: User) {
  return doc(db(), 'saves', u.uid);
}

// Called on sign-in: pull the cloud save, merge it with local progress, push the result.
export async function syncNow(u: User): Promise<void> {
  user = u;
  const local = load();
  try {
    const snap = await getDoc(ref(u));
    if (snap.exists()) {
      const cloud = snap.data() as CloudSave;
      if (mergeInto(local, cloud)) {
        persist();
        events.emit('progress:changed');
      }
    }
    await setDoc(ref(u), toCloud(local));
    dirty = false;
    events.emit('sync:state', 'synced');
  } catch {
    dirty = true;
    events.emit('sync:state', 'offline');
  }
}

export function setSyncUser(u: User | null): void {
  user = u;
  if (u) void syncNow(u);
}

// Debounced push after any local change; retried when the connection comes back.
export function schedulePush(): void {
  if (!user) return;
  dirty = true;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void pushNow(), 1500);
}

async function pushNow(): Promise<void> {
  if (!user || !dirty) return;
  try {
    await setDoc(ref(user), toCloud(load()));
    dirty = false;
    events.emit('sync:state', 'synced');
  } catch {
    events.emit('sync:state', 'offline');
  }
}

export function installSyncTriggers(): void {
  events.on('progress:changed', () => schedulePush());
  window.addEventListener('online', () => void pushNow());
}

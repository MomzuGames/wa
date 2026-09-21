// Ripple puzzle (lights-out on a graph): pressing a lily pad advances it and its
// neighbours one step; every pad must end up lit.

export interface PadNode {
  x: number; // 0..1
  y: number;
  wide: boolean; // ripples reach two steps away
  frozen?: boolean; // a stone pad: cannot be pressed, only changed by neighbours
}

export interface RippleLevel {
  seed: string;
  chapter: number;
  handcrafted?: boolean;
  states: 2 | 3;
  nodes: PadNode[];
  edges: Array<[number, number]>;
  start: number[]; // state per node, 0 = dark, states-1 = lit
  solution: number[]; // presses per node
  difficulty: number;
}

export function neighbourLists(level: Pick<RippleLevel, 'nodes' | 'edges'>): number[][] {
  const out = level.nodes.map(() => [] as number[]);
  for (const [a, b] of level.edges) {
    out[a]!.push(b);
    out[b]!.push(a);
  }
  return out;
}

// Which pads a press on each node advances (itself, neighbours, and two steps for wide pads).
export function affectLists(level: Pick<RippleLevel, 'nodes' | 'edges'>): number[][] {
  const adj = neighbourLists(level);
  return level.nodes.map((node, i) => {
    const set = new Set<number>([i, ...adj[i]!]);
    if (node.wide) for (const n of adj[i]!) for (const m of adj[n]!) set.add(m);
    return [...set].sort((a, b) => a - b);
  });
}

export function press(level: RippleLevel, state: number[], node: number, affects = affectLists(level)): number[] {
  if (level.nodes[node]!.frozen) return state.slice();
  const next = state.slice();
  for (const j of affects[node]!) next[j] = (next[j]! + 1) % level.states;
  return next;
}

export function isLit(level: RippleLevel, state: number[]): boolean {
  return state.every((s) => s === level.states - 1);
}

export function applyPresses(level: RippleLevel, state: number[], presses: number[]): number[] {
  const affects = affectLists(level);
  let s = state.slice();
  presses.forEach((count, i) => {
    for (let k = 0; k < count; k++) s = press(level, s, i, affects);
  });
  return s;
}

export function isSolutionValid(level: RippleLevel): boolean {
  return isLit(level, applyPresses(level, level.start, level.solution));
}

export function pressCount(presses: number[]): number {
  return presses.reduce((n, c) => n + c, 0);
}

export function isConnected(level: Pick<RippleLevel, 'nodes' | 'edges'>): boolean {
  if (level.nodes.length === 0) return false;
  const adj = neighbourLists(level);
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop()!;
    for (const n of adj[i]!) {
      if (!seen.has(n)) {
        seen.add(n);
        stack.push(n);
      }
    }
  }
  return seen.size === level.nodes.length;
}

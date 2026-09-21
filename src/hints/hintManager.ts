import type { ClueTier } from '../regions/types';

export const hintRules = {
  tierThresholds: [3, 6, 10, 15] as const,
  movesPerUnit: 40,
  secondsPerUnit: 180,
  idleTimeoutSeconds: 60,
} as const;

export interface HintState {
  units: number;
  availableTier: number;
  revealedTier: number;
}

export class HintManager {
  private units = 0;
  private revealed = 0;
  private moves = 0;
  private activeSeconds = 0;
  private idleSeconds = 0;
  private hidden = false;
  private listeners: Array<(tier: ClueTier) => void> = [];

  constructor(initialUnits = 0, initialClues = 0) {
    this.units = initialUnits;
    this.revealed = initialClues;
  }

  get state(): HintState {
    return { units: this.units, availableTier: this.availableTier(), revealedTier: this.revealed };
  }

  // 0..1 progress toward the next tier; 1 when a tier is waiting to be revealed.
  get fill(): number {
    const available = this.availableTier();
    if (available > this.revealed) return 1;
    if (available >= hintRules.tierThresholds.length) return 1;
    const floor = available === 0 ? 0 : hintRules.tierThresholds[available - 1]!;
    const ceil = hintRules.tierThresholds[available]!;
    return (this.units - floor) / (ceil - floor);
  }

  availableTier(): number {
    let tier = 0;
    for (const threshold of hintRules.tierThresholds) if (this.units >= threshold) tier++;
    return tier;
  }

  get hasUnrevealed(): boolean {
    return this.availableTier() > this.revealed;
  }

  onTierAvailable(cb: (tier: ClueTier) => void): void {
    this.listeners.push(cb);
  }

  addUnit(count = 1): void {
    const before = this.availableTier();
    this.units += count;
    const after = this.availableTier();
    for (let t = before + 1; t <= after; t++) this.listeners.forEach((l) => l(t as ClueTier));
  }

  recordAttempt(): void {
    this.addUnit();
  }

  recordRestart(): void {
    this.addUnit();
  }

  recordMove(): void {
    this.idleSeconds = 0;
    this.moves++;
    if (this.moves >= hintRules.movesPerUnit) {
      this.moves = 0;
      this.addUnit();
    }
  }

  recordInput(): void {
    this.idleSeconds = 0;
  }

  setHidden(hidden: boolean): void {
    this.hidden = hidden;
  }

  tick(dtSeconds: number): void {
    if (this.hidden || this.idleSeconds >= hintRules.idleTimeoutSeconds) return;
    this.idleSeconds += dtSeconds;
    this.activeSeconds += dtSeconds;
    if (this.activeSeconds >= hintRules.secondsPerUnit) {
      this.activeSeconds -= hintRules.secondsPerUnit;
      this.addUnit();
    }
  }

  // Reveals the next unlocked tier, or null if none is waiting.
  reveal(): ClueTier | null {
    if (!this.hasUnrevealed) return null;
    this.revealed++;
    return this.revealed as ClueTier;
  }

  // Reveals the next tier regardless of attempts (the "ask for a hint" button).
  forceReveal(): ClueTier | null {
    if (this.revealed >= hintRules.tierThresholds.length) return null;
    if (this.units < hintRules.tierThresholds[this.revealed]!) this.units = hintRules.tierThresholds[this.revealed]!;
    this.revealed++;
    return this.revealed as ClueTier;
  }
}

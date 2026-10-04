// Tracks how much the player is struggling with a level, in "units": a restart, a failed
// stroke, 40 moves without solving, or 3 minutes of active play each add one. Units fill
// the hint orb (it glows once a hint would likely help) and decide when gentle tips appear.
// Hints themselves are always available from the bulb; each one is a single concrete step.

export const hintRules = {
  readyUnits: 3, // the orb glows from here on
  movesPerUnit: 40,
  secondsPerUnit: 180,
  idleTimeoutSeconds: 60,
} as const;

export interface HintState {
  units: number;
  used: number;
}

export class HintManager {
  private units = 0;
  private used = 0;
  private moves = 0;
  private activeSeconds = 0;
  private idleSeconds = 0;
  private hidden = false;
  private listeners: Array<(units: number) => void> = [];

  constructor(initialUnits = 0, initialUsed = 0) {
    this.units = initialUnits;
    this.used = initialUsed;
  }

  get state(): HintState {
    return { units: this.units, used: this.used };
  }

  // 0..1: how full the orb is; 1 once a hint would likely help.
  get fill(): number {
    return Math.min(1, this.units / hintRules.readyUnits);
  }

  get ready(): boolean {
    return this.units >= hintRules.readyUnits;
  }

  // Called with the new total every time struggle grows.
  onUnits(cb: (units: number) => void): void {
    this.listeners.push(cb);
  }

  addUnit(count = 1): void {
    this.units += count;
    this.listeners.forEach((l) => l(this.units));
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

  // A hint was given.
  recordHint(): void {
    this.used++;
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
}

import { describe, expect, it } from 'vitest';
import { HintManager, hintRules } from './hintManager';

describe('HintManager', () => {
  it('unlocks tiers at 3, 6, 10 and 15 units', () => {
    const h = new HintManager();
    const unlocked: number[] = [];
    h.onTierAvailable((t) => unlocked.push(t));
    for (let i = 0; i < 15; i++) h.recordAttempt();
    expect(unlocked).toEqual([1, 2, 3, 4]);
    expect(h.availableTier()).toBe(4);
  });

  it('reveals one tier at a time and never past what is available', () => {
    const h = new HintManager();
    for (let i = 0; i < 6; i++) h.recordRestart();
    expect(h.reveal()).toBe(1);
    expect(h.reveal()).toBe(2);
    expect(h.reveal()).toBeNull();
  });

  it('counts one unit per 40 moves', () => {
    const h = new HintManager();
    for (let i = 0; i < 39; i++) h.recordMove();
    expect(h.state.units).toBe(0);
    h.recordMove();
    expect(h.state.units).toBe(1);
  });

  it('counts one unit per 3 minutes of active play, pausing when hidden or idle', () => {
    const h = new HintManager();
    h.tick(hintRules.secondsPerUnit);
    expect(h.state.units).toBe(1);

    h.setHidden(true);
    h.tick(hintRules.secondsPerUnit * 2);
    expect(h.state.units).toBe(1);
    h.setHidden(false);

    const fresh = new HintManager();
    fresh.tick(hintRules.idleTimeoutSeconds);
    fresh.tick(hintRules.secondsPerUnit);
    expect(fresh.state.units).toBe(0);
    fresh.recordInput();
    fresh.tick(hintRules.secondsPerUnit);
    expect(fresh.state.units).toBe(1);
  });

  it('reports fill toward the next tier', () => {
    const h = new HintManager();
    expect(h.fill).toBe(0);
    h.addUnit(); // 1 of 3
    expect(h.fill).toBeCloseTo(1 / 3);
    h.addUnit(2); // tier 1 waiting
    expect(h.fill).toBe(1);
    h.reveal();
    expect(h.fill).toBe(0);
  });

  it('resumes from saved units and clues', () => {
    const h = new HintManager(7, 2);
    expect(h.availableTier()).toBe(2);
    expect(h.hasUnrevealed).toBe(false);
  });
});

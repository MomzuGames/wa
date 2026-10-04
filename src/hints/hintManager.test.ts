import { describe, expect, it } from 'vitest';
import { HintManager, hintRules } from './hintManager';

describe('HintManager', () => {
  it('fills the orb over three units of struggle, then stays ready', () => {
    const h = new HintManager();
    expect(h.fill).toBe(0);
    h.recordAttempt();
    expect(h.fill).toBeCloseTo(1 / 3);
    expect(h.ready).toBe(false);
    h.recordRestart();
    h.recordRestart();
    expect(h.fill).toBe(1);
    expect(h.ready).toBe(true);
    h.addUnit(5);
    expect(h.fill).toBe(1);
  });

  it('tells listeners the new total every time struggle grows', () => {
    const h = new HintManager();
    const seen: number[] = [];
    h.onUnits((u) => seen.push(u));
    h.recordAttempt();
    h.addUnit(2);
    expect(seen).toEqual([1, 3]);
  });

  it('counts one unit per 40 moves', () => {
    const h = new HintManager();
    for (let i = 0; i < hintRules.movesPerUnit - 1; i++) h.recordMove();
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

  it('resumes from saved units and hints used, and counts new hints', () => {
    const h = new HintManager(7, 2);
    expect(h.ready).toBe(true);
    h.recordHint();
    expect(h.state).toEqual({ units: 7, used: 3 });
  });
});

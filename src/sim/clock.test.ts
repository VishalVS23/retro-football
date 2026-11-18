import { describe, expect, it } from 'vitest';
import { beforeSnap, callTimeout, canCallTimeout, clockText, endPlay, newClock, playStopsClock, runOff, tickPlay, type ClockState } from './clock';

const R = { quarterLength: 120, huddleRunoff: 5, warningTime: 30, timeoutsPerHalf: 3 };
const at = (quarter: ClockState['quarter'], timeLeft: number, extra: Partial<ClockState> = {}): ClockState => ({
  ...newClock(R),
  quarter,
  timeLeft,
  ...extra,
});

describe('runOff (simulated opponent drive)', () => {
  it('takes the time off and leaves the clock stopped', () => {
    const r = runOff(at(1, 100, { running: true }), 40, R);
    expect(r.event).toBe(null);
    expect(r.clock).toMatchObject({ quarter: 1, timeLeft: 60, running: false });
  });

  it('carries from Q1 into Q2 (rest already taken off)', () => {
    const r = runOff(at(1, 20), 50, R);
    expect(r.event).toBe('endQuarter');
    expect(r.clock).toMatchObject({ quarter: 2, timeLeft: 90 });
  });

  it('ends the half or the game at 0:00', () => {
    expect(runOff(at(2, 20), 20, R).event).toBe('halftime');
    expect(runOff(at(4, 20), 25, R).event).toBe('final');
  });

  it('a drive past the warning uses it up', () => {
    expect(runOff(at(2, 50), 30, R).clock.warned).toBe(true);
    expect(runOff(at(2, 90), 30, R).clock.warned).toBe(false);
    expect(runOff(at(1, 20), 100, R).clock).toMatchObject({ quarter: 2, timeLeft: 40, warned: false });
    expect(runOff(at(1, 20), 115, R).clock).toMatchObject({ quarter: 2, timeLeft: 25, warned: true });
  });
});

describe('clock', () => {
  it('starts in Q1 at 2:00, stopped, with 3 timeouts', () => {
    const c = newClock(R);
    expect(clockText(c)).toBe('Q1 2:00');
    expect(c.running).toBe(false);
    expect(c.timeouts).toBe(3);
  });

  it('runs during a play and never goes below 0:00', () => {
    expect(tickPlay(at(1, 100), 4.5).timeLeft).toBeCloseTo(95.5);
    expect(tickPlay(at(1, 2), 5).timeLeft).toBe(0);
  });

  it('a tackle in bounds keeps it running; incompletions stop it', () => {
    expect(endPlay(at(1, 90), false, R).clock.running).toBe(true);
    expect(endPlay(at(1, 90, { running: true }), true, R).clock.running).toBe(false);
  });

  it('takes the huddle runoff at the snap only while running', () => {
    const run = beforeSnap(at(1, 90, { running: true }), R);
    expect(run.snap).toBe(true);
    expect(run.clock.timeLeft).toBe(85);
    expect(run.clock.running).toBe(false);
    expect(beforeSnap(at(1, 90), R).clock.timeLeft).toBe(90);
  });

  it('a timeout stops the clock (no runoff) and uses one up', () => {
    const c = callTimeout(at(1, 90, { running: true }));
    expect(c.timeouts).toBe(2);
    expect(beforeSnap(c, R).clock.timeLeft).toBe(90);
    // Not allowed when the clock is already stopped or none are left.
    expect(canCallTimeout(at(1, 90))).toBe(false);
    expect(canCallTimeout(at(1, 90, { running: true, timeouts: 0 }))).toBe(false);
    expect(callTimeout(at(1, 90)).timeouts).toBe(3);
  });

  it('the runoff can run out the quarter (no snap)', () => {
    const r = beforeSnap(at(1, 4, { running: true }), R);
    expect(r.snap).toBe(false);
    expect(r.event).toBe('endQuarter');
    expect(clockText(r.clock)).toBe('Q2 2:00');
  });

  it('warning in Q2/Q4 after a play that ends inside 0:30, once per quarter', () => {
    const w = endPlay(at(2, 26), false, R);
    expect(w.event).toBe('warning');
    expect(w.clock.running).toBe(false);
    expect(endPlay(w.clock, false, R).event).toBe(null);
    expect(endPlay(at(1, 26), false, R).event).toBe(null); // not in Q1
  });

  it('warning stops the runoff at exactly 0:30', () => {
    const r = beforeSnap(at(4, 33, { running: true }), R);
    expect(r).toMatchObject({ event: 'warning', snap: false });
    expect(r.clock.timeLeft).toBe(30);
    expect(beforeSnap(r.clock, R)).toMatchObject({ event: null, snap: true });
  });

  it('quarter ends after a play at 0:00; halftime resets timeouts; Q4 is final', () => {
    expect(endPlay(at(1, 0, { timeouts: 1 }), false, R)).toMatchObject({ event: 'endQuarter', clock: { quarter: 2, timeouts: 1 } });
    expect(endPlay(at(2, 0, { timeouts: 0 }), true, R)).toMatchObject({ event: 'halftime', clock: { quarter: 3, timeouts: 3, timeLeft: 120 } });
    expect(endPlay(at(4, 0), false, R).event).toBe('final');
  });

  it('formats time rounded up to whole seconds', () => {
    expect(clockText(at(3, 65))).toBe('Q3 1:05');
    expect(clockText(at(3, 0.2))).toBe('Q3 0:01');
    expect(clockText(at(3, 0))).toBe('Q3 0:00');
  });
});

describe('playStopsClock', () => {
  it('stops for incompletions, out of bounds, scores and turnovers only', () => {
    expect(playStopsClock({ kind: 'spot', x: 40 }, null, false)).toBe(false);
    expect(playStopsClock({ kind: 'spot', x: 40 }, 'firstDown', false)).toBe(false);
    expect(playStopsClock({ kind: 'spot', x: 40 }, null, true)).toBe(true);
    expect(playStopsClock({ kind: 'spot', x: 40 }, 'turnoverOnDowns', false)).toBe(true);
    expect(playStopsClock({ kind: 'spot', x: 5 }, 'safety', false)).toBe(true);
    expect(playStopsClock({ kind: 'incomplete' }, null, false)).toBe(true);
    expect(playStopsClock({ kind: 'touchdown' }, 'touchdown', false)).toBe(true);
  });
});

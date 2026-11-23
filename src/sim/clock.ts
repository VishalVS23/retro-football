/**
 * Game clock: quarters, time left, the huddle runoff between plays, timeouts and the late-quarter
 * warning. Pure rules, no Phaser. Times are game seconds.
 *
 * How it runs:
 * - During a play the clock runs in real time (tickPlay). A play in progress always finishes.
 * - After the play (endPlay): incompletions, out of bounds, scores and turnovers stop it; a tackle
 *   in bounds keeps it running.
 * - If it's still running at the snap, the huddle takes `huddleRunoff` off first (beforeSnap).
 *   A timeout before the snap stops the clock, so no runoff.
 * - In Q2 and Q4 the clock stops once when it reaches `warningTime` (the late-quarter warning).
 * - Overtime (`ot` > 0, college style) is untimed: nothing here moves the clock, no timeouts.
 */

import type { DriveEvent, PlayOutcome } from './drive';

export interface ClockRules {
  quarterLength: number;
  huddleRunoff: number;
  warningTime: number;
  timeoutsPerHalf: number;
}

export type Quarter = 1 | 2 | 3 | 4;

export interface ClockState {
  quarter: Quarter;
  /** Seconds left in the quarter. */
  timeLeft: number;
  /** Still running between plays (the huddle runoff will come off at the snap). */
  running: boolean;
  /** Our timeouts left this half. */
  timeouts: number;
  /** The CPU's timeouts left this half (3g-A; missing = a full set, e.g. in a game saved before 3g). */
  oppTimeouts?: number;
  /** The warning has already been given this quarter. */
  warned: boolean;
  /** Overtime period (1 = OT, 2 = 2OT...); 0 or missing = regulation. Overtime is untimed. */
  ot?: number;
}

/** Something that interrupts the flow between plays. */
export type ClockEvent = 'warning' | 'endQuarter' | 'halftime' | 'final' | null;

export function newClock(r: ClockRules): ClockState {
  return { quarter: 1, timeLeft: r.quarterLength, running: false, timeouts: timeoutsPerHalf(r), warned: false };
}

/** The CPU's timeouts left this half. */
export function oppTimeoutsLeft(c: ClockState, r: ClockRules): number {
  return c.oppTimeouts ?? timeoutsPerHalf(r);
}

function timeoutsPerHalf(r: ClockRules) {
  return Math.max(0, Math.floor(r.timeoutsPerHalf));
}

function hasWarning(q: Quarter) {
  return q === 2 || q === 4;
}

/** Time passing during a play. Stops at 0:00 but the play carries on. */
export function tickPlay(c: ClockState, dt: number): ClockState {
  if (c.ot) return c;
  return { ...c, timeLeft: Math.max(0, c.timeLeft - dt) };
}

/**
 * The play is over. `stops` = this play stops the clock (incomplete, out of bounds, score,
 * turnover). Returns the clock for the next snap and any interruption.
 */
export function endPlay(c: ClockState, stops: boolean, r: ClockRules): { clock: ClockState; event: ClockEvent } {
  if (c.ot) return { clock: { ...c, running: false }, event: null };
  if (c.timeLeft <= 0) return endOfQuarter(c, r);
  if (hasWarning(c.quarter) && !c.warned && c.timeLeft <= r.warningTime) {
    return { clock: { ...c, running: false, warned: true }, event: 'warning' };
  }
  return { clock: { ...c, running: !stops }, event: null };
}

/**
 * About to snap. If the clock kept running, the huddle runoff comes off first; that can run out
 * the quarter (no snap) or reach the warning (clock stops there, no snap yet).
 * `snap` = false means show the event and wait for another tap.
 */
export function beforeSnap(c: ClockState, r: ClockRules): { clock: ClockState; event: ClockEvent; snap: boolean } {
  if (!c.running || c.ot) return { clock: c, event: null, snap: true };
  const after = c.timeLeft - Math.max(0, r.huddleRunoff);
  if (hasWarning(c.quarter) && !c.warned && c.timeLeft > r.warningTime && after <= r.warningTime) {
    return { clock: { ...c, timeLeft: r.warningTime, running: false, warned: true }, event: 'warning', snap: false };
  }
  if (after <= 0) {
    const end = endOfQuarter({ ...c, timeLeft: 0 }, r);
    return { ...end, snap: false };
  }
  return { clock: { ...c, timeLeft: after, running: false }, event: null, snap: true };
}

/** A timeout only helps while the clock is running between plays. */
export function canCallTimeout(c: ClockState): boolean {
  return !c.ot && c.running && c.timeouts > 0;
}

export function callTimeout(c: ClockState): ClockState {
  if (!canCallTimeout(c)) return c;
  return { ...c, running: false, timeouts: c.timeouts - 1 };
}

/**
 * A simulated opponent drive used `seconds`. The clock is stopped after it (change of possession).
 * In Q1/Q3 the drive can carry on into the next quarter (event 'endQuarter', the new quarter
 * already has the rest taken off); in Q2/Q4 it ends the half or the game at 0:00. A drive that
 * passes the late-quarter warning uses it up (no warning on our next snap).
 */
export function runOff(c: ClockState, seconds: number, r: ClockRules): { clock: ClockState; event: ClockEvent } {
  if (c.ot) return { clock: { ...c, running: false }, event: null };
  const left = c.timeLeft - Math.max(0, seconds);
  const pastWarning = (q: Quarter, t: number) => hasWarning(q) && t <= r.warningTime;
  if (left > 0) return { clock: { ...c, timeLeft: left, running: false, warned: c.warned || pastWarning(c.quarter, left) }, event: null };
  const end = endOfQuarter({ ...c, timeLeft: 0 }, r);
  if (end.event !== 'endQuarter') return end;
  const t = Math.max(1, end.clock.timeLeft + left);
  return { clock: { ...end.clock, timeLeft: t, warned: pastWarning(end.clock.quarter, t) }, event: 'endQuarter' };
}

function endOfQuarter(c: ClockState, r: ClockRules): { clock: ClockState; event: ClockEvent } {
  if (c.quarter === 4) return { clock: { ...c, timeLeft: 0, running: false }, event: 'final' };
  const quarter = (c.quarter + 1) as Quarter;
  const halftime = c.quarter === 2;
  return {
    clock: {
      quarter,
      timeLeft: r.quarterLength,
      running: false,
      timeouts: halftime ? timeoutsPerHalf(r) : c.timeouts,
      oppTimeouts: halftime ? timeoutsPerHalf(r) : oppTimeoutsLeft(c, r),
      warned: false,
    },
    event: halftime ? 'halftime' : 'endQuarter',
  };
}

/** "Q2 1:05". Shows whole seconds, rounded up (so 0:00 means truly out of time). Overtime: "OT", "2OT". */
export function clockText(c: ClockState): string {
  if (c.ot) return c.ot === 1 ? 'OT' : `${c.ot}OT`;
  const s = Math.ceil(c.timeLeft - 1e-9);
  const m = Math.floor(s / 60);
  return `Q${c.quarter} ${m}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Does this play stop the clock? Incompletions, out of bounds, scores, turnovers and safeties
 * do; a ball carrier tackled in bounds (first down or not) keeps it running.
 */
export function playStopsClock(outcome: PlayOutcome, event: DriveEvent, outOfBounds: boolean): boolean {
  if (outcome.kind !== 'spot') return true; // incomplete, touchdown, interception, pick six
  return outOfBounds || (event !== null && event !== 'firstDown');
}

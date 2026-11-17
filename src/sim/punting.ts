/**
 * Punting rules: what a tap on the meter does, and where the ball ends up. Pure rules, no Phaser.
 *
 * Same one-tap meter as field goals (see kicking.ts): a marker sweeps across a bar from -1 to +1.
 * Tap in the green = a good punt (centre ~50 yd, edge of the green ~38 yd, drifting a little to
 * that side). Tap in the red = SHANK: short, and it slices hard toward that sideline.
 * Negative = the punter's left = the top of the screen, as for field goals.
 *
 * Where it ends up: lands in their end zone = touchback (their 20); crosses a sideline = their
 * ball where it went out; otherwise it rolls a few yards and stops.
 */
import type { Vec } from './throw';
import { OPP_GOAL_X, OWN_GOAL_X, TOUCHBACK_X } from './drive';
import { FIELD_WIDTH } from './field';

/** The punter stands this far behind the line of scrimmage (a rule of thumb, not feel). */
export const PUNTER_DEPTH = 15;

export interface PuntRules {
  /** Green zone half-width, as a fraction of half the bar. */
  green: number;
  /** Seconds for the marker to cross the bar once. */
  sweepTime: number;
  /** Yards in the air: a perfectly centred tap, and a tap right at the edge of the green. */
  centreYards: number;
  edgeYards: number;
  /** Sideways drift (yards) of a good punt tapped at the edge of the green. */
  spreadYards: number;
  /** Yards in the air of a shank: just outside the green, and at the very end of the bar. */
  shankMaxYards: number;
  shankMinYards: number;
  /** Sideways slice (yards) of the worst shank; a shank just outside the green slices half as much. */
  shankSliceYards: number;
  /** Yards the ball rolls after landing: good punt, shank. */
  rollYards: number;
  shankRollYards: number;
}

export interface PuntKick {
  shank: boolean;
  /** Yards downfield (toward their goal) the ball travels in the air. */
  air: number;
  /** Yards sideways it travels in the air (negative = toward the top of the screen). */
  drift: number;
  /** Yards it rolls after landing, carrying on in the same direction. */
  roll: number;
}

/** What a tap at marker position `m` (-1..1) does. */
export function resolvePunt(m: number, r: PuntRules): PuntKick {
  const g = Math.max(0.01, Math.min(1, r.green));
  const a = Math.min(1, Math.abs(m));
  if (a <= g) {
    const u = a / g; // 0 = centre, 1 = edge of the green
    return { shank: false, air: r.centreYards - (r.centreYards - r.edgeYards) * u, drift: (m / g) * r.spreadYards, roll: r.rollYards };
  }
  const u = g >= 1 ? 1 : (a - g) / (1 - g); // 0 = just outside the green, 1 = end of the bar
  const side = m < 0 ? -1 : 1;
  return {
    shank: true,
    air: r.shankMaxYards - (r.shankMaxYards - r.shankMinYards) * u,
    drift: side * r.shankSliceYards * (0.5 + 0.5 * u),
    roll: r.shankRollYards,
  };
}

export type PuntResult = 'touchback' | 'outOfBounds' | 'downed';

export interface PuntPath {
  /** Where the ball comes down (or where it flew over a sideline). */
  land: Vec;
  /** Where it ends up after the roll (= land if it went out in the air). */
  stop: Vec;
  result: PuntResult;
  /** Where they take over (x, our coordinates). */
  spotX: number;
}

/** Fraction (0..1) along a→b where it crosses a sideline, or null if b is in bounds. */
function sidelineT(a: Vec, b: Vec): number | null {
  if (b.y >= 0 && b.y <= FIELD_WIDTH) return null;
  const edge = b.y < 0 ? 0 : FIELD_WIDTH;
  const dy = b.y - a.y;
  return Math.abs(dy) < 1e-9 ? 0 : Math.max(0, Math.min(1, (edge - a.y) / dy));
}

const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** Spots the ball to a whole yard, never on or behind a goal line. */
function spot(x: number): number {
  return Math.min(OPP_GOAL_X - 1, Math.max(OWN_GOAL_X + 1, Math.round(x)));
}

/** Follows a punt kicked from `from`: the flight, then the roll. */
export function puntPath(from: Vec, k: PuntKick): PuntPath {
  const land = { x: from.x + k.air, y: from.y + k.drift };
  // Over a sideline in the air: out where it crossed (in their end zone that's a touchback).
  const tAir = sidelineT(from, land);
  if (tAir !== null) {
    const out = lerp(from, land, tAir);
    return out.x >= OPP_GOAL_X
      ? { land: out, stop: out, result: 'touchback', spotX: TOUCHBACK_X }
      : { land: out, stop: out, result: 'outOfBounds', spotX: spot(out.x) };
  }
  if (land.x >= OPP_GOAL_X) return { land, stop: land, result: 'touchback', spotX: TOUCHBACK_X };
  // The roll carries on in the direction of flight.
  const len = Math.hypot(k.air, k.drift) || 1;
  const rolled = { x: land.x + (k.air / len) * k.roll, y: land.y + (k.drift / len) * k.roll };
  const tRoll = sidelineT(land, rolled);
  const stop = tRoll !== null ? lerp(land, rolled, tRoll) : rolled;
  if (stop.x >= OPP_GOAL_X) {
    // Rolled into the end zone: touchback. The ball stops just over the goal line.
    const tGoal = (OPP_GOAL_X - land.x) / Math.max(1e-9, rolled.x - land.x);
    return { land, stop: lerp(land, rolled, Math.min(1, tGoal + 0.05)), result: 'touchback', spotX: TOUCHBACK_X };
  }
  return { land, stop, result: tRoll !== null ? 'outOfBounds' : 'downed', spotX: spot(stop.x) };
}

/** Pinned them inside their own 20 (not a touchback). */
export function insideTwenty(p: PuntPath): boolean {
  return p.result !== 'touchback' && p.spotX >= OPP_GOAL_X - 20;
}

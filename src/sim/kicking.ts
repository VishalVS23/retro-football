/**
 * Kicking rules: field goal distance, the one-tap kick meter and what a tap does.
 * Pure rules, no Phaser.
 *
 * The meter: a marker sweeps left and right across a bar (-1 = left end, +1 = right end).
 * The green zone is centred on the bar; its half-width shrinks and the marker speeds up for
 * longer kicks. Tap inside the green = between the uprights (nearer the centre = straighter);
 * outside it = hooks wide to that side. Off-centre taps also lose a little power, so a kick at
 * the edge of range needs a near-perfect tap.
 */
import { END_ZONE_DEPTH } from './field';
import { HOLD_YARDS, OPP_GOAL_X } from './drive';

/** Half the gap between the uprights (18.5 ft wide), in yards. */
export const POST_HALF_WIDTH = 18.5 / 3 / 2;

export interface KickRules {
  /** Longest field goal a perfect tap can make; FIELD GOAL is only offered within this. */
  maxRangeYards: number;
  /** Kicks this short get the easiest meter (nearGreen, nearSweepTime). */
  nearYards: number;
  /** Green zone half-width (fraction of half the bar) for a near kick and a max-range kick. */
  nearGreen: number;
  farGreen: number;
  /** Seconds for the marker to cross the bar once, near and at max range. */
  nearSweepTime: number;
  farSweepTime: number;
  /** Fraction of range lost by a tap at the very end of the bar (0 = no power loss). */
  powerLossRatio: number;
}

/** Distance of a field goal from this line of scrimmage: to the goalposts at the back of the end zone. */
export function fieldGoalDistance(ballX: number): number {
  return Math.round(OPP_GOAL_X - ballX + HOLD_YARDS + END_ZONE_DEPTH);
}

export function inFieldGoalRange(ballX: number, r: Pick<KickRules, 'maxRangeYards'>): boolean {
  return fieldGoalDistance(ballX) <= r.maxRangeYards;
}

/** 0 for a near kick, 1 at max range (clamped). */
function farness(distance: number, r: KickRules): number {
  const span = r.maxRangeYards - r.nearYards;
  if (span <= 0) return 1;
  return Math.max(0, Math.min(1, (distance - r.nearYards) / span));
}

/** How hard this kick's meter is: green zone half-width and seconds per sweep. */
export function kickDifficulty(distance: number, r: KickRules): { green: number; sweepTime: number } {
  const f = farness(distance, r);
  return {
    green: r.nearGreen + (r.farGreen - r.nearGreen) * f,
    sweepTime: r.nearSweepTime + (r.farSweepTime - r.nearSweepTime) * f,
  };
}

/** Marker position after t seconds: starts at the left end, bounces between -1 and +1. */
export function meterPosition(t: number, sweepTime: number): number {
  const s = Math.max(0.05, sweepTime);
  const phase = (Math.max(0, t) / s) % 2; // 0..2
  return phase <= 1 ? -1 + 2 * phase : 3 - 2 * phase;
}

export type KickResult = 'good' | 'wideLeft' | 'wideRight' | 'short';

/**
 * What a tap at marker position `m` does for a kick of `distance` yards.
 * `aim` = where it crosses the goal line sideways, as a fraction of the gap between the uprights
 * (-1 / +1 = right on the left / right upright; negative = kicker's left = top of the screen).
 * `carry` = how far the kick can go.
 */
export function resolveKick(distance: number, m: number, r: KickRules): { result: KickResult; aim: number; carry: number } {
  const { green } = kickDifficulty(distance, r);
  const aim = m / Math.max(0.01, green);
  const carry = r.maxRangeYards * (1 - r.powerLossRatio * Math.min(1, Math.abs(m)));
  let result: KickResult;
  if (Math.abs(aim) > 1) result = aim < 0 ? 'wideLeft' : 'wideRight';
  else if (carry < distance) result = 'short';
  else result = 'good';
  return { result, aim, carry };
}

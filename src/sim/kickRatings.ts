/**
 * Kicker and punter ratings (Stage 3 step 3f). Pure logic, no Phaser.
 *
 * ANCHOR (as in runRatings.ts): a rating counts against the AVERAGE STARTING K / P, so an average
 * kicker plays exactly like the plain feel.ts meter.
 *
 * Kicker: kick power = longest field goal (FIELD GOAL button, coach's tip, and how hard a kick of a
 * given length is); kick accuracy = width of the green zone. On a pressure kick (Q4 last 2 minutes
 * of a one-score game, or overtime) the marker moves faster, less so for a calm kicker
 * (composure + concentration); trait "Ice in his veins" ignores pressure.
 * Punter: kick power = punt distance; kick accuracy = width of the green zone (fewer shanks).
 */
import type { AttributeKey } from '../players/attributes';
import type { Player } from '../players/player';
import type { KickRules } from './kicking';
import type { PuntRules } from './punting';
import { AVERAGE_RATING, scale, type RatingSwitch } from './ratings';

export type KickRole = 'K' | 'P';

/** The average starting kicker / punter (measured over six generated leagues; a test keeps it in step). */
export const KICK_NORMS: Record<KickRole, Partial<Record<AttributeKey, number>>> = {
  K: { kickPower: 12.5, kickAccuracy: 13.2, composure: 10.7, concentration: 10.3 },
  P: { kickPower: 12.8, kickAccuracy: 12.5 },
};

export interface KickRatingParams extends RatingSwitch {
  /** Field goal range, yards per kick-power point. */
  kickRangePerPoint: number;
  /** Green zone width per kick-accuracy point (field goals and extra points). */
  kickGreenPerPoint: number;
  /** Pressure kick: the marker sweeps this much faster at a calm-ness of 10... */
  pressureMeterSpeedUp: number;
  /** ...halved for every this many points of composure + concentration above average (doubled below). */
  pressureHalvingPoints: number;
  /** Punt distance (in the air), yards per kick-power point. */
  puntYardsPerPoint: number;
  /** Punt green zone width per kick-accuracy point. */
  puntGreenPerPoint: number;
}

/** His rating as the game uses it: 10 = the average starter at this role (10 when off / nobody). */
export function kickRating(p: Player | null | undefined, key: AttributeKey, role: KickRole, r: RatingSwitch): number {
  if (!p || !r.enabled) return AVERAGE_RATING;
  return AVERAGE_RATING + p.attributes[key] - (KICK_NORMS[role][key] ?? AVERAGE_RATING);
}

/** The field goal / extra point meter for this kicker: his range and green zone. */
export function kickerRules<T extends KickRules>(k: Player | null | undefined, base: T, r: KickRatingParams): T {
  const power = kickRating(k, 'kickPower', 'K', r);
  const acc = scale(kickRating(k, 'kickAccuracy', 'K', r), r.kickGreenPerPoint, 0.4);
  return {
    ...base,
    maxRangeYards: Math.max(base.nearYards + 10, Math.round(base.maxRangeYards + (power - AVERAGE_RATING) * r.kickRangePerPoint)),
    nearGreen: Math.min(0.9, base.nearGreen * acc),
    farGreen: Math.min(0.9, base.farGreen * acc),
  };
}

/** The punt meter for this punter: distance and green zone (shank yards stay the same). */
export function punterRules<T extends PuntRules>(p: Player | null | undefined, base: T, r: KickRatingParams): T {
  const extra = (kickRating(p, 'kickPower', 'P', r) - AVERAGE_RATING) * r.puntYardsPerPoint;
  const acc = scale(kickRating(p, 'kickAccuracy', 'P', r), r.puntGreenPerPoint, 0.4);
  return {
    ...base,
    centreYards: Math.max(base.shankMaxYards + 5, base.centreYards + extra),
    edgeYards: Math.max(base.shankMaxYards, base.edgeYards + extra),
    green: Math.min(0.9, base.green * acc),
  };
}

export interface KickSituation {
  quarter: number;
  timeLeft: number;
  /** Our score minus theirs, before this kick. */
  margin: number;
  overtime: boolean;
}

/** A pressure kick: overtime, or the last 2 minutes of the 4th quarter in a one-score game. */
export function isPressureKick(s: KickSituation): boolean {
  return s.overtime || (s.quarter >= 4 && s.timeLeft <= 120 && Math.abs(s.margin) <= 8);
}

/**
 * Seconds per sweep on this kick: on a pressure kick the marker is faster by `pressureMeterSpeedUp`,
 * halved per `pressureHalvingPoints` of calm (composure 0.6 + concentration 0.4) above the average
 * kicker; "Ice in his veins" = no change. Also used for punts (calm judged against kickers).
 */
export function pressureSweep(sweepTime: number, k: Player | null | undefined, pressure: boolean, r: KickRatingParams): number {
  if (!pressure) return sweepTime;
  if (k && r.enabled && k.traits.includes('iceVeins')) return sweepTime;
  const calm = 0.6 * kickRating(k, 'composure', 'K', r) + 0.4 * kickRating(k, 'concentration', 'K', r);
  const speedUp = Math.min(1, r.pressureMeterSpeedUp * Math.pow(2, -(calm - AVERAGE_RATING) / r.pressureHalvingPoints));
  return sweepTime / (1 + speedUp);
}

/**
 * The quarterback's ratings on the field (Stage 3d-b). Pure logic.
 *
 * - Throwing power: the ball gets there faster and can go further.
 * - Accuracy (short / medium / deep, blended by throw length): the ball lands somewhere inside a
 *   circle around the aim point instead of exactly on it. The circle grows with distance and under
 *   pressure (composure shrinks the pressure part), and is drawn while aiming, so the risk is
 *   visible before the throw.
 * A 10 everywhere = today's arm, plus a small miss (the one exception to "10 = today").
 */
import type { Player } from '../players/player';
import { attr, halving, scale, type RatingSwitch } from './ratings';
import type { FlightParams, Vec } from './throw';

export interface QbRatingParams extends RatingSwitch {
  /** Ball speed per throwing-power point (flight time divides by 1 + this x (rating - 10)). */
  armSpeedPerPoint: number;
  /** Max throw distance per throwing-power point. */
  armRangePerPoint: number;
  /** Miss circle radius at accuracy 10, unpressured: base + per yard of throw. */
  scatterBaseYards: number;
  scatterPerYard: number;
  /** Every this many accuracy points better than 10 halves the circle (worse doubles it). */
  accuracyHalvingPoints: number;
  /** Under pressure the circle grows by this share (at composure 10)... */
  pressureScatter: number;
  /** ...and every this many composure points better than 10 halves that extra (worse doubles it). */
  composureHalvingPoints: number;
  /** The miss area is an oval: this fraction as long along the throw as across it (misses are mostly wide, rarely long or short). */
  scatterDepthRatio: number;
}

export interface ArmEffect {
  /** Divide flight times by this (1 = today). */
  speed: number;
  /** Multiply max distances by this (1 = today). */
  range: number;
}

export function arm(qb: Player | null | undefined, p: QbRatingParams): ArmEffect {
  const r = attr(qb, 'throwPower', p);
  return { speed: scale(r, p.armSpeedPerPoint, 0.5), range: scale(r, p.armRangePerPoint, 0.5) };
}

/**
 * His accuracy for a throw of `yards`: short accuracy up to the short reference distance, medium at
 * the medium one, deep from the deep one, straight lines in between.
 */
export function accuracyFor(qb: Player | null | undefined, yards: number, f: Pick<FlightParams, 'shortYards' | 'mediumYards' | 'deepYards'>, p: QbRatingParams): number {
  const s = attr(qb, 'shortAccuracy', p);
  const m = attr(qb, 'mediumAccuracy', p);
  const d = attr(qb, 'deepAccuracy', p);
  if (yards <= f.shortYards) return s;
  if (yards <= f.mediumYards) return s + ((m - s) * (yards - f.shortYards)) / (f.mediumYards - f.shortYards);
  if (yards <= f.deepYards) return m + ((d - m) * (yards - f.mediumYards)) / (f.deepYards - f.mediumYards);
  return d;
}

/** Radius (yards) of the circle the ball can land in, for a throw of `yards`. */
export function missRadius(
  qb: Player | null | undefined,
  yards: number,
  pressured: boolean,
  f: Pick<FlightParams, 'shortYards' | 'mediumYards' | 'deepYards'>,
  p: QbRatingParams,
): number {
  const base = p.scatterBaseYards + p.scatterPerYard * Math.max(0, yards);
  // halving() works on chances; the same "halve per N points" curve, uncapped, for a radius.
  const accuracy = halving(1, accuracyFor(qb, yards, f, p), p.accuracyHalvingPoints, Infinity);
  const pressure = pressured ? 1 + halving(p.pressureScatter, attr(qb, 'composure', p), p.composureHalvingPoints, Infinity) : 1;
  return base * accuracy * pressure;
}

/**
 * Where the ball actually lands: a random spot inside the miss oval (evenly spread over its area,
 * never outside it). The oval is `radius` wide across the throw and `radius x depthRatio` along it.
 * `from` = the QB (gives the throw's direction). `u1`, `u2` = two random numbers in [0, 1).
 */
export function missLanding(from: Vec, aim: Vec, radius: number, depthRatio: number, u1: number, u2: number): Vec {
  const r = Math.sqrt(u1);
  const a = u2 * Math.PI * 2;
  const along = r * Math.cos(a) * radius * depthRatio;
  const across = r * Math.sin(a) * radius;
  const len = Math.hypot(aim.x - from.x, aim.y - from.y) || 1;
  const ux = (aim.x - from.x) / len;
  const uy = (aim.y - from.y) / len;
  return { x: aim.x + ux * along - uy * across, y: aim.y + uy * along + ux * across };
}

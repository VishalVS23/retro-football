/**
 * Fumbles. Pure rules, no Phaser.
 * Only a TACKLE can knock the ball loose: diving, sliding and going out of bounds never fumble
 * (that's the reward for avoiding contact). Nobody scoops and runs it back yet: the ball is dead
 * where it came out, and a dice roll decides who falls on it.
 * Stage 3: the carrier's ball security and the tackler's traits scale the chances (`Hit.ratio`); weather later.
 */
import type { Vec } from './throw';

export interface FumbleParams {
  /** Chance a normal tackle knocks the ball out. */
  chance: number;
  /** Chance on a big hit (a tackler at least `bigHitSpeed` fast). */
  bigHitChance: number;
  /** Tacklers this fast (yards/s top speed) deliver big hits: defensive backs, gunners. */
  bigHitSpeed: number;
  /** Chance a sack (the QB brought down behind the line) is a strip sack. */
  stripSackChance: number;
  /** Players this close to the loose ball can fall on it. */
  recoverRadiusYards: number;
}

export interface Hit {
  /** Top speed of whoever made the tackle (undefined = unknown: a normal hit). */
  tacklerSpeed?: number;
  /** The QB was sacked (pass rush got home, or a scramble stopped behind the line). */
  sack?: boolean;
  /** Ratings: x the chance (the carrier's ball security, the tackler's "Goes for the strip"). Default 1. */
  ratio?: number;
  /** Trait "Big hitter": counts as a big hit whatever his speed. */
  bigHitter?: boolean;
}

/**
 * How likely this tackle is to knock the ball loose. A big hit or a sack is never LESS likely than a
 * normal tackle (so turning up `chance` alone raises every kind of tackle).
 */
export function fumbleChance(hit: Hit, p: FumbleParams): number {
  const ratio = hit.ratio ?? 1;
  if (hit.sack) return Math.min(1, Math.max(p.chance, p.stripSackChance) * ratio);
  if (hit.bigHitter || (hit.tacklerSpeed ?? 0) >= p.bigHitSpeed) return Math.min(1, Math.max(p.chance, p.bigHitChance) * ratio);
  return Math.min(1, p.chance * ratio);
}

export function rollFumble(hit: Hit, p: FumbleParams, roll: () => number): boolean {
  return roll() < fumbleChance(hit, p);
}

/**
 * Chance the team that had the ball gets it back: weighted by how many players from each side are
 * within `recoverRadiusYards` of the ball (an even pile = 50/50, nobody near = 50/50).
 */
export function keepChance(ball: Vec, carryingTeam: Vec[], otherTeam: Vec[], p: FumbleParams): number {
  const near = (team: Vec[]) => team.filter((q) => Math.hypot(q.x - ball.x, q.y - ball.y) <= p.recoverRadiusYards).length;
  const ours = near(carryingTeam);
  const theirs = near(otherTeam);
  return (ours + 0.5) / (ours + theirs + 1);
}

/** Who falls on it: true = the team that had the ball keeps it. */
export function rollRecovery(ball: Vec, carryingTeam: Vec[], otherTeam: Vec[], p: FumbleParams, roll: () => number): boolean {
  return roll() < keepChance(ball, carryingTeam, otherTeam, p);
}

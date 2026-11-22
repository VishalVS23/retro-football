/**
 * Ball carriers vs tacklers (Stage 3 step 3e-a). Pure logic, no Phaser.
 *
 * ANCHOR: here a rating counts against the AVERAGE STARTER AT THAT ROLE, not against 10 (players
 * are generated around 12-14 in what their position is good at). An average RB with the ball
 * against average tacklers plays exactly like the plain feel.ts values; a faster / stronger /
 * shiftier player is better, a weaker one worse. The role is the job he's doing on this play (a
 * receiver filling in at corner is judged as a corner, so his poor tackling shows).
 *
 * Carrier: speed (top speed), agility (juke burst, and how often a juke fools a tackler),
 * acceleration (back to full speed after a juke), strength (breaking tackles), ball security
 * (fumbles), trait "Fights for extra yards" (breaks a few more tackles).
 * Tacklers: speed (chase speed), tackling (stops broken tackles), agility + anticipation (not
 * fooled by jukes), traits "Big hitter" (every hit is a big hit) and "Goes for the strip" (more fumbles).
 *
 * Chances move on ODDS (a coin flip at 50% becomes 2:1 = 67% one step up), so they never go
 * below 0 or above 1 however big the gap. Every effect counts once: agility vs agility decides
 * jukes, strength vs tackling decides broken tackles.
 */
import type { AttributeKey } from '../players/attributes';
import type { Player } from '../players/player';
import type { TraitId } from '../players/traits';
import { AVERAGE_RATING, halving, oddsShift, scale, type RatingSwitch } from './ratings';
import type { CarryParams, Pursuer, TackleParams } from './carry';

export type CarrierRole = 'QB' | 'RB' | 'WR';
export type TacklerRole = 'CB' | 'LB' | 'S' | 'DL';

/**
 * The average starter's rating at each role (measured over six generated leagues; a test keeps
 * this in step with the player generator).
 */
export const ROLE_NORMS: Record<CarrierRole | TacklerRole, Partial<Record<AttributeKey, number>>> = {
  QB: { speed: 11.8, acceleration: 9.2, agility: 11.9, strength: 9.2, ballSecurity: 12.1 },
  RB: { speed: 12.6, acceleration: 12.6, agility: 12.6, strength: 12.2, ballSecurity: 12.7 },
  WR: { speed: 12.5, acceleration: 12.1, agility: 11.7, strength: 9.6, ballSecurity: 11.6 },
  CB: { speed: 12.6, agility: 11.7, tackling: 11.6, anticipation: 10.8 },
  LB: { speed: 12.7, agility: 9.4, tackling: 13.8, anticipation: 11.9 },
  S: { speed: 13.0, agility: 9.5, tackling: 13.2, anticipation: 11.5 },
  DL: { speed: 11.7, agility: 7.9, tackling: 12.2, anticipation: 9.4 },
};

export interface RunRatingParams extends RatingSwitch {
  /** Top speed per speed point above / below the role's average (carriers and chasers alike). */
  runSpeedPerPoint: number;
  /** Juke burst (sideways speed) per agility point. */
  jukeBurstPerPoint: number;
  /** Every this many acceleration points halves the time to get back to full speed after a juke. */
  jukeRecoverHalvingPoints: number;
  /** Every this many points of agility edge doubles the odds a juke fools the tackler. */
  elusiveOddsPoints: number;
  /** Every this many points of strength-vs-tackling edge doubles the odds of breaking a tackle. */
  powerOddsPoints: number;
  /** Trait "Fights for extra yards": broken-tackle odds x this. */
  extraYardsOdds: number;
  /** Every this many ball-security points halves his fumble chance (below doubles it). */
  securityHalvingPoints: number;
  /** Trait "Goes for the strip": the fumble chance on his tackles x this. */
  stripFumbleBoost: number;
}

/**
 * His rating as the game should use it: 10 = the average starter at this role. 10 when ratings are
 * switched off or nobody's there.
 */
export function roleRating(p: Player | null | undefined, key: AttributeKey, role: CarrierRole | TacklerRole, r: RatingSwitch): number {
  if (!p || !r.enabled) return AVERAGE_RATING;
  return AVERAGE_RATING + p.attributes[key] - (ROLE_NORMS[role][key] ?? AVERAGE_RATING);
}

const has = (p: Player | null | undefined, trait: TraitId, r: RatingSwitch) => !!p && !!r.enabled && p.traits.includes(trait);

/** The ball carrier's running: top speed, juke burst, recovery after a juke. */
export function carryFor(p: Player | null | undefined, role: CarrierRole, base: CarryParams, r: RunRatingParams): CarryParams {
  return {
    ...base,
    runSpeed: base.runSpeed * scale(roleRating(p, 'speed', role, r), r.runSpeedPerPoint),
    jukeSpeed: base.jukeSpeed * scale(roleRating(p, 'agility', role, r), r.jukeBurstPerPoint),
    jukeRecoverTime:
      base.jukeRecoverTime === undefined ? undefined : base.jukeRecoverTime * halving(1, roleRating(p, 'acceleration', role, r), r.jukeRecoverHalvingPoints, Infinity),
  };
}

/** The ball carrier's side of every tackle: how often he breaks one, and how often a juke fools the tackler. */
export function tackleFor(p: Player | null | undefined, role: CarrierRole, base: TackleParams, r: RunRatingParams): TackleParams {
  const power = (roleRating(p, 'strength', role, r) - AVERAGE_RATING) / r.powerOddsPoints;
  const fights = has(p, 'extraYards', r) ? Math.log2(r.extraYardsOdds) : 0;
  const elusive = (roleRating(p, 'agility', role, r) - AVERAGE_RATING) / r.elusiveOddsPoints;
  return {
    ...base,
    brokenTackleChance: oddsShift(base.brokenTackleChance, power + fights),
    jukeEvadeChance: oddsShift(base.jukeEvadeChance, elusive),
  };
}

/** A chasing defender: his speed, and his side of the tackle (sure tackler, hard to fool). */
export function pursuerFor(d: Player | null | undefined, role: TacklerRole, base: Pursuer, r: RunRatingParams): Pursuer {
  const tackling = roleRating(d, 'tackling', role, r) - AVERAGE_RATING;
  const read = (roleRating(d, 'agility', role, r) + roleRating(d, 'anticipation', role, r)) / 2 - AVERAGE_RATING;
  return {
    ...base,
    speed: base.speed * scale(roleRating(d, 'speed', role, r), r.runSpeedPerPoint),
    brokenSteps: -tackling / r.powerOddsPoints,
    jukeSteps: -read / r.elusiveOddsPoints,
    fumbleRatio: has(d, 'goesForStrip', r) ? r.stripFumbleBoost : 1,
    bigHitter: has(d, 'bigHitter', r),
  };
}

/** The carrier's fumble chance multiplier from his ball security (1 = average at his role). */
export function securityRatio(p: Player | null | undefined, role: CarrierRole, r: RunRatingParams): number {
  return halving(1, roleRating(p, 'ballSecurity', role, r), r.securityHalvingPoints, Infinity);
}

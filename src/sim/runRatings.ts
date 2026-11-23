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
import { BLOCKER_OF, CENTRE } from './formation';
import type { AttributeKey } from '../players/attributes';
import type { Player } from '../players/player';
import type { TraitId } from '../players/traits';
import { AVERAGE_RATING, halving, oddsShift, scale, type RatingSwitch } from './ratings';
import type { CarryParams, Pursuer, TackleParams } from './carry';

export type CarrierRole = 'QB' | 'RB' | 'WR';
export type TacklerRole = 'CB' | 'LB' | 'S' | 'DL';
export type Role = CarrierRole | TacklerRole | 'OL';

/**
 * The average starter's rating at each role (measured over six generated leagues; a test keeps
 * this in step with the player generator).
 */
export const ROLE_NORMS: Record<Role, Partial<Record<AttributeKey, number>>> = {
  QB: { speed: 11.8, acceleration: 9.2, agility: 11.9, strength: 9.2, ballSecurity: 12.1 },
  RB: { speed: 12.6, acceleration: 12.6, agility: 12.6, strength: 12.2, ballSecurity: 12.7 },
  WR: { speed: 12.5, acceleration: 12.1, agility: 11.7, strength: 9.6, ballSecurity: 11.6 },
  CB: { speed: 12.6, agility: 11.7, tackling: 11.6, anticipation: 10.8 },
  LB: { speed: 12.7, agility: 9.4, tackling: 13.8, anticipation: 11.9 },
  S: { speed: 13.0, agility: 9.5, tackling: 13.2, anticipation: 11.5 },
  DL: { speed: 11.7, agility: 7.9, tackling: 12.2, anticipation: 9.4, passRush: 13.1, strength: 13.1 },
  OL: { passBlocking: 13.6, runBlocking: 13.7, strength: 13.6 },
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
export function roleRating(p: Player | null | undefined, key: AttributeKey, role: Role, r: RatingSwitch): number {
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

// ---------- The line (3e-b): each of our blockers vs the rusher across from him ----------

export interface LineRatingParams extends RatingSwitch {
  /** Pass play: how long he holds his man, + this share per point of blocking edge (- per point of deficit). */
  passLinePerPoint: number;
  /** Run play: same for run blocks. */
  runLinePerPoint: number;
  /** Trait "Mauler": his run blocks hold this much longer. */
  maulerRunScale: number;
  /** Trait "Tries to jump the snap": chance per snap he gets off the line early... */
  jumpSnapChance: number;
  /** ...and how much sooner (seconds) he's free of his block when he does. */
  jumpSnapGain: number;
}

/**
 * The blocking edge in this matchup, in rating points (+ = our blocker wins, - = their rusher).
 * Pass: pass blocking vs pass rush (a little strength). Run: run blocking (+ strength) vs strength + tackling.
 */
export function lineEdge(ol: Player | null | undefined, dl: Player | null | undefined, run: boolean, r: RatingSwitch): number {
  const q = (p: Player | null | undefined, key: AttributeKey, role: Role) => roleRating(p, key, role, r);
  if (run) return 0.7 * q(ol, 'runBlocking', 'OL') + 0.3 * q(ol, 'strength', 'OL') - (0.6 * q(dl, 'strength', 'DL') + 0.4 * q(dl, 'tackling', 'DL'));
  return q(ol, 'passBlocking', 'OL') - (0.8 * q(dl, 'passRush', 'DL') + 0.2 * q(dl, 'strength', 'DL'));
}

/** A matchup edge in points as a marker: +1 ours, -1 theirs, 0 even (within `threshold`). */
export function edgeSign(points: number, threshold = 2): -1 | 0 | 1 {
  return points >= threshold ? 1 : points <= -threshold ? -1 : 0;
}

/**
 * When this rusher gets free of his block (seconds after the snap). `wobble` -1..1 is the usual
 * random spread; `roll` is only used (one dice roll) when the rusher tries to jump the snap, so
 * an ordinary snap rolls the dice exactly as before.
 */
export function shedTimeFor(
  ol: Player | null | undefined,
  dl: Player | null | undefined,
  run: boolean,
  base: { shedTime: number; shedTimeVariance: number },
  wobble: number,
  roll: () => number,
  r: LineRatingParams,
): number {
  let t = base.shedTime * Math.max(0.25, 1 + lineEdge(ol, dl, run, r) * (run ? r.runLinePerPoint : r.passLinePerPoint));
  if (run && has(ol, 'mauler', r)) t *= r.maulerRunScale;
  if (has(dl, 'jumpsSnap', r) && roll() < r.jumpSnapChance) t -= r.jumpSnapGain;
  return Math.max(0.1, t + wobble * base.shedTimeVariance);
}

/** When each rusher gets free (3h-a), and which one the centre helped. */
export interface LineSheds {
  shedAt: number[];
  helped: number;
}

/**
 * The whole line for one snap: each rusher i vs his blocker `BLOCKER_OF[i]` (shedTimeFor, dice
 * rolled in that order), then the centre helps: on a pass whoever is about to get free first, on a
 * run the man at the point of attack (`helpOn`, the rusher nearest the hole). That block holds
 * `helpTime` longer (more if the centre wins that matchup, less if he loses it).
 */
export function lineShedTimes(
  line: readonly (Player | null | undefined)[] | undefined,
  rush: readonly (Player | null | undefined)[] | undefined,
  run: boolean,
  base: { shedTime: number; shedTimeVariance: number; helpTime: number },
  rng: () => number,
  r: LineRatingParams,
  helpOn?: number,
): LineSheds {
  const shedAt = BLOCKER_OF.map((b, i) => shedTimeFor(line?.[b], rush?.[i], run, base, rng() * 2 - 1, rng, r));
  let helped = 0;
  shedAt.forEach((t, i) => {
    if (t < shedAt[helped]) helped = i;
  });
  if (helpOn !== undefined) helped = helpOn;
  shedAt[helped] += base.helpTime * Math.max(0.25, 1 + lineEdge(line?.[CENTRE], rush?.[helped], run, r) * (run ? r.runLinePerPoint : r.passLinePerPoint));
  return { shedAt, helped };
}

/** Index of the rusher nearest the hole (a run's point of attack): `rushY` = their y at the snap. */
export function pointOfAttack(rushY: readonly number[], holeY: number): number {
  let best = 0;
  rushY.forEach((y, i) => {
    if (Math.abs(y - holeY) < Math.abs(rushY[best] - holeY)) best = i;
  });
  return best;
}

/** Each rusher's matchup with his own blocker, in rating points (rusher order). */
export function pairEdges(line: readonly (Player | null | undefined)[], rush: readonly (Player | null | undefined)[], run: boolean, r: RatingSwitch): number[] {
  return BLOCKER_OF.map((b, i) => lineEdge(line[b], rush[i], run, r));
}

/**
 * A marker edge for each of our five blockers (formation order): his own rusher's matchup; the
 * centre's is against the rusher with the toughest matchup (the one he'll most likely help on).
 */
export function blockerEdges(line: readonly (Player | null | undefined)[], rush: readonly (Player | null | undefined)[], run: boolean, r: RatingSwitch): number[] {
  const pairs = pairEdges(line, rush, run, r);
  const out = new Array<number>(line.length).fill(0);
  BLOCKER_OF.forEach((b, i) => (out[b] = pairs[i]));
  const worst = pairs.indexOf(Math.min(...pairs));
  out[CENTRE] = lineEdge(line[CENTRE], rush[worst], run, r);
  return out;
}

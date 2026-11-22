/**
 * Receivers vs defenders on a pass play (Stage 3d-c). Pure logic.
 *
 * Receivers: speed and acceleration (how fast he runs his route), route running (how sharp his
 * cuts are), hands (his drop chance). Corners and the linebacker: speed, man coverage (how late he
 * reacts to his man's moves), ball skills (breakups, picks, holding on to picks). The deep safety:
 * zone coverage and anticipation (how fast he reads the throw). Traits: "Wins contested catches"
 * (defenders break up fewer of his balls), "Gambles on interceptions" (more picks, but he guesses
 * more, so cuts fool him). Every value is 1 at a rating of 10 (= today).
 */
import type { Player } from '../players/player';
import type { CoverParams } from './defense';
import { attr, blend, halving, scale, type RatingSwitch } from './ratings';
import type { RunParams } from './routes';

export interface CoverRatingParams extends RatingSwitch {
  /** Top speed per speed point (receivers and defenders alike). */
  speedPerPoint: number;
  /** Acceleration per acceleration point. */
  accelerationPerPoint: number;
  /** Route running: speed kept through a cut, added per point (cutSpeedRatio). */
  cutPerPoint: number;
  /** Hands: every this many points better than 10 halves his drops (worse doubles them). */
  handsHalvingPoints: number;
  /** Man coverage: every this many points better than 10 halves his reaction delay. */
  coverReactionHalvingPoints: number;
  /** Man coverage: how quickly he can stop and turn (momentum), per point. Keeps a fast corner from overrunning stop routes. */
  coverTurnPerPoint: number;
  /** Ball skills: breakup / interception chances per point. */
  ballSkillsPerPoint: number;
  /** Safety: every this many points of (zone coverage + anticipation) better than 10 halves his read time. */
  safetyReadHalvingPoints: number;
  /** "Gambles on interceptions": pick chance x this... */
  gambleInterceptBoost: number;
  /** ...but he guesses more (anticipation + this), so cuts fool him more. */
  gambleAnticipationBonus: number;
  /** "Wins contested catches": defenders' breakup chance on his balls x this. */
  contestedBreakupRatio: number;
}

/** His route running (speed, acceleration, cuts). */
export function receiverRunParams(wr: Player | null | undefined, base: RunParams, p: CoverRatingParams): RunParams {
  return {
    topSpeed: base.topSpeed * scale(attr(wr, 'speed', p), p.speedPerPoint),
    acceleration: base.acceleration * scale(attr(wr, 'acceleration', p), p.accelerationPerPoint),
    cutSpeedRatio: Math.min(0.95, Math.max(0.2, base.cutSpeedRatio + (attr(wr, 'routeRunning', p) - 10) * p.cutPerPoint)),
  };
}

/** His chance of holding on to a catchable ball (his hands make the drop chance smaller or bigger). */
export function receiverCatchChance(wr: Player | null | undefined, base: number, p: CoverRatingParams): number {
  return 1 - halving(1 - base, attr(wr, 'hands', p), p.handsHalvingPoints);
}

const gambles = (d: Player | null | undefined, p: RatingSwitch) => !!d && !!p.enabled && d.traits.includes('gamblesOnPicks');

/** A corner's (or the linebacker's) coverage: speed, reaction to his man's moves, guessing. */
export function coverFor(def: Player | null | undefined, base: CoverParams, p: CoverRatingParams): CoverParams {
  return {
    ...base,
    topSpeed: base.topSpeed * scale(attr(def, 'speed', p), p.speedPerPoint),
    acceleration: base.acceleration * scale(attr(def, 'acceleration', p), p.accelerationPerPoint),
    reactionTime: base.reactionTime * halving(1, attr(def, 'manCoverage', p), p.coverReactionHalvingPoints, Infinity),
    turnAcceleration: base.turnAcceleration === undefined ? undefined : base.turnAcceleration * scale(attr(def, 'manCoverage', p), p.coverTurnPerPoint),
    anticipation: base.anticipation === undefined ? undefined : Math.min(1, base.anticipation + (gambles(def, p) ? p.gambleAnticipationBonus : 0)),
  };
}

/** The deep safety's read: how long after the throw before he breaks on the ball. */
export function safetyReadTime(s: Player | null | undefined, base: number, p: CoverRatingParams): number {
  const read = blend(s, [['zoneCoverage', 1], ['anticipation', 1]], p);
  return base * halving(1, read, p.safetyReadHalvingPoints, Infinity);
}

export interface ContestMods {
  /** Multiplies his breakup chance. */
  breakup: number;
  /** Multiplies his interception chance. */
  intercept: number;
  /** Multiplies his chance of holding on to a ball thrown straight to him. */
  hold: number;
}

/** A defender's ball skills when he contests a pass. */
export function contestMods(def: Player | null | undefined, p: CoverRatingParams): ContestMods {
  const skills = scale(attr(def, 'ballSkills', p), p.ballSkillsPerPoint);
  return {
    breakup: skills,
    intercept: skills * (gambles(def, p) ? p.gambleInterceptBoost : 1),
    hold: scale(attr(def, 'hands', p), p.ballSkillsPerPoint / 2),
  };
}

/** "Wins contested catches": defenders break up fewer of his balls. */
export function contestedCatchRatio(wr: Player | null | undefined, p: CoverRatingParams): number {
  return wr && p.enabled && wr.traits.includes('contestedCatches') ? p.contestedBreakupRatio : 1;
}

/**
 * Matchup hint for the play-call screen: +1 = our receiver has a clear edge on his defender,
 * -1 = the defender does, 0 = even. Speed counts most, then route running vs man coverage.
 */
export function matchupEdge(wr: Player, def: Player, threshold = 2): -1 | 0 | 1 {
  const us = wr.attributes.speed * 0.6 + wr.attributes.routeRunning * 0.4;
  const them = def.attributes.speed * 0.6 + def.attributes.manCoverage * 0.4;
  const d = us - them;
  return d >= threshold ? 1 : d <= -threshold ? -1 : 0;
}

/**
 * Ratings for simulated drives (Stage 3 step 3g-A). Pure logic, no Phaser.
 *
 * A simulated drive (oppDrive.ts) rolls dice per snap. Here the two teams' players on the field
 * turn into small nudges on those dice, one per unit matchup:
 * - passing: QB accuracy + receivers (speed, route running, hands) vs corners and safety (speed,
 *   coverage, ball skills) = completions, yards per catch, big pass plays;
 * - picks: QB decisions vs the defenders' ball skills;
 * - sacks: our two blockers vs their two rushers (the same line edge as the arcade game, 3e-b);
 * - running: RB (speed, agility, strength) + run blocking vs tackling = yards per run, breakaways;
 * - fumbles: the RB's ball security; field goals and punts: the kicker's and punter's ratings (3f).
 *
 * ANCHOR: every rating counts against the average starter at that position (as in 3e / 3f), so two
 * average teams play exactly like the plain feel.ts CPU drive. Each edge is capped (`edgeCap`), so
 * a much better team wins most games but an upset can still happen. The per-point sizes were
 * measured with the arcade sims (passSim / runSim) so an edge means about the same simmed as played.
 */
import type { AttributeKey } from '../players/attributes';
import type { Player } from '../players/player';
import type { Position } from '../players/positions';
import type { DefenseLineup, KickingUnit, OffenseLineup } from '../league/lineup';
import { AVERAGE_RATING, halving, type RatingSwitch } from './ratings';
import { lineEdge } from './runRatings';
import { kickRating, kickerRules, punterRules, type KickRatingParams } from './kickRatings';
import type { KickRules } from './kicking';
import type { PuntRules } from './punting';

/** The average starter's ratings that the sim reads (measured over generated leagues; a test keeps it in step). */
export const SIM_NORMS: Partial<Record<Position, Partial<Record<AttributeKey, number>>>> = {
  QB: { shortAccuracy: 13.1, mediumAccuracy: 13.2, deepAccuracy: 12.6, decisions: 11.3 },
  WR: { speed: 12.6, routeRunning: 12.9, hands: 12.9 },
  RB: { speed: 12.6, agility: 12.6, strength: 12.2, ballSecurity: 12.7 },
  CB: { speed: 12.6, manCoverage: 13.0, ballSkills: 12.1, tackling: 11.6 },
  S: { speed: 13.0, zoneCoverage: 13.7, ballSkills: 12.9, tackling: 13.2 },
  LB: { tackling: 13.8 },
};

export interface SimRatingParams extends KickRatingParams {
  /** Every unit edge (in rating points vs the average starters) is scaled by this (the units add up over a whole game)... */
  simEdgeScale: number;
  /** ...and then capped at +/- this. */
  simEdgeCap: number;
  /** Completions: doublings of the odds of a catch (vs an incompletion) per point of passing edge. */
  simCompletionOddsPerPoint: number;
  /** Yards per catch / per run: share per point of edge. */
  simPassYardsPerPoint: number;
  simRunYardsPerPoint: number;
  /** Big plays (breakaway runs, big pass plays): doublings of the odds per point of edge. */
  simBigPlayOddsPerPoint: number;
  /** Interceptions: halvings of the odds per point of QB decisions over the defenders' ball skills. */
  simPickOddsPerPoint: number;
  /** Sacks: halvings of the odds per point of pass-blocking edge. */
  simSackOddsPerPoint: number;
  /** Field goals: doublings of the make odds per point of kick accuracy. */
  simKickOddsPerPoint: number;
  /** Share of the punter's extra distance that survives the return (net punt yards). */
  simPuntNetShare: number;
  /** Every this many ball-security points above average halves the RB's fumbles. */
  securityHalvingPoints: number;
}

/** What one offense vs one defense does to the drive dice. All zeros / ones = an average matchup. */
export interface DriveMods {
  /** Doublings of the catch odds (negative = more incompletions). */
  completionSteps: number;
  passYards: number;
  runYards: number;
  bigPassSteps: number;
  bigRunSteps: number;
  pickSteps: number;
  sackSteps: number;
  fumbleRatio: number;
  /** Their kicker: extra field goal range (yards) and doublings of the make odds. */
  fgRangeYards: number;
  fgSteps: number;
  /** Their punter: extra net punt yards. */
  puntNetYards: number;
}

export const NEUTRAL_MODS: DriveMods = {
  completionSteps: 0,
  passYards: 1,
  runYards: 1,
  bigPassSteps: 0,
  bigRunSteps: 0,
  pickSteps: 0,
  sackSteps: 0,
  fumbleRatio: 1,
  fgRangeYards: 0,
  fgSteps: 0,
  puntNetYards: 0,
};

/** Points above (+) or below (-) the average starter at `pos`, averaged over `keys`. 0 when off / nobody. */
function edgeOf(p: Player | null | undefined, pos: Position, keys: AttributeKey[], r: RatingSwitch): number {
  if (!p || !r.enabled) return 0;
  let sum = 0;
  for (const k of keys) sum += p.attributes[k] - (SIM_NORMS[pos]?.[k] ?? AVERAGE_RATING);
  return sum / keys.length;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** One team's offense (and its kicker / punter) against the other team's defense. */
export interface SimOffense {
  offense: OffenseLineup;
  kicking: KickingUnit;
}

/** The unit edges, in rating points (+ = the offense's favour), each capped. */
export function unitEdges(o: OffenseLineup, d: DefenseLineup, r: SimRatingParams) {
  const cap = (x: number) => Math.max(-r.simEdgeCap, Math.min(r.simEdgeCap, x * r.simEdgeScale));
  const [wr1, wr3, wr2, rb] = o.skill;
  const corners = d.cover.slice(0, 3);
  const qbAccuracy = edgeOf(o.qb, 'QB', ['shortAccuracy', 'mediumAccuracy', 'deepAccuracy'], r);
  const receivers = mean([wr1, wr3, wr2].map((w) => edgeOf(w, 'WR', ['speed', 'routeRunning', 'hands'], r)));
  const cover = 0.75 * mean(corners.map((c) => edgeOf(c, 'CB', ['speed', 'manCoverage', 'ballSkills'], r))) + 0.25 * edgeOf(d.safety, 'S', ['speed', 'zoneCoverage', 'ballSkills'], r);
  const ballSkills = 0.75 * mean(corners.map((c) => edgeOf(c, 'CB', ['ballSkills'], r))) + 0.25 * edgeOf(d.safety, 'S', ['ballSkills'], r);
  const line = (run: boolean) => (r.enabled ? mean(o.line.map((ol, i) => lineEdge(ol, d.rush[i], run, r))) : 0);
  const tacklers = mean([edgeOf(d.cover[3], 'LB', ['tackling'], r), edgeOf(d.safety, 'S', ['tackling'], r), mean(corners.map((c) => edgeOf(c, 'CB', ['tackling'], r)))]);
  const runner = edgeOf(rb, 'RB', ['speed', 'agility', 'strength'], r);
  return {
    pass: cap(0.5 * qbAccuracy + 0.5 * receivers - cover),
    picks: cap(edgeOf(o.qb, 'QB', ['decisions'], r) - ballSkills),
    passBlock: cap(line(false)),
    run: cap(0.5 * runner + 0.5 * line(true) - tacklers),
    security: edgeOf(rb, 'RB', ['ballSecurity'], r),
  };
}

/** What `o` (with its kicker / punter) vs defense `d` does to the drive dice. */
export function driveMods(o: SimOffense, d: DefenseLineup, base: { kicking: KickRules; punting: PuntRules }, r: SimRatingParams): DriveMods {
  if (!r.enabled) return NEUTRAL_MODS;
  const e = unitEdges(o.offense, d, r);
  return {
    completionSteps: e.pass * r.simCompletionOddsPerPoint,
    passYards: Math.max(0.3, 1 + e.pass * r.simPassYardsPerPoint),
    runYards: Math.max(0.3, 1 + e.run * r.simRunYardsPerPoint),
    bigPassSteps: e.pass * r.simBigPlayOddsPerPoint,
    bigRunSteps: e.run * r.simBigPlayOddsPerPoint,
    pickSteps: -e.picks * r.simPickOddsPerPoint,
    sackSteps: -e.passBlock * r.simSackOddsPerPoint,
    fumbleRatio: halving(1, AVERAGE_RATING + e.security, r.securityHalvingPoints, Infinity),
    fgRangeYards: kickerRules(o.kicking.k, base.kicking, r).maxRangeYards - base.kicking.maxRangeYards,
    fgSteps: (kickRating(o.kicking.k, 'kickAccuracy', 'K', r) - AVERAGE_RATING) * r.simKickOddsPerPoint,
    puntNetYards: (punterRules(o.kicking.p, base.punting, r).centreYards - base.punting.centreYards) * r.simPuntNetShare,
  };
}

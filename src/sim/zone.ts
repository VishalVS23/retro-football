/**
 * Zone coverage (zone calls step Z-a). Pure logic, no Phaser.
 *
 * In man coverage each defender follows one receiver. In a zone each defender has an AREA: he sets
 * up on a landmark, picks up whoever runs into his area and breaks on the ball when it's thrown.
 * Deep defenders stay deeper than the deepest receiver in their lane; underneath defenders carry a
 * receiver through their area but hand him off past `underCarryYards` (the deep man has him).
 *
 * Defender order (same as everywhere else): [CB1 (top wide), CB3 (slot), CB2 (bottom wide), LB1,
 * LB2, S1, S2]. Field coordinates: x along the field (our offense drives toward +x), y across
 * (0 = top sideline). Movement itself reuses `stepCoverage` (corners, LBs) and `stepZoneSafety`
 * (safeties): a zone defender just follows the spot this file gives him.
 */
import type { Feel } from '../config/feel';
import { FIELD_WIDTH, TOTAL_LENGTH } from './field';
import type { Vec } from './throw';

/** The zone calls: Cover 3 (Z-a) and Cover 2 (Z-b). */
export type ZoneCallId = 'cover3' | 'cover2';
export const ZONE_CALL_IDS: readonly ZoneCallId[] = ['cover3', 'cover2'];

/** Which safety look each zone shows (Cover 3: one deep in the middle; Cover 2: two deep halves). */
export const ZONE_SHELL: Record<ZoneCallId, 'robber' | 'twoDeep'> = { cover3: 'robber', cover2: 'twoDeep' };
export function isZoneCall(call: string): call is ZoneCallId {
  return (ZONE_CALL_IDS as readonly string[]).includes(call);
}

export interface ZoneJob {
  /** deep: a deep third / half (stays over the top). under: a short area (hook, curl / flat). */
  kind: 'deep' | 'under';
  /** Where he sets up. */
  spot: Vec;
  /** His lane across the field: receivers with y in [yMin, yMax] are his. */
  yMin: number;
  yMax: number;
  /** Deep only: how far he follows the deepest receiver across (1 = right over him; 0.5 = halfway from his landmark). Default 1. */
  follow?: number;
  /** His own read of the throw (s), instead of the deep / underneath default (Cover 2 halves: more ground, a later read). */
  read?: number;
  /** Deep only: he breaks on balls up to this far in front of his landmark (default `deepBreakYards`). */
  breakFront?: number;
  /** Underneath only: a Cover 2 flat corner who sinks under the outside receiver (see `feel.zone.c2Sink*`). */
  sink?: boolean;
}

/** Number of zone defenders: 3 corners, 2 LBs, 2 safeties. */
export const ZONE_DEFENDERS = 7;

/**
 * Each defender's job in this zone, [CB1, CB3, CB2, LB1, LB2, S1, S2].
 * Cover 3: the outside corners and S1 split the deep field in thirds; the slot corner (top) and S2
 * (bottom, rotating down from the middle) take the curl / flat areas; the LBs the two hooks.
 * Cover 2: S1 / S2 each take a deep half; the outside corners squat in the flats; the slot corner
 * takes the top curl, LB1 the middle hook, LB2 the bottom curl / hook.
 */
export function zoneJobs(call: ZoneCallId, feel: Feel, losX: number): ZoneJob[] {
  const z = feel.zone;
  const mid = FIELD_WIDTH / 2;
  const deep = (yards: number) => Math.min(losX + yards, TOTAL_LENGTH - 1);
  if (call === 'cover2') {
    const half = deep(feel.defense.twoDeepDepthYards);
    const hy = feel.defense.twoDeepHalfYards;
    const flat = deep(z.c2FlatDepthYards);
    const under = deep(z.underDepthYards);
    return [
      { kind: 'under', spot: { x: flat, y: mid - z.c2FlatYards }, yMin: 0, yMax: mid - z.c2FlatInsideYards, sink: true },
      { kind: 'under', spot: { x: under, y: mid - z.c2CurlYards }, yMin: mid - z.c2FlatYards, yMax: mid - z.hookYards },
      { kind: 'under', spot: { x: flat, y: mid + z.c2FlatYards }, yMin: mid + z.c2FlatInsideYards, yMax: FIELD_WIDTH, sink: true },
      { kind: 'under', spot: { x: under, y: mid - z.c2HookYards }, yMin: mid - z.c2CurlYards, yMax: mid + z.c2CurlYards },
      { kind: 'under', spot: { x: under, y: mid + z.c2CurlYards }, yMin: mid + z.hookYards, yMax: mid + z.c2FlatYards },
      { kind: 'deep', spot: { x: half, y: mid - hy }, yMin: 0, yMax: mid, follow: z.c2HalfFollow, read: feel.defense.twoDeepBallReactionTime, breakFront: z.c2DeepBreakYards },
      { kind: 'deep', spot: { x: half, y: mid + hy }, yMin: mid, yMax: FIELD_WIDTH, follow: z.c2HalfFollow, read: feel.defense.twoDeepBallReactionTime, breakFront: z.c2DeepBreakYards },
    ];
  }
  const edge = z.thirdEdgeYards; // the middle third is |y - mid| < edge
  const under = deep(z.underDepthYards);
  const deepThird = deep(z.deepThirdDepthYards);
  return [
    { kind: 'deep', spot: { x: deepThird, y: mid - z.deepThirdSpotYards }, yMin: 0, yMax: mid - edge },
    { kind: 'under', spot: { x: under, y: mid - z.curlFlatYards }, yMin: 0, yMax: mid - z.hookYards },
    { kind: 'deep', spot: { x: deepThird, y: mid + z.deepThirdSpotYards }, yMin: mid + edge, yMax: FIELD_WIDTH },
    { kind: 'under', spot: { x: under, y: mid - z.hookYards }, yMin: mid - z.curlFlatYards, yMax: mid + z.hookYards },
    { kind: 'under', spot: { x: under, y: mid + z.hookYards }, yMin: mid - z.hookYards, yMax: mid + z.curlFlatYards },
    { kind: 'deep', spot: { x: deep(feel.defense.safetyDepthYards), y: mid }, yMin: mid - edge, yMax: mid + edge },
    { kind: 'under', spot: { x: under, y: mid + z.curlFlatYards }, yMin: mid + z.hookYards, yMax: FIELD_WIDTH },
  ];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * A corner / linebacker playing zone job `job`: no man to trail (`zoneParams` in defCalls does the
 * rest), his eyes on the QB but the throw still takes `ballReactionTime` to read and turn on, and
 * a deep defender gives ground at `deepSpeedRatio` of his speed (bailing, not chasing).
 */
export function zoneCoverScale(job: ZoneJob, feel: Feel): { ballReactionTime: number; speedRatio: number } {
  return { ballReactionTime: zoneBallReaction(job, feel), speedRatio: job.kind === 'deep' ? feel.zone.deepSpeedRatio : 1 };
}

/** How long after the throw a zone defender breaks on it (deep: bailing, slower; underneath: eyes on the QB). */
export function zoneBallReaction(job: ZoneJob, feel: Feel): number {
  return job.read ?? (job.kind === 'deep' ? feel.zone.deepBallReactionTime : feel.zone.underBallReactionTime);
}

/**
 * Where a zone defender wants to be this frame, from where the receivers are (only receivers out
 * on a route; a blocker isn't anyone's). Deep: over the top of the deepest receiver in his lane
 * (`deepCushionYards` deeper), else his landmark. Under: on the receiver in his area nearest his
 * landmark, carried at most `underCarryYards` past it; else his landmark.
 */
export function zoneTarget(job: ZoneJob, receivers: Vec[], feel: Feel): Vec {
  const z = feel.zone;
  const lane = receivers.filter((r) => r.y >= job.yMin - z.laneOverlapYards && r.y <= job.yMax + z.laneOverlapYards);
  if (job.kind === 'deep') {
    if (!lane.length) return { ...job.spot };
    const deepest = lane.reduce((a, b) => (b.x > a.x ? b : a));
    // An outside third keeps outside leverage (the inside belongs to the middle-third safety).
    const mid = FIELD_WIDTH / 2;
    const outside = job.yMax <= mid ? -1 : job.yMin >= mid ? 1 : 0;
    return {
      x: Math.min(TOTAL_LENGTH - 1, Math.max(job.spot.x, deepest.x + z.deepCushionYards)),
      y: clamp(job.spot.y + (deepest.y + outside * z.deepLeverageYards - job.spot.y) * (job.follow ?? 1), job.yMin, job.yMax),
    };
  }
  const carry = job.sink ? z.c2SinkCarryYards : z.underCarryYards;
  const reach = job.sink ? z.c2SinkReachYards : z.underReachYards;
  const mine = lane.filter((r) => r.y >= job.yMin && r.y <= job.yMax && r.x <= job.spot.x + carry);
  if (!mine.length) return { ...job.spot };
  const near = mine.reduce((a, b) => (Math.hypot(b.x - job.spot.x, b.y - job.spot.y) < Math.hypot(a.x - job.spot.x, a.y - job.spot.y) ? b : a));
  // He shades toward that receiver but stays in his area: at most `underReachYards` off his landmark
  // (the soft spots between the zones are what beats a zone).
  // A sinking corner (Cover 2) never comes up for a receiver short of his landmark; once one runs past it he drops just ahead of him.
  const dx = job.sink ? clamp(near.x + z.c2SinkLeadYards - job.spot.x, 0, carry) : Math.min(near.x, job.spot.x + carry) - job.spot.x;
  const dy = near.y - job.spot.y;
  const d = Math.hypot(dx, dy);
  const k = d > reach ? reach / d : 1;
  return { x: job.spot.x + dx * k, y: clamp(job.spot.y + dy * k, job.yMin, job.yMax) };
}

/**
 * Does he break on a ball landing here? Only if it comes down in his area: underneath defenders on
 * balls in their lane short of `underBreakDepthYards` past their landmark, deep defenders on balls
 * in their lane no more than `deepBreakYards` in front of theirs. Everyone else stays home.
 */
export function breaksOn(job: ZoneJob, landing: Vec, feel: Feel): boolean {
  const z = feel.zone;
  const m = z.breakMarginYards;
  if (landing.y < job.yMin - m || landing.y > job.yMax + m) return false;
  return job.kind === 'deep' ? landing.x >= job.spot.x - (job.breakFront ?? z.deepBreakYards) : landing.x <= job.spot.x + (job.sink ? z.c2SinkBreakYards : z.underBreakDepthYards);
}

/**
 * Does this zone defender contest a pass landing here only at help strength? Underneath ones do (they
 * rally to tackle), except a sinking Cover 2 corner on a ball deeper than his flat area (he's playing the receiver).
 */
export function contestsAsHelp(job: ZoneJob, landing: Vec, feel: Feel): boolean {
  if (job.kind !== 'under') return false;
  return !(job.sink && landing.x > job.spot.x + feel.zone.underBreakDepthYards);
}


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

/** The zone calls. Z-a: Cover 3 (Z-b adds Cover 2). */
export type ZoneCallId = 'cover3';
export const ZONE_CALL_IDS: readonly ZoneCallId[] = ['cover3'];
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
}

/** Number of zone defenders: 3 corners, 2 LBs, 2 safeties. */
export const ZONE_DEFENDERS = 7;

/**
 * Each defender's job in this zone, [CB1, CB3, CB2, LB1, LB2, S1, S2].
 * Cover 3: the outside corners and S1 split the deep field in thirds; the slot corner (top) and S2
 * (bottom, rotating down from the middle) take the curl / flat areas; the LBs the two hooks.
 */
export function zoneJobs(_call: ZoneCallId, feel: Feel, losX: number): ZoneJob[] {
  const z = feel.zone;
  const mid = FIELD_WIDTH / 2;
  const deep = (yards: number) => Math.min(losX + yards, TOTAL_LENGTH - 1);
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
  return job.kind === 'deep' ? feel.zone.deepBallReactionTime : feel.zone.underBallReactionTime;
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
      y: clamp(deepest.y + outside * z.deepLeverageYards, job.yMin, job.yMax),
    };
  }
  const mine = lane.filter((r) => r.y >= job.yMin && r.y <= job.yMax && r.x <= job.spot.x + z.underCarryYards);
  if (!mine.length) return { ...job.spot };
  const near = mine.reduce((a, b) => (Math.hypot(b.x - job.spot.x, b.y - job.spot.y) < Math.hypot(a.x - job.spot.x, a.y - job.spot.y) ? b : a));
  // He shades toward that receiver but stays in his area: at most `underReachYards` off his landmark
  // (the soft spots between the zones are what beats a zone).
  const dx = Math.min(near.x, job.spot.x + z.underCarryYards) - job.spot.x;
  const dy = near.y - job.spot.y;
  const d = Math.hypot(dx, dy);
  const k = d > z.underReachYards ? z.underReachYards / d : 1;
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
  return job.kind === 'deep' ? landing.x >= job.spot.x - z.deepBreakYards : landing.x <= job.spot.x + z.underBreakDepthYards;
}

